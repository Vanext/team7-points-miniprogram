// 云函数：管理员管理公告（鉴权 + 增删改查）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertAdmin(openId) {
  const res = await db.collection('users').where({ _openid: openId }).limit(1).get()
  const u = (res && res.data && res.data[0]) || null
  if (!u || u.isAdmin !== true) {
    throw new Error('无管理员权限')
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  try {
    const { action, data = {}, query = {} } = event || {}
    await assertAdmin(OPENID)

    const coll = db.collection('announcements')

    if (action === 'list') {
      const { limit = 20, skip = 0 } = query
      const res = await coll.orderBy('createTime', 'desc').skip(skip).limit(limit).get()
      return { success: true, data: res.data }
    }

    if (action === 'create') {
      const doc = {
        title: data.title || '未命名公告',
        content: data.content || '',
        isActive: data.isActive !== false,
        type: data.type || 'general',
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        createdBy: OPENID
      }
      const res = await coll.add({ data: doc })
      return { success: true, id: res._id }
    }

    if (action === 'update') {
      const { id } = data
      if (!id) throw new Error('缺少公告ID')
      const patch = { ...data }
      delete patch.id
      patch.updateTime = db.serverDate()
      await coll.doc(id).update({ data: patch })
      return { success: true }
    }

    if (action === 'delete') {
      const { id } = data
      if (!id) throw new Error('缺少公告ID')
      await coll.doc(id).remove()
      return { success: true }
    }

    if (action === 'setFeatured') {
      const { ids = [] } = data
      if (!Array.isArray(ids) || ids.length > 3) {
        throw new Error('首页展示最多选择3条')
      }
      // 取消已有首页展示标记
      await coll.where({ showOnHome: true }).update({ data: { showOnHome: false, updateTime: db.serverDate() } })
      // 设置新的两条为首页展示
      for (const id of ids) {
        await coll.doc(id).update({ data: { showOnHome: true, updateTime: db.serverDate() } })
      }
      return { success: true }
    }

    if (action === 'toggleFeatured') {
      const { id, value } = data
      if (!id || typeof value === 'undefined') throw new Error('缺少参数')
      if (value === true) {
        const countRes = await coll.where({ showOnHome: true }).count()
        if ((countRes.total || 0) >= 3) throw new Error('首页展示最多3条')
      }
      await coll.doc(id).update({ data: { showOnHome: !!value, updateTime: db.serverDate() } })
      return { success: true }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('adminManageAnnouncements failed', err)
    return { success: false, message: err.message || '操作失败' }
  }
}
