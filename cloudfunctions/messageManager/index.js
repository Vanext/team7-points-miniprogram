// 云函数：消息管理系统
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function ensureCollections(names = []) {
  for (const name of names) {
    try { await db.createCollection(name) } catch (e) { /* ignore if exists */ }
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {}, query = {} } = event || {}

  try {
    await ensureCollections(['notifications'])

    if (action === 'create') {
      // 创建新消息
      const { targetOpenid, type, title, content, relatedId } = data
      if (!targetOpenid || !type || !title || !content) {
        throw new Error('缺少必要参数')
      }

      const notification = {
        _openid: targetOpenid,
        type, // audit_result, exchange_status, system
        title,
        content,
        relatedId: relatedId || null,
        isRead: false,
        createTime: db.serverDate(),
        readTime: null
      }

      const result = await db.collection('notifications').add({ data: notification })
      return { success: true, data: { id: result._id } }
    }

    if (action === 'list') {
      // 获取用户消息列表
      const { limit = 20, skip = 0, type } = query
      let where = { _openid: OPENID }
      
      if (type) {
        where.type = type
      }

      const result = await db.collection('notifications')
        .where(where)
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(limit)
        .get()

      return { success: true, data: result.data }
    }

    if (action === 'markRead') {
      // 标记消息为已读
      const { id } = data
      if (!id) throw new Error('缺少消息ID')

      await db.collection('notifications')
        .doc(id)
        .update({
          data: {
            isRead: true,
            readTime: db.serverDate()
          }
        })

      return { success: true }
    }

    if (action === 'markAllRead') {
      // 标记所有消息为已读
      const { type } = data
      let where = { _openid: OPENID, isRead: false }
      
      if (type) {
        where.type = type
      }

      await db.collection('notifications')
        .where(where)
        .update({
          data: {
            isRead: true,
            readTime: db.serverDate()
          }
        })

      return { success: true }
    }

    if (action === 'getUnreadCount') {
      // 获取未读消息数量
      const { type } = query
      let where = { _openid: OPENID, isRead: false }
      
      if (type) {
        where.type = type
      }

      const result = await db.collection('notifications')
        .where(where)
        .count()

      return { success: true, data: { count: result.total } }
    }

    if (action === 'delete') {
      // 删除消息
      const { id } = data
      if (!id) throw new Error('缺少消息ID')

      await db.collection('notifications')
        .doc(id)
        .remove()

      return { success: true }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('messageManager failed', err)
    return { success: false, message: err.message || '操作失败' }
  }
}