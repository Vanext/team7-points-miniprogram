const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { action, data = {} } = event || {}
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  try {
    if (action === 'getActive') {
      const limit = (data && data.limit) ? Number(data.limit) : 2
      const res = await db.collection('training_bulletins').where({ showOnHome: true }).orderBy('updatedAt', 'desc').limit(limit).get()
      const list = res.data || []
      const packed = list.map(it => {
        const seen = {}
        const named = []
        const rawParts = Array.isArray(it.participants) ? it.participants : []
        rawParts.forEach(p => {
          const k = p && p.openid
          const nm = p && p.nickName
          if (!k || seen[k]) return
          seen[k] = 1
          if (nm && nm !== '未登录' && nm !== '微信用户') named.push({ openid: k, nickName: nm })
        })
        const joined = rawParts.some(p => (p && p.openid) === openid)
        return { bulletin: it, joined, participants: named }
      })
      return { success: true, data: { bulletins: packed } }
    }
    if (action === 'join') {
      const { bulletinId, nickName } = data
      if (!bulletinId) return { success: false, message: '缺少通告ID' }
      const doc = await db.collection('training_bulletins').doc(bulletinId).get()
      const item = doc.data
      if (!item) return { success: false, message: '通告不存在' }
      let participants = Array.isArray(item.participants) ? item.participants.slice() : []
      const max = Number(item.maxParticipants || 0)
      if (max > 0 && participants.length >= max) return { success: false, code: 'FULL', message: '报名已满' }
      // 规范化昵称：占位符或空值时尝试从数据库获取；若仍无有效昵称，则不写入昵称
      let finalName = nickName || ''
      if (!finalName || finalName === '未登录' || finalName === '微信用户') {
        try {
          const ures = await db.collection('users').where({ _openid: openid }).limit(1).get()
          const u = (ures.data && ures.data[0]) || null
          const fetched = (u && (u.nickName || u.nickname || u.realName)) || ''
          finalName = (fetched && fetched !== '未登录' && fetched !== '微信用户') ? fetched : ''
        } catch (_) {
          finalName = ''
        }
      }
      // 去重并更新昵称
      const seen = {}
      const dedup = []
      participants.forEach(p => {
        const k = p && p.openid
        if (!k || seen[k]) return
        seen[k] = 1
        const nm = p.nickName
        dedup.push({ openid: k, nickName: (nm && nm !== '未登录' && nm !== '微信用户') ? nm : '' })
      })
      const idx = dedup.findIndex(p => p.openid === openid)
      if (idx >= 0) { if (finalName) dedup[idx].nickName = finalName } else dedup.push({ openid, nickName: finalName })
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
      const { id, title, content, time, location, isActive = true, showOnHome = false, maxParticipants = 0, reminderTemplateId = '' } = data
      const payload = { title: title || '训练通告', content: content || '', time: time || '', location: location || '', isActive: !!isActive, showOnHome: !!showOnHome, maxParticipants: Number(maxParticipants) || 0, reminderTemplateId: reminderTemplateId || '', updatedAt: db.serverDate() }
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
