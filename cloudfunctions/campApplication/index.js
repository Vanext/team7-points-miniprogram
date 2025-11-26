const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function ensureCollections(names) {
  for (const n of names) {
    try { await db.collection(n).limit(1).get() } catch (_) {}
  }
}

async function assertAdmin(openid) {
  const r = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const u = (r && r.data && r.data[0]) || null
  if (!u || u.isAdmin !== true) throw new Error('无管理员权限')
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {}, query = {} } = event || {}
  try {
    await ensureCollections(['camp_applications'])

    if (action === 'apply') {
      const coll = db.collection('camp_applications')
      const now = db.serverDate()
      const doc = { _openid: OPENID, status: 'pending', applyTime: now }
      await coll.add({ data: doc })
      return { success: true }
    }

    if (action === 'getMyStatus') {
      const coll = db.collection('camp_applications')
      const r = await coll.where({ _openid: OPENID }).orderBy('applyTime', 'desc').limit(1).get()
      const rec = (r.data && r.data[0]) || null
      return { success: true, status: rec ? (rec.status || 'none') : 'none' }
    }

    await assertAdmin(OPENID)

    if (action === 'list') {
      const { status = 'pending', limit = 50, skip = 0 } = query
      const where = status === 'all' ? {} : { status }
      const r = await db.collection('camp_applications').where(where).orderBy('applyTime', 'desc').skip(skip).limit(limit).get()
      const rows = r.data || []
      const openids = [...new Set(rows.map(x => x._openid).filter(Boolean))]
      let userMap = {}
      if (openids.length) {
        const _ = db.command
        const ur = await db.collection('users').where({ _openid: _.in(openids) }).get()
        (ur.data || []).forEach(u => { userMap[u._openid] = u })
      }
      const enriched = rows.map(it => ({
        ...it,
        nickName: (userMap[it._openid] && (userMap[it._openid].nickName || userMap[it._openid].realName)) || '',
        avatarUrl: (userMap[it._openid] && userMap[it._openid].avatarUrl) || ''
      }))
      return { success: true, data: enriched }
    }

    if (action === 'approve') {
      const { id } = data
      if (!id) throw new Error('缺少申请ID')
      await db.collection('camp_applications').doc(id).update({ data: { status: 'approved', approveTime: db.serverDate() } })
      try {
        await cloud.callFunction({ name: 'messageManager', data: { action: 'create', data: { targetOpenid: OPENID, type: 'audit_result', title: '训练营申请已通过', content: '恭喜，您现在可以立即加入训练营', relatedId: id } } })
      } catch (_) {}
      return { success: true }
    }

    if (action === 'reject') {
      const { id, reason = '' } = data
      if (!id) throw new Error('缺少申请ID')
      await db.collection('camp_applications').doc(id).update({ data: { status: 'rejected', rejectTime: db.serverDate(), reason } })
      return { success: true }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
