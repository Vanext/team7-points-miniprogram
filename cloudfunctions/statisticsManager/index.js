// 统计管理云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

function getStartDateByRange(timeRange = '30d') {
  const now = new Date()
  const startDate = new Date(now)
  switch (String(timeRange)) {
    case '7d':
      startDate.setDate(now.getDate() - 7)
      break
    case '30d':
      startDate.setDate(now.getDate() - 30)
      break
    case '90d':
      startDate.setDate(now.getDate() - 90)
      break
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1)
      break
    case 'all':
      return { now, startDate: null }
    default:
      startDate.setDate(now.getDate() - 30)
  }
  return { now, startDate }
}

function toDateSafe(v) {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatYmd(d) {
  const t = toDateSafe(d)
  if (!t) return ''
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

async function assertAdmin(openid) {
  const r = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const u = (r && r.data && r.data[0]) || null
  if (!u || u.isAdmin !== true) throw new Error('无权限访问')
  return u
}

async function fetchAllPaged(query, { pageSize = 200 } = {}) {
  const countRes = await query.count()
  const total = countRes.total || 0
  if (total === 0) return []
  const pages = Math.ceil(total / pageSize)
  const rows = []
  for (let i = 0; i < pages; i++) {
    const res = await query.skip(i * pageSize).limit(pageSize).get()
    rows.push(...(res.data || []))
  }
  return rows
}

async function ensureCollections(names = []) {
  for (const name of names) {
    try { await db.createCollection(name) } catch (e) { /* ignore if exists */ }
  }
}

exports.main = async (event, context) => {
  const { action, data = {} } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'upsertPartner':
        return await upsertPartner(OPENID, data)
      case 'getPartners':
        return await getPartners(OPENID)
      case 'getPersonalStats':
        return await getPersonalStats(OPENID, data)
      case 'getAdminStats':
        return await getAdminStats(OPENID, data)
      case 'getPointsTrend':
        return await getPointsTrend(OPENID, data)
      case 'getActivityStats':
        return await getActivityStats(OPENID, data)
      case 'getExchangeStats':
        return await getExchangeStats(OPENID, data)
      case 'getMemberStats':
        return await getMemberStats(OPENID, data)
      default:
        throw new Error('未知操作')
    }
  } catch (error) {
    console.error('统计管理云函数错误:', error)
    return {
      success: false,
      message: error.message || '操作失败'
    }
  }
}

// ==== Partners 管理 ====
async function upsertPartner(openid, { key = '', fileID = '', name = '' }) {
  await ensureCollections(['partners'])
  const u = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!u.data.length || u.data[0].isAdmin !== true) return { success: false, message: '无权限' }
  if (!key || !fileID) return { success: false, message: '缺少参数' }
  try {
    await db.collection('partners').doc(key).set({ data: { fileID, name, updatedAt: db.serverDate() } })
  } catch (_) {
    await db.collection('partners').doc(key).update({ data: { fileID, name, updatedAt: db.serverDate() } })
  }
  return { success: true }
}

async function getPartners(openid) {
  await ensureCollections(['partners'])
  const keys = ['descente','qrtri','quintanaroo','kse','extra1','extra2']
  const tasks = keys.map(k => db.collection('partners').doc(k).get().then(r => ({ key: k, fileID: (r.data && r.data.fileID) || '', name: (r.data && r.data.name) || '' })).catch(() => ({ key: k, fileID: '', name: '' })))
  const rows = await Promise.all(tasks)
  const fileList = rows.filter(r => r.fileID).map(r => r.fileID)
  const urlMap = {}
  if (fileList.length) {
    try {
      const tmp = await cloud.getTempFileURL({ fileList })
      ;(tmp.fileList || []).forEach(f => {
        if (f && f.fileID) urlMap[f.fileID] = f.tempFileURL || ''
      })
    } catch (_) {}
  }
  const list = rows.map(r => ({ key: r.key, fileID: r.fileID, url: r.fileID ? (urlMap[r.fileID] || '') : '', name: r.name || '' }))
  const map = {}
  list.forEach(it => { map[it.key] = it.fileID || '' })
  return { success: true, data: { list, map } }
}

