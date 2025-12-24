const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function ensureCollections(names) {
  for (const n of names) {
    try { await db.createCollection(n) } catch (_) {}
  }
}

async function assertAdmin(openid) {
  const r = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const u = (r && r.data && r.data[0]) || null
  const roles = (u && (u.roles || [])) || []
  const role = u && (u.role || '')
  const flags = [u && u.isAdmin === true, u && u.admin === true, u && u.isSuperAdmin === true, Array.isArray(roles) && roles.includes('admin'), role === 'admin']
  const isAdmin = flags.some(Boolean)
  if (!u || !isAdmin) throw new Error('无管理员权限')
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {}, query = {} } = event || {}
  try {
    await ensureCollections(['camp_applications'])

    if (action === 'apply') {
      const coll = db.collection('camp_applications')
      const now = db.serverDate()
      const camp_id = (data && data.camp_id) || 'camp_hengqin_2026'
      // 读取昵称（用于在申请记录上打标签，便于管理员查看）
      let nickName = ''
      try {
        const userRes = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
        const u = (userRes && userRes.data && userRes.data[0]) || null
        nickName = (u && (u.nickName || u.nickname || u.realName)) || ''
      } catch (_) {}
      // 服务端去重：已有待审核或已通过则不重复创建
      const latestRes = await coll.where({ _openid: OPENID, camp_id }).orderBy('applyTime', 'desc').limit(1).get()
      const latest = (latestRes.data && latestRes.data[0]) || null
      if (latest && (latest.status === 'pending' || latest.status === 'approved')) {
        return { success: true, status: latest.status }
      }
      if (latest && latest.status === 'rejected') {
        await coll.doc(latest._id).update({ data: { status: 'pending', applyTime: now, nickName, camp_id } })
        return { success: true, status: 'pending' }
      }
      await coll.add({ data: { _openid: OPENID, status: 'pending', applyTime: now, nickName, camp_id } })
      return { success: true, status: 'pending' }
    }

    if (action === 'getMyStatus') {
      const coll = db.collection('camp_applications')
      const r = await coll.where({ _openid: OPENID }).orderBy('applyTime', 'desc').limit(1).get()
      const rec = (r.data && r.data[0]) || null
      return { success: true, status: rec ? (rec.status || 'none') : 'none' }
    }

    // 公共统计：无需管理员权限，供前端展示
    if (action === 'approvedCount') {
      const { camp_id = 'camp_hengqin_2026' } = query
      const res = await db.collection('camp_applications').where({ status: 'approved' }).get()
      const rows = (res && res.data) || []
      const filtered = rows.filter(x => !x.camp_id || x.camp_id === camp_id)
      const count = new Set(filtered.map(x => x._openid).filter(Boolean)).size
      return { success: true, count }
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
        try {
          const _ = db.command
          const usersRes = await db.collection('users').where({ _openid: _.in(openids) }).get()
          const list = (usersRes && usersRes.data) || []
          for (const u of list) { userMap[u._openid] = u }
        } catch (_) {}
      }
      const enriched = []
      const seen = new Set()
      for (const it of rows) {
        if (!it) continue
        const nn = ((userMap[it._openid] && (userMap[it._openid].nickName || userMap[it._openid].realName)) || '').trim()
        const key = it._openid || ''
        if (!key) continue
        if (seen.has(key)) continue
        seen.add(key)
        enriched.push({
          ...it,
          nickName: nn,
          avatarUrl: (userMap[it._openid] && userMap[it._openid].avatarUrl) || ''
        })
      }
      return { success: true, data: enriched }
    }


    if (action === 'participantsStats') {
      const { camp_id = 'camp_hengqin_2026', limit = 100, skip = 0 } = query
      const appRes = await db.collection('camp_applications').where({ status: 'approved' }).get()
      const approvedRows = (appRes && appRes.data) || []
      const targetRows = approvedRows.filter(x => !x.camp_id || x.camp_id === camp_id)
      const allOpenids = [...new Set(targetRows.map(x => x._openid).filter(Boolean))]
      const pageOpenids = allOpenids.slice(skip, skip + limit)
      const _ = db.command
      let users = []
      if (pageOpenids.length) {
        const ures = await db.collection('users').where({ _openid: _.in(pageOpenids) }).get()
        users = (ures && ures.data) || []
      }
      let recs = []
      if (pageOpenids.length) {
        const rres = await db.collection('point_records').where({ camp_id, status: 'approved', _openid: _.in(pageOpenids) }).get()
        recs = (rres && rres.data) || []
      }
      const userMap = {}
      for (const u of users) { userMap[u._openid] = u }
      const statMap = {}
      for (const r of recs) {
        const oid = r._openid
        if (!oid) continue
        if (!statMap[oid]) {
          statMap[oid] = { weeks: new Set(), sum: 0, cnt: 0, last: null, weekRates: [] }
        }
        if (r.week_num) statMap[oid].weeks.add(r.week_num)
        if (typeof r.completion_rate === 'number') { statMap[oid].sum += r.completion_rate; statMap[oid].cnt += 1 }
        if (r.week_num) statMap[oid].weekRates.push({ week_num: r.week_num, completion_rate: r.completion_rate || 0 })
        const t = r.submitTime || r._updateTime || null
        if (t) {
          const cur = statMap[oid].last
          if (!cur || new Date(t) > new Date(cur)) statMap[oid].last = t
        }
      }
      const list = []
      for (const oid of pageOpenids) {
        const u = userMap[oid] || {}
        const st = statMap[oid] || { weeks: new Set(), sum: 0, cnt: 0, last: null, weekRates: [] }
        list.push({
          _openid: oid,
          nickName: u.nickName || u.nickname || '匿名用户',
          avatarUrl: u.avatarUrl || '',
          weeksCompleted: Array.from(st.weeks).length,
          avgCompletionRate: st.cnt ? Math.round(st.sum / st.cnt) : 0,
          lastActivity: st.last || null,
          weekRates: st.weekRates.sort((a,b)=> (a.week_num||0)-(b.week_num||0))
        })
      }
      return { success: true, data: list, count: allOpenids.length }
    }

    if (action === 'participantsExport') {
      const { camp_id = 'camp_hengqin_2026' } = query
      const appRes = await db.collection('camp_applications').where({ status: 'approved' }).get()
      const approvedRows = (appRes && appRes.data) || []
      const targetRows = approvedRows.filter(x => !x.camp_id || x.camp_id === camp_id)
      const openids = [...new Set(targetRows.map(x => x._openid).filter(Boolean))]
      const _ = db.command
      const ures = openids.length ? await db.collection('users').where({ _openid: _.in(openids) }).get() : { data: [] }
      const users = (ures && ures.data) || []
      const rres = openids.length ? await db.collection('point_records').where({ camp_id, status: 'approved', _openid: _.in(openids) }).get() : { data: [] }
      const recs = (rres && rres.data) || []
      const userMap = {}
      for (const u of users) { userMap[u._openid] = u }
      const statMap = {}
      for (const r of recs) {
        const oid = r._openid
        if (!oid) continue
        if (!statMap[oid]) statMap[oid] = { weeks: new Set(), sum: 0, cnt: 0, last: null }
        if (r.week_num) statMap[oid].weeks.add(r.week_num)
        if (typeof r.completion_rate === 'number') { statMap[oid].sum += r.completion_rate; statMap[oid].cnt += 1 }
        const t = r.submitTime || r._updateTime || null
        if (t) { const cur = statMap[oid].last; if (!cur || new Date(t) > new Date(cur)) statMap[oid].last = t }
      }
      const rows = []
      rows.push(['openid','nickName','weeksCompleted','avgCompletionRate','lastActivity'].join(','))
      for (const oid of openids) {
        const u = userMap[oid] || {}
        const st = statMap[oid] || { weeks: new Set(), sum: 0, cnt: 0, last: null }
        const weeksCompleted = Array.from(st.weeks).length
        const avgRate = st.cnt ? Math.round(st.sum / st.cnt) : 0
        const last = st.last ? new Date(st.last).toISOString() : ''
        const line = [oid, (u.nickName || u.nickname || '匿名用户').replace(/,/g,' '), String(weeksCompleted), String(avgRate), last]
        rows.push(line.join(','))
      }
      const csv = rows.join('\n')
      try {
        const cloudPath = `t7_exports/camp_participants_${Date.now()}.csv`
        const up = await cloud.uploadFile({ cloudPath, fileContent: Buffer.from(csv, 'utf8') })
        let tempUrl = ''
        try {
          const tr = await cloud.getTempFileURL({ fileList: [up.fileID] })
          tempUrl = (tr && tr.fileList && tr.fileList[0] && tr.fileList[0].tempFileURL) || ''
        } catch (_) {}
        return { success: true, fileID: up.fileID, url: tempUrl, count: openids.length }
      } catch (e) {
        return { success: true, csv, count: openids.length }
      }
    }

    if (action === 'approve') {
      const { id } = data
      if (!id) throw new Error('缺少申请ID')
      const coll = db.collection('camp_applications')
      const rec = await coll.doc(id).get()
      await coll.doc(id).update({ data: { status: 'approved', approveTime: db.serverDate() } })
      try {
        const target = rec && rec.data && rec.data._openid ? rec.data._openid : OPENID
        await cloud.callFunction({ name: 'messageManager', data: { action: 'create', data: { targetOpenid: target, type: 'system', title: '训练营申请已通过', content: '恭喜，您现在可以立即加入训练营', relatedId: id } } })
      } catch (_) {}
      return { success: true }
    }

    if (action === 'reject') {
      const { id, reason = '' } = data
      if (!id) throw new Error('缺少申请ID')
      await db.collection('camp_applications').doc(id).update({ data: { status: 'rejected', rejectTime: db.serverDate(), reason } })
      return { success: true }
    }

    if (action === 'cancelApproved') {
      const { id, reason = '管理员取消通过' } = data
      if (!id) throw new Error('缺少申请ID')
      const coll = db.collection('camp_applications')
      const rec = await coll.doc(id).get()
      const cur = rec && rec.data
      if (!cur) throw new Error('申请不存在')
      if (cur.status !== 'approved') throw new Error('仅已通过的申请可取消')
      await coll.doc(id).update({ data: { status: 'rejected', cancelTime: db.serverDate(), cancelBy: OPENID, cancelReason: reason } })
      try {
        await cloud.callFunction({ name: 'messageManager', data: { action: 'create', data: { targetOpenid: cur._openid, type: 'system', title: '训练营申请已撤回', content: '管理员已撤回通过，当前状态：已拒绝', relatedId: id } } })
      } catch (_) {}
      return { success: true }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
