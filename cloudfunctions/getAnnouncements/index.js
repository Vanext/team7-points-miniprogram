// 云函数：获取公告列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { limit = 10, homeOnly = false } = event || {}
    const coll = db.collection('announcements')
    let query = coll
    if (homeOnly) {
      query = query.where({ showOnHome: true })
    }
    const res = await query
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()

    return { success: true, data: (res && res.data) ? res.data : [] }
  } catch (err) {
    console.error('getAnnouncements failed', err)
    return { success: false, message: err.message || '获取公告失败' }
  }
}