// 获取个人统计数据
async function getPersonalStats(openid, { timeRange = '30d' }) {
  try {
    const { now, startDate } = getStartDateByRange(timeRange)

    const userRes = await db.collection('users').where({ _openid: openid }).limit(1).get()

    if (userRes.data.length === 0) {
      throw new Error('用户不存在')
    }

    const user = userRes.data[0]

    // 获取积分记录统计
    const pointWhere = startDate
      ? { _openid: openid, submitTime: _.gte(startDate) }
      : { _openid: openid }
    const pointRecords = await fetchAllPaged(
      db.collection('point_records')
        .field({ status: true, points: true, submitTime: true, categoryName: true, activityType: true })
        .where(pointWhere)
        .orderBy('submitTime', 'desc')
    )

    // 获取兑换记录统计
    const exchangeWhere = startDate
      ? { _openid: openid, exchange_time: _.gte(startDate) }
      : { _openid: openid }
    const exchangeRecords = await fetchAllPaged(
      db.collection('exchange_records')
        .field({ status: true, pointsSpent: true, pointsCost: true, exchange_time: true })
        .where(exchangeWhere)
        .orderBy('exchange_time', 'desc')
    )

    // 积分获得统计
    const earnedPoints = pointRecords
      .filter(record => record.status === 'approved' && record.points > 0)
      .reduce((sum, record) => sum + record.points, 0)

    // 积分消费统计
    const spentPoints = exchangeRecords
      .filter(record => record.status !== 'cancelled')
      .reduce((sum, record) => sum + (Number(record.pointsSpent || record.pointsCost || 0) || 0), 0)

    // 活跃天数统计
    const activeDays = new Set()
    pointRecords.forEach(record => {
      const date = formatYmd(record.submitTime)
      if (date) activeDays.add(date)
    })
    exchangeRecords.forEach(record => {
      const date = formatYmd(record.exchange_time)
      if (date) activeDays.add(date)
    })

    // 积分趋势数据
    const pointsTrend = await generatePointsTrend(openid, startDate || new Date(0), now)

    // 活动类型统计
    const activityTypes = {}
    pointRecords.forEach(record => {
      if (record.status === 'approved') {
        const type = record.categoryName || record.activityType || '其他'
        activityTypes[type] = (activityTypes[type] || 0) + record.points
      }
    })

    return {
      success: true,
      data: {
        user: {
          nickname: user.nickName || user.nickname,
          avatarUrl: user.avatarUrl,
          totalPoints: user.totalPoints || 0,
          isAdmin: user.isAdmin || false
        },
        summary: {
          earnedPoints,
          spentPoints,
          activeDays: activeDays.size,
          totalRecords: pointRecords.length,
          totalExchanges: exchangeRecords.length
        },
        pointsTrend,
        activityTypes,
        timeRange
      }
    }
  } catch (error) {
    throw error
  }
}

// 获取管理员统计数据
async function getAdminStats(openid, { timeRange = '30d' }) {
  try {
    await assertAdmin(openid)

    const { now, startDate } = getStartDateByRange(timeRange)

    const totalUsers = ((await db.collection('users').count()).total) || 0
    const activeUsers = ((await db.collection('users').where({ totalPoints: _.gt(0) }).count()).total) || 0

    const pointWhere = startDate ? { submitTime: _.gte(startDate) } : {}
    const exchangeWhere = startDate ? { exchange_time: _.gte(startDate) } : {}

    const pointRecords = await fetchAllPaged(
      db.collection('point_records')
        .field({ status: true, points: true, submitTime: true, categoryName: true, activityType: true, userId: true, _openid: true })
        .where(pointWhere)
        .orderBy('submitTime', 'desc')
    )

    const exchangeRecords = await fetchAllPaged(
      db.collection('exchange_records')
        .field({ status: true, pointsSpent: true, pointsCost: true, exchange_time: true, productId: true })
        .where(exchangeWhere)
        .orderBy('exchange_time', 'desc')
    )

    const totalProducts = ((await db.collection('products').count()).total) || 0

    // 积分发放统计
    const totalPointsIssued = pointRecords
      .filter(record => record.status === 'approved' && record.points > 0)
      .reduce((sum, record) => sum + record.points, 0)

    // 积分消费统计
    const totalPointsSpent = exchangeRecords
      .filter(record => record.status !== 'cancelled')
      .reduce((sum, record) => sum + (Number(record.pointsSpent || record.pointsCost || 0) || 0), 0)

    // 待审核记录数
    const pendingRecords = pointRecords.filter(record => record.status === 'pending').length

    // 活动类型统计
    const activityStats = {}
    pointRecords.forEach(record => {
      if (record.status === 'approved') {
        const type = record.categoryName || record.activityType || '其他'
        if (!activityStats[type]) {
          activityStats[type] = { count: 0, points: 0 }
        }
        activityStats[type].count++
        activityStats[type].points += record.points
      }
    })

    // 商品兑换统计
    const productStats = {}
    exchangeRecords.forEach(record => {
      if (record.status !== 'cancelled') {
        const productId = record.productId
        if (!productStats[productId]) {
          productStats[productId] = { count: 0, points: 0 }
        }
        productStats[productId].count++
        productStats[productId].points += (Number(record.pointsSpent || record.pointsCost || 0) || 0)
      }
    })

    // 用户活跃度排行
    const userActivity = {}
    pointRecords.forEach(record => {
      if (record.status === 'approved') {
        const userId = record.userId || record._openid
        if (!userActivity[userId]) {
          userActivity[userId] = { points: 0, records: 0 }
        }
        userActivity[userId].points += record.points
        userActivity[userId].records++
      }
    })

    // 转换为排行榜格式
    const topBase = Object.entries(userActivity)
      .sort(([,a], [,b]) => b.points - a.points)
      .slice(0, 10)
    const topIds = topBase.map(([userId]) => userId).filter(Boolean)
    const topUsersMap = {}
    const idLike = v => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v)
    const docIds = topIds.filter(idLike)
    const openids = topIds.filter(v => !idLike(v))
    if (docIds.length) {
      const uRes = await db.collection('users').where({ _id: _.in(docIds) }).field({ _id: true, nickName: true, nickname: true, avatarUrl: true, _openid: true }).get()
      ;(uRes.data || []).forEach(u => { topUsersMap[u._id] = u })
    }
    if (openids.length) {
      const uRes = await db.collection('users').where({ _openid: _.in(openids) }).field({ _id: true, nickName: true, nickname: true, avatarUrl: true, _openid: true }).get()
      ;(uRes.data || []).forEach(u => { topUsersMap[u._openid] = u })
    }
    const topUsers = topBase.map(([userId, stats]) => {
      const u = topUsersMap[userId] || null
      return { userId, nickname: (u && (u.nickName || u.nickname)) || '未知用户', avatarUrl: (u && u.avatarUrl) || '', ...stats }
    })

    // 每日趋势数据
    const dailyTrend = await generateDailyTrend(startDate || new Date(0), now)

    return {
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          totalPointsIssued,
          totalPointsSpent,
          pendingRecords,
          totalProducts
        },
        activityStats,
        productStats,
        topUsers,
        dailyTrend,
        timeRange
      }
    }
  } catch (error) {
    throw error
  }
}

