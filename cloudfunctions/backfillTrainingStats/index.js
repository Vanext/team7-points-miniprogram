const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    // 预加载用户映射，支持按 _openid 回查缺失 userId 的记录
    const usersMapByOpenid = new Map()
    const USERS_PAGE = 1000
    let uOffset = 0
    while (true) {
      const uBatch = await db.collection('users').skip(uOffset).limit(USERS_PAGE).get()
      const uList = uBatch.data || []
      if (!uList.length) break
      for (const u of uList) {
        if (u && u._openid && u._id) usersMapByOpenid.set(u._openid, u._id)
      }
      uOffset += uList.length
      if (uList.length < USERS_PAGE) break
    }

    const PAGE_SIZE = (event && event.pageSize) || 1000
    let offset = 0
    const userAgg = new Map()
    while (true) {
      const res = await db.collection('point_records')
        .where({ status: 'approved' })
        .orderBy('submitTime', 'asc')
        .skip(offset)
        .limit(PAGE_SIZE)
        .get()
      const list = res.data || []
      if (!list.length) break
      for (const record of list) {
        const isTraining = (record.category === 'training') || (record.categoryId === 'training') || (record.formData && record.formData.category === 'training')
        const hasTrainingSignal = (typeof record.selectedHours === 'number' && record.selectedHours > 0) || (typeof record.actual_minutes === 'number' && record.actual_minutes > 0)
        if (!isTraining && !hasTrainingSignal) continue
        let hours = 0
        if (typeof record.selectedHours === 'number' && record.selectedHours > 0) {
          hours = record.selectedHours
        } else if (typeof record.actual_minutes === 'number' && record.actual_minutes > 0) {
          hours = Math.round((record.actual_minutes / 60) * 100) / 100
        } else {
          hours = Math.round((record.points / 2) * 100) / 100
        }
        let d = null
        if (record.date) {
          d = new Date(String(record.date).replace(/-/g, '/'))
        }
        if (!d || isNaN(d.getTime())) {
          d = record.submitTime ? new Date(record.submitTime) : new Date()
        }
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const weekKey = (() => {
          const t = new Date(d.getTime())
          const day = (t.getDay() + 6) % 7
          t.setDate(t.getDate() - day + 3)
          const firstThursday = new Date(t.getFullYear(), 0, 4)
          const diff = t - firstThursday
          const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000))
          return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`
        })()
        const uid = record.userId || usersMapByOpenid.get(record._openid) || ''
        if (!uid) continue
        if (!userAgg.has(uid)) {
          userAgg.set(uid, { totalHours: 0, byMonth: {}, byWeek: {} })
        }
        const agg = userAgg.get(uid)
        agg.totalHours += hours
        agg.byMonth[monthKey] = (agg.byMonth[monthKey] || 0) + hours
        agg.byWeek[weekKey] = (agg.byWeek[weekKey] || 0) + hours
      }
      offset += list.length
      if (list.length < PAGE_SIZE) break
    }
    const userIds = Array.from(userAgg.keys())
    if ((event && event.dryRun) === true) {
      return { success: true, updatedUsers: userIds.length, dryRun: true }
    }
    const usersRes = await db.collection('users').where({ _id: _.in(userIds) }).get()
    const usersMap = {}
    for (const u of (usersRes.data || [])) usersMap[u._id] = u
    for (const uid of userIds) {
      const stats = userAgg.get(uid)
      const u = usersMap[uid]
      if (!u) continue
      await db.collection('users').doc(uid).update({ data: { trainingStats: stats } })
    }
    return { success: true, updatedUsers: userIds.length }
  } catch (err) {
    return { success: false, message: err.message }
  }
}
