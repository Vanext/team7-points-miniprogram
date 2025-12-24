// 云函数：消息管理系统
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

async function ensureCollections(names = []) {
  for (const name of names) {
    try { await db.createCollection(name) } catch (e) { /* ignore if exists */ }
  }
}

function toTs(v) {
  if (!v) return 0
  const d = v instanceof Date ? v : new Date(v)
  const t = d.getTime()
  return Number.isFinite(t) ? t : 0
}

function formatTime(v) {
  const ts = toTs(v)
  if (!ts) return ''
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}`
}

function normalizeNotification(item) {
  const createTime = item.createTime || item.time || null
  return {
    _id: item._id,
    source: 'notifications',
    type: item.type || 'system',
    title: item.title || '系统消息',
    content: item.content || '',
    relatedId: item.relatedId || null,
    isRead: !!item.isRead,
    createTime,
    timeFormatted: formatTime(createTime),
    deletable: true
  }
}

function normalizePointRecord(rec) {
  const status = rec.status
  const title = status === 'approved' ? '积分审核通过' : '积分审核未通过'
  const cat = rec.categoryName ? `（${rec.categoryName}）` : ''
  const reason = rec.rejectReason ? `，原因：${rec.rejectReason}` : ''
  const content = status === 'approved'
    ? `您的积分申请已通过审核，获得 ${Number(rec.points || 0)} 积分${cat}`
    : `您的积分申请未通过审核${cat}${reason}`
  const t = rec.auditTime || rec.submitTime || null
  const isRead = rec.msgIsRead === false ? false : true
  return {
    _id: rec._id,
    source: 'point_records',
    type: 'audit_result',
    title,
    content,
    relatedId: rec._id,
    isRead,
    createTime: t,
    timeFormatted: formatTime(t),
    deletable: false
  }
}

function normalizeExchangeRecord(rec) {
  const status = rec.status
  const name = rec.productName ? `「${rec.productName}」` : '商品'
  let title = '兑换状态更新'
  let content = `您的${name}兑换状态已更新`
  if (status === 'shipped') {
    title = '商品已发货'
    const company = rec.logistics && rec.logistics.company ? String(rec.logistics.company) : ''
    const trackingNumber = rec.logistics && rec.logistics.trackingNumber ? String(rec.logistics.trackingNumber) : ''
    const tail = (company || trackingNumber) ? `，物流公司：${company || '-'}，快递单号：${trackingNumber || '-'}` : ''
    content = `您兑换的${name}已发货${tail}`
  } else if (status === 'completed') {
    title = '兑换完成'
    content = `您的${name}兑换已完成，感谢您的参与！`
  } else if (status === 'cancelled') {
    title = '兑换已取消'
    content = `您的${name}兑换申请已取消`
  } else if (status === 'rejected') {
    title = '兑换未通过'
    content = `您的${name}兑换申请未通过`
  }
  const t = rec.updateTime || rec.finishTime || rec.shipTime || rec.cancelTime || rec.exchange_time || null
  const isRead = rec.msgIsRead === false ? false : true
  return {
    _id: rec._id,
    source: 'exchange_records',
    type: 'exchange_status',
    title,
    content,
    relatedId: rec._id,
    isRead,
    createTime: t,
    timeFormatted: formatTime(t),
    deletable: false
  }
}

function getCleanupBeforeDate(days = 90) {
  const ms = Math.max(1, Number(days) || 90) * 24 * 60 * 60 * 1000
  return new Date(Date.now() - ms)
}

async function cleanupOldNotifications(openid, { keepLatest = 120, olderThanDays = 90 } = {}) {
  if (!openid) return
  const coll = db.collection('notifications')

  const before = getCleanupBeforeDate(olderThanDays)
  try {
    await coll.where({ _openid: openid, createTime: _.lt(before) }).remove()
  } catch (_) {}

  try {
    const over = await coll
      .where({ _openid: openid })
      .orderBy('createTime', 'desc')
      .skip(Math.max(0, keepLatest))
      .limit(100)
      .field({ _id: true })
      .get()
    const ids = (over.data || []).map(d => d._id).filter(Boolean)
    if (ids.length) {
      await coll.where({ _id: _.in(ids) }).remove()
    }
  } catch (_) {}
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
      if (type !== 'system') {
        throw new Error('仅允许创建系统消息')
      }

      const rel = relatedId != null && relatedId !== '' ? relatedId : null
      if (rel) {
        const existed = await db.collection('notifications')
          .where({ _openid: targetOpenid, type, relatedId: rel })
          .orderBy('createTime', 'desc')
          .limit(1)
          .get()

        const hit = existed && existed.data && existed.data[0]
        if (hit && hit._id) {
          await db.collection('notifications')
            .doc(hit._id)
            .update({
              data: {
                title,
                content,
                isRead: false,
                createTime: db.serverDate(),
                readTime: null
              }
            })
          await cleanupOldNotifications(targetOpenid)
          return { success: true, data: { id: hit._id, updated: true } }
        }
      }

      const notification = {
        _openid: targetOpenid,
        type, // audit_result, exchange_status, system
        title,
        content,
        relatedId: rel,
        isRead: false,
        createTime: db.serverDate(),
        readTime: null
      }

      const result = await db.collection('notifications').add({ data: notification })
      await cleanupOldNotifications(targetOpenid)
      return { success: true, data: { id: result._id } }
    }

    if (action === 'aggregateList') {
      const { limit = 20, skip = 0, type } = query
      const activeType = type || 'all'

      if (skip === 0) {
        await cleanupOldNotifications(OPENID)
      }

      const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20))
      const safeSkip = Math.max(0, Number(skip) || 0)

      if (activeType === 'system') {
        const res = await db.collection('notifications')
          .where({ _openid: OPENID, type: 'system' })
          .orderBy('createTime', 'desc')
          .skip(safeSkip)
          .limit(safeLimit)
          .get()
        return { success: true, data: (res.data || []).map(normalizeNotification) }
      }

      if (activeType === 'audit_result') {
        const res = await db.collection('point_records')
          .where({ _openid: OPENID, status: _.in(['approved', 'rejected']), points: _.gt(0) })
          .orderBy('auditTime', 'desc')
          .skip(safeSkip)
          .limit(safeLimit)
          .field({ _id: true, status: true, points: true, categoryName: true, rejectReason: true, auditTime: true, submitTime: true, type: true, msgIsRead: true })
          .get()
        const list = (res.data || []).filter(r => r && r.type !== 'exchange')
        return { success: true, data: list.map(normalizePointRecord) }
      }

      if (activeType === 'exchange_status') {
        const res = await db.collection('exchange_records')
          .where({ _openid: OPENID, status: _.neq('pending') })
          .orderBy('updateTime', 'desc')
          .skip(safeSkip)
          .limit(safeLimit)
          .field({ _id: true, status: true, productName: true, logistics: true, updateTime: true, shipTime: true, finishTime: true, cancelTime: true, exchange_time: true, msgIsRead: true })
          .get()
        return { success: true, data: (res.data || []).map(normalizeExchangeRecord) }
      }

      const need = Math.max(1, safeSkip + safeLimit)

      const fetchInBatches = async (fetcher) => {
        const list = []
        let curSkip = 0
        let loops = 0
        while (list.length < need && loops < 20) {
          const batchLimit = Math.min(100, need - list.length)
          const res = await fetcher({ skip: curSkip, limit: batchLimit })
          const batch = (res && res.data) ? res.data : []
          if (!batch.length) break
          list.push(...batch)
          if (batch.length < batchLimit) break
          curSkip += batch.length
          loops += 1
        }
        return list
      }

      const [sysList, auditList, exList] = await Promise.all([
        fetchInBatches(({ skip: s, limit: l }) => db.collection('notifications')
          .where({ _openid: OPENID, type: 'system' })
          .orderBy('createTime', 'desc')
          .skip(s)
          .limit(l)
          .get()),
        fetchInBatches(({ skip: s, limit: l }) => db.collection('point_records')
          .where({ _openid: OPENID, status: _.in(['approved', 'rejected']), points: _.gt(0) })
          .orderBy('auditTime', 'desc')
          .skip(s)
          .limit(l)
          .field({ _id: true, status: true, points: true, categoryName: true, rejectReason: true, auditTime: true, submitTime: true, type: true, msgIsRead: true })
          .get()),
        fetchInBatches(({ skip: s, limit: l }) => db.collection('exchange_records')
          .where({ _openid: OPENID, status: _.neq('pending') })
          .orderBy('updateTime', 'desc')
          .skip(s)
          .limit(l)
          .field({ _id: true, status: true, productName: true, logistics: true, updateTime: true, shipTime: true, finishTime: true, cancelTime: true, exchange_time: true, msgIsRead: true })
          .get())
      ])

      const sys = (sysList || []).map(normalizeNotification)
      const audit = (auditList || []).filter(r => r && r.type !== 'exchange').map(normalizePointRecord)
      const ex = (exList || []).map(normalizeExchangeRecord)

      const merged = sys.concat(audit).concat(ex).sort((a, b) => toTs(b.createTime) - toTs(a.createTime))
      const sliced = merged.slice(safeSkip, safeSkip + safeLimit)
      return { success: true, data: sliced }
    }

    if (action === 'list') {
      // 获取用户消息列表
      const { limit = 20, skip = 0, type } = query
      let where = { _openid: OPENID }
      
      if (type) {
        where.type = type
      }

      if (skip === 0) {
        await cleanupOldNotifications(OPENID)
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
      const { id, source } = data
      if (!id) throw new Error('缺少消息ID')

      if (source === 'point_records') {
        await db.collection('point_records')
          .doc(id)
          .update({ data: { msgIsRead: true, msgReadTime: db.serverDate() } })
        return { success: true }
      }

      if (source === 'exchange_records') {
        await db.collection('exchange_records')
          .doc(id)
          .update({ data: { msgIsRead: true, msgReadTime: db.serverDate() } })
        return { success: true }
      }

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
      const activeType = type || 'all'

      if (activeType === 'audit_result') {
        await db.collection('point_records')
          .where({ _openid: OPENID, msgIsRead: false, status: _.in(['approved', 'rejected']), points: _.gt(0) })
          .update({ data: { msgIsRead: true, msgReadTime: db.serverDate() } })
        return { success: true }
      }

      if (activeType === 'exchange_status') {
        await db.collection('exchange_records')
          .where({ _openid: OPENID, msgIsRead: false, status: _.neq('pending') })
          .update({ data: { msgIsRead: true, msgReadTime: db.serverDate() } })
        return { success: true }
      }

      if (activeType === 'system') {
        await db.collection('notifications')
          .where({ _openid: OPENID, isRead: false, type: 'system' })
          .update({ data: { isRead: true, readTime: db.serverDate() } })
        return { success: true }
      }

      await Promise.all([
        db.collection('point_records')
          .where({ _openid: OPENID, msgIsRead: false, status: _.in(['approved', 'rejected']), points: _.gt(0) })
          .update({ data: { msgIsRead: true, msgReadTime: db.serverDate() } }),
        db.collection('exchange_records')
          .where({ _openid: OPENID, msgIsRead: false, status: _.neq('pending') })
          .update({ data: { msgIsRead: true, msgReadTime: db.serverDate() } }),
        db.collection('notifications')
          .where({ _openid: OPENID, isRead: false, type: 'system' })
          .update({ data: { isRead: true, readTime: db.serverDate() } })
      ])

      return { success: true }
    }

    if (action === 'getUnreadSummary') {
      const counts = { all: 0, audit_result: 0, exchange_status: 0, system: 0 }
      const [sysAgg, auditCount, exchangeCount] = await Promise.all([
        db.collection('notifications')
          .aggregate()
          .match({ _openid: OPENID, isRead: false, type: 'system' })
          .group({ _id: '$type', count: $.sum(1) })
          .end(),
        db.collection('point_records')
          .where({ _openid: OPENID, msgIsRead: false, status: _.in(['approved', 'rejected']), points: _.gt(0) })
          .count(),
        db.collection('exchange_records')
          .where({ _openid: OPENID, msgIsRead: false, status: _.neq('pending') })
          .count()
      ])

      const sysRow = (sysAgg.list || [])[0]
      counts.system = sysRow ? Number(sysRow.count || 0) : 0
      counts.audit_result = Number(auditCount && auditCount.total ? auditCount.total : 0)
      counts.exchange_status = Number(exchangeCount && exchangeCount.total ? exchangeCount.total : 0)
      counts.all = counts.system + counts.audit_result + counts.exchange_status

      return { success: true, data: { counts } }
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
      const { id, source } = data
      if (!id) throw new Error('缺少消息ID')

      if (source === 'point_records' || source === 'exchange_records') {
        throw new Error('仅系统消息可删除')
      }

      await db.collection('notifications')
        .doc(id)
        .remove()

      return { success: true }
    }

    return { success: false, message: `未知操作: ${action}` }
  } catch (err) {
    console.error('messageManager failed', err)
    return { success: false, message: err.message || '操作失败' }
  }
}