// 生成积分趋势数据
async function generatePointsTrend(openid, startDate, endDate) {
  try {
    const records = await fetchAllPaged(
      db.collection('point_records')
        .field({ submitTime: true, points: true })
        .where({
          _openid: openid,
          status: 'approved',
          submitTime: _.gte(startDate).and(_.lte(endDate))
        })
        .orderBy('submitTime', 'asc')
    )

    let cumulativePoints = 0
    const earlierAgg = await db.collection('point_records')
      .aggregate()
      .match({ _openid: openid, status: 'approved', submitTime: _.lt(startDate) })
      .group({ _id: null, total: $.sum('$points') })
      .end()
    const earlierTotal = (earlierAgg.list && earlierAgg.list[0] && earlierAgg.list[0].total) || 0
    cumulativePoints = Number(earlierTotal || 0) || 0

    const dailyPoints = {}
    records.forEach(record => {
      const date = formatYmd(record.submitTime)
      if (!date) return
      dailyPoints[date] = (dailyPoints[date] || 0) + (Number(record.points || 0) || 0)
    })

    const trend = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = formatYmd(currentDate)
      const dailyChange = dailyPoints[dateStr] || 0
      cumulativePoints += dailyChange
      trend.push({ date: dateStr, points: cumulativePoints, change: dailyChange })
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return trend
  } catch (error) {
    throw error
  }
}

// 生成每日趋势数据（管理员）
async function generateDailyTrend(startDate, endDate) {
  try {
    const pointRecords = await fetchAllPaged(
      db.collection('point_records')
        .field({ status: true, points: true, submitTime: true, userId: true, _openid: true })
        .where({ submitTime: _.gte(startDate).and(_.lte(endDate)) })
        .orderBy('submitTime', 'asc')
    )

    const exchangeRecords = await fetchAllPaged(
      db.collection('exchange_records')
        .field({ status: true, pointsSpent: true, pointsCost: true, exchange_time: true, _openid: true })
        .where({ exchange_time: _.gte(startDate).and(_.lte(endDate)) })
        .orderBy('exchange_time', 'asc')
    )

    const dailyData = {}
    
    // 统计每日积分发放
    pointRecords.forEach(record => {
      if (record.status === 'approved' && record.points > 0) {
        const date = formatYmd(record.submitTime)
        if (!date) return
        if (!dailyData[date]) {
          dailyData[date] = { issued: 0, spent: 0, users: new Set() }
        }
        dailyData[date].issued += record.points
        dailyData[date].users.add(record.userId || record._openid)
      }
    })

    // 统计每日积分消费
    exchangeRecords.forEach(record => {
      if (record.status !== 'cancelled') {
        const date = formatYmd(record.exchange_time)
        if (!date) return
        if (!dailyData[date]) {
          dailyData[date] = { issued: 0, spent: 0, users: new Set() }
        }
        dailyData[date].spent += (Number(record.pointsSpent || record.pointsCost || 0) || 0)
        dailyData[date].users.add(record._openid)
      }
    })

    // 转换为数组格式
    const trend = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = formatYmd(currentDate)
      const data = dailyData[dateStr] || { issued: 0, spent: 0, users: new Set() }
      
      trend.push({
        date: dateStr,
        issued: data.issued,
        spent: data.spent,
        activeUsers: data.users.size
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }

    return trend
  } catch (error) {
    throw error
  }
}

// 获取积分趋势（独立接口）
async function getPointsTrend(openid, { timeRange = '30d' }) {
  try {
    const now = new Date()
    let startDate = new Date()
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7)
        break
      case '30d':
        startDate.setDate(now.getDate() - 30)
        break
      case '90d':
        startDate.setDate(now.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1)
        break
      default:
        startDate.setDate(now.getDate() - 30)
    }

    const trend = await generatePointsTrend(openid, startDate, now)
    
    return {
      success: true,
      data: trend
    }
  } catch (error) {
    throw error
  }
}

