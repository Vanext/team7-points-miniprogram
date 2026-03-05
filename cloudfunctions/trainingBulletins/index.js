const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function isValidNickName(nm) {
  return !!nm && nm !== '未登录' && nm !== '微信用户' && nm !== '未登记'
}

function normalizeMaxParticipants(v) {
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return 20
}

async function fillNickNamesByOpenIds(openids) {
  const ids = (openids || []).filter(Boolean)
  if (!ids.length) return {}
  const res = await db.collection('users').where({ _openid: _.in(ids) }).field({ _openid: true, nickName: true, nickname: true, realName: true }).limit(200).get()
  const map = {}
  ;(res.data || []).forEach(u => {
    const nm = (u && (u.nickName || u.nickname || u.realName)) || ''
    if (u && u._openid && nm && nm !== '未登录' && nm !== '微信用户') map[u._openid] = nm
  })
  return map
}

exports.main = async (event, context) => {
  const { action, data = {} } = event || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  try {
    if (action === 'getActive') {
      const limit = (data && data.limit) ? Number(data.limit) : 2
      const res = await db.collection('training_bulletins').where({ showOnHome: true }).orderBy('updatedAt', 'desc').limit(limit).get()
      const list = res.data || []
      const packed = []
      for (const it of list) {
        const rawParts = Array.isArray(it.participants) ? it.participants : []
        const seen = {}
        const participants = []
        const missing = []
        rawParts.forEach(p => {
          const k = p && p.openid
          if (!k || seen[k]) return
          seen[k] = 1
          const nm = (p && p.nickName) || ''
          if (!isValidNickName(nm)) missing.push(k)
          participants.push({ openid: k, nickName: isValidNickName(nm) ? nm : '' })
        })

        let fetchedMap = {}
        try {
          fetchedMap = await fillNickNamesByOpenIds(missing)
        } catch (_) {
          fetchedMap = {}
        }

        const filled = participants
          .map(p => {
            const nm = p.nickName || fetchedMap[p.openid] || ''
            return { openid: p.openid, nickName: isValidNickName(nm) ? nm : '' }
          })
          .filter(p => !!p.nickName)

        const joined = rawParts.some(p => (p && p.openid) === openid)
        packed.push({ bulletin: it, joined, participants: filled })
      }
      return { success: true, data: { bulletins: packed } }
    }
    if (action === 'join') {
      const { bulletinId, nickName } = data
      if (!bulletinId) return { success: false, message: '缺少通告ID' }
      const doc = await db.collection('training_bulletins').doc(bulletinId).get()
      const item = doc.data
      if (!item) return { success: false, message: '通告不存在' }
      let participants = Array.isArray(item.participants) ? item.participants.slice() : []
      const seenBefore = {}
      const dedupBefore = []
      participants.forEach(p => {
        const k = p && p.openid
        if (!k || seenBefore[k]) return
        seenBefore[k] = 1
        const nm = (p && p.nickName) || ''
        if (!isValidNickName(nm)) return
        dedupBefore.push({ openid: k, nickName: nm })
      })

      const max = normalizeMaxParticipants(item.maxParticipants)
      if (dedupBefore.length >= max) return { success: false, code: 'FULL', message: '报名已满' }
      let finalName = nickName || ''
      if (!isValidNickName(finalName)) {
        try {
          const ures = await db.collection('users').where({ _openid: openid }).limit(1).get()
          const u = (ures.data && ures.data[0]) || null
          const fetched = (u && (u.nickName || u.nickname || u.realName)) || ''
          finalName = isValidNickName(fetched) ? fetched : ''
        } catch (_) {
          finalName = ''
        }
      }
      if (!isValidNickName(finalName)) return { success: false, code: 'NO_NICK', message: '请先完善昵称后再接龙' }
      const seen = {}
      const dedup = []
      dedupBefore.forEach(p => {
        const k = p && p.openid
        if (!k || seen[k]) return
        seen[k] = 1
        const nm = p.nickName
        dedup.push({ openid: k, nickName: (nm && nm !== '未登录' && nm !== '微信用户') ? nm : '' })
      })
      const idx = dedup.findIndex(p => p.openid === openid)
      if (idx >= 0) { dedup[idx].nickName = finalName } else dedup.push({ openid, nickName: finalName })
      await db.collection('training_bulletins').doc(bulletinId).update({ data: { participants: dedup, updatedAt: db.serverDate() } })
      return { success: true, joined: true }
    }
    if (action === 'leave') {
      const { bulletinId } = data
      if (!bulletinId) return { success: false, message: '缺少通告ID' }
      const doc = await db.collection('training_bulletins').doc(bulletinId).get()
      const item = doc.data
      if (!item) return { success: false, message: '通告不存在' }
      const participants = (item.participants || []).filter(p => p.openid !== openid)
      await db.collection('training_bulletins').doc(bulletinId).update({ data: { participants, updatedAt: db.serverDate() } })
      return { success: true, joined: false }
    }
    if (action === 'upsert') {
      const { id, title, content, time, location, isActive = true, showOnHome = false, maxParticipants = 20, reminderTemplateId = '' } = data
      const payload = { title: title || '训练通告', content: content || '', time: time || '', location: location || '', isActive: !!isActive, showOnHome: !!showOnHome, maxParticipants: normalizeMaxParticipants(maxParticipants), reminderTemplateId: reminderTemplateId || '', updatedAt: db.serverDate() }
      if (id) {
        await db.collection('training_bulletins').doc(id).update({ data: payload })
        const doc = await db.collection('training_bulletins').doc(id).get()
        return { success: true, data: doc.data }
      } else {
        const addRes = await db.collection('training_bulletins').add({ data: { ...payload, participants: [], createdAt: db.serverDate() } })
        return { success: true, data: { _id: addRes._id } }
      }
    }
    if (action === 'sendReminder') {
      const { id, title, time, page = 'pages/home/home' } = data
      if (!id) return { success: false, message: '缺少通告ID' }
      const doc = await db.collection('training_bulletins').doc(id).get()
      const item = doc.data
      if (!item) return { success: false, message: '通告不存在' }
      const tmpl = item.reminderTemplateId || ''
      if (!tmpl) return { success: false, message: '未配置模板ID' }
      const participants = item.participants || []
      let sent = 0
      for (const p of participants) {
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: p.openid,
            templateId: tmpl,
            page,
            data: {
              thing1: { value: (title || item.title || '训练通告') },
              time2: { value: (time || item.time || '') },
              thing3: { value: (item.location || '') }
            },
            miniprogramState: 'developer'
          })
          sent++
        } catch (_) {}
      }
      return { success: true, sent }
    }
    if (action === 'delete') {
      const { id } = data
      if (!id) return { success: false, message: '缺少通告ID' }
      await db.collection('training_bulletins').doc(id).remove()
      return { success: true }
    }
    if (action === 'toggleFeatured') {
      const { id, value } = data
      if (!id) return { success: false, message: '缺少通告ID' }
      await db.collection('training_bulletins').doc(id).update({ data: { showOnHome: !!value, updatedAt: db.serverDate() } })
      return { success: true }
    }
    if (action === 'list') {
      const res = await db.collection('training_bulletins').orderBy('updatedAt', 'desc').limit(20).get()
      return { success: true, data: res.data }
    }
    return { success: false, message: '未知操作' }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