// 获取活动统计
async function getActivityStats(openid, { timeRange = '30d' }) {
  try {
    const { startDate } = getStartDateByRange(timeRange)
    const where = startDate
      ? { _openid: openid, status: 'approved', submitTime: _.gte(startDate) }
      : { _openid: openid, status: 'approved' }
    const records = await fetchAllPaged(
      db.collection('point_records')
        .field({ categoryName: true, activityType: true, points: true })
        .where(where)
        .orderBy('submitTime', 'desc')
    )

    const activityStats = {}
    records.forEach(record => {
      const type = record.categoryName || record.activityType || '其他'
      if (!activityStats[type]) {
        activityStats[type] = { count: 0, points: 0 }
      }
      activityStats[type].count++
      activityStats[type].points += record.points
    })

    return {
      success: true,
      data: activityStats
    }
  } catch (error) {
    throw error
  }
}

// 获取兑换统计
async function getExchangeStats(openid, { timeRange = '30d' }) {
  try {
    const { startDate } = getStartDateByRange(timeRange)
    const where = startDate
      ? { _openid: openid, exchange_time: _.gte(startDate) }
      : { _openid: openid }
    const records = await fetchAllPaged(
      db.collection('exchange_records')
        .field({ status: true, pointsSpent: true, pointsCost: true })
        .where(where)
        .orderBy('exchange_time', 'desc')
    )

    const exchangeStats = {
      total: records.length,
      completed: records.filter(r => r.status === 'completed').length,
      pending: records.filter(r => r.status === 'pending').length,
      shipped: records.filter(r => r.status === 'shipped').length,
      cancelled: records.filter(r => r.status === 'cancelled').length,
      totalPoints: records
        .filter(r => r.status !== 'cancelled')
        .reduce((sum, r) => sum + (Number(r.pointsSpent || r.pointsCost || 0) || 0), 0)
    }

    return {
      success: true,
      data: exchangeStats
    }
  } catch (error) {
    throw error
  }
}

// 获取成员统计（管理员）
async function getMemberStats(openid, { timeRange = '30d' }) {
  try {
    await assertAdmin(openid)

    const { startDate } = getStartDateByRange(timeRange)
    const from = startDate || new Date(0)

    const agg = await db.collection('point_records')
      .aggregate()
      .match({ status: 'approved', points: _.gt(0), submitTime: _.gte(from), userId: _.exists(true) })
      .group({
        _id: '$userId',
        records: $.sum(1),
        points: $.sum('$points'),
        lastActivity: $.max('$submitTime')
      })
      .end()
    const memberActivity = {}
    ;(agg.list || []).forEach(row => {
      if (!row || !row._id) return
      memberActivity[row._id] = { records: row.records || 0, points: row.points || 0, lastActivity: row.lastActivity || null }
    })

    const users = await fetchAllPaged(
      db.collection('users')
        .field({ _id: true, _openid: true, nickName: true, nickname: true, avatarUrl: true, totalPoints: true, isAdmin: true })
    )

    const memberStats = users.map(user => {
      const activity = memberActivity[user._id] || { records: 0, points: 0, lastActivity: null }
      return {
        userId: user._id,
        openid: user._openid,
        nickname: user.nickName || user.nickname,
        avatarUrl: user.avatarUrl,
        totalPoints: user.totalPoints || 0,
        isAdmin: user.isAdmin || false,
        ...activity
      }
    })

    // 按积分排序
    memberStats.sort((a, b) => b.points - a.points)

    return {
      success: true,
      data: memberStats
    }
  } catch (error) {
    throw error
  }
}
