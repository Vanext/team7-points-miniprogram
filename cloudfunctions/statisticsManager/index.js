// 统计管理云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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
      case 'recordVisit':
        return await recordVisit(OPENID, data)
      case 'getQuickAnalytics':
        return await getQuickAnalytics(OPENID, data)
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

async function recordVisit(openid, { page = '', category = '' }) {
  await ensureCollections(['app_metrics'])
  const coll = db.collection('app_metrics')
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  const docId = `${day}:${category || 'unknown'}:${page || 'unknown'}`
  try {
    await coll.doc(docId).update({ data: { count: _.inc(1), updatedAt: db.serverDate(), lastOpenId: openid } })
  } catch (_) {
    await coll.add({ data: { _id: docId, day, page, category, count: 1, createdAt: db.serverDate(), updatedAt: db.serverDate() } })
  }
  return { success: true }
}

async function getQuickAnalytics(openid, data = {}) {
  await ensureCollections(['app_metrics','point_records','products'])
  // 管理员校验
  const u = await db.collection('users').where({ _openid: openid }).limit(1).get()
  if (!u.data.length || u.data[0].isAdmin !== true) return { success: false, message: '无权限' }
  // 访问统计
  const last = String(data.timeRange || '30d')
  const now = new Date()
  let start = new Date(now)
  let metrics
  if (last === 'all') {
    metrics = await db.collection('app_metrics').get()
  } else {
    if (last === '7d') start.setDate(now.getDate() - 7)
    else start.setDate(now.getDate() - 30)
    const startStr = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`
    metrics = await db.collection('app_metrics').where({ day: _.gte(startStr) }).get()
  }
  const totals = { total: 0, home: 0, tools: 0, upload: 0, store: 0, leaderboard: 0, admin: 0 }
  metrics.data.forEach(m => { totals.total += (m.count||0); const c = (m.category||'unknown'); if (totals[c]!=null) totals[c]+= (m.count||0) })
  // 业务统计（使用真实集合名）
  const prTotal = (await db.collection('point_records').count()).total || 0
  const prAudited = (await db.collection('point_records').where({ status: _.in(['approved','rejected']) }).count()).total || 0
  const productsTotal = (await db.collection('products').count()).total || 0
  // 文本分析
  const rangeText = last==='7d' ? '近7天' : (last==='30d' ? '近30天' : '总累计')
  const summary = `${rangeText}访问总量 ${totals.total}；主页 ${totals.home}，工具 ${totals.tools}，上传 ${totals.upload}，兑换 ${totals.store}，后台 ${totals.admin}。累计上传 ${prTotal}，累计审核 ${prAudited}，上架商品 ${productsTotal}。`
  return { success: true, data: { totals, business: { submissions: prTotal, audits: prAudited, products: productsTotal }, summary, timeRange: last } }
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
  const tasks = keys.map(k => db.collection('partners').doc(k).get().then(r => ({ k, fileID: r.data && r.data.fileID })).catch(() => ({ k, fileID: '' })))
  const rows = await Promise.all(tasks)
  const map = {}
  rows.forEach(r => { map[r.k] = r.fileID || '' })
  return { success: true, data: map }
}

// 获取个人统计数据
async function getPersonalStats(openid, { timeRange = '30d' }) {
  try {
    const now = new Date()
    let startDate = new Date()
    
    // 根据时间范围设置开始日期
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

    // 获取用户基本信息
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userRes.data.length === 0) {
      throw new Error('用户不存在')
    }

    const user = userRes.data[0]

    // 获取积分记录统计
    const pointRecordsRes = await db.collection('pointRecords').where({
      userId: openid,
      createdAt: _.gte(startDate)
    }).get()

    // 获取兑换记录统计
    const exchangeRecordsRes = await db.collection('exchangeRecords').where({
      userId: openid,
      createdAt: _.gte(startDate)
    }).get()

    // 计算统计数据
    const pointRecords = pointRecordsRes.data
    const exchangeRecords = exchangeRecordsRes.data

    // 积分获得统计
    const earnedPoints = pointRecords
      .filter(record => record.status === 'approved' && record.points > 0)
      .reduce((sum, record) => sum + record.points, 0)

    // 积分消费统计
    const spentPoints = exchangeRecords
      .filter(record => record.status !== 'cancelled')
      .reduce((sum, record) => sum + record.pointsCost, 0)

    // 活跃天数统计
    const activeDays = new Set()
    pointRecords.forEach(record => {
      const date = new Date(record.createdAt).toDateString()
      activeDays.add(date)
    })
    exchangeRecords.forEach(record => {
      const date = new Date(record.createdAt).toDateString()
      activeDays.add(date)
    })

    // 积分趋势数据
    const pointsTrend = await generatePointsTrend(openid, startDate, now)

    // 活动类型统计
    const activityTypes = {}
    pointRecords.forEach(record => {
      if (record.status === 'approved') {
        const type = record.activityType || '其他'
        activityTypes[type] = (activityTypes[type] || 0) + record.points
      }
    })

    return {
      success: true,
      data: {
        user: {
          nickname: user.nickname,
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
    // 验证管理员权限
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userRes.data.length === 0 || !userRes.data[0].isAdmin) {
      throw new Error('无权限访问')
    }

    const now = new Date()
    let startDate = new Date()
    
    // 根据时间范围设置开始日期
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

    // 获取所有用户统计
    const usersRes = await db.collection('users').get()
    const totalUsers = usersRes.data.length
    const activeUsers = usersRes.data.filter(user => user.totalPoints > 0).length

    // 获取积分记录统计
    const pointRecordsRes = await db.collection('pointRecords').where({
      createdAt: _.gte(startDate)
    }).get()

    // 获取兑换记录统计
    const exchangeRecordsRes = await db.collection('exchangeRecords').where({
      createdAt: _.gte(startDate)
    }).get()

    // 获取商品统计
    const productsRes = await db.collection('products').get()

    const pointRecords = pointRecordsRes.data
    const exchangeRecords = exchangeRecordsRes.data
    const products = productsRes.data

    // 积分发放统计
    const totalPointsIssued = pointRecords
      .filter(record => record.status === 'approved' && record.points > 0)
      .reduce((sum, record) => sum + record.points, 0)

    // 积分消费统计
    const totalPointsSpent = exchangeRecords
      .filter(record => record.status !== 'cancelled')
      .reduce((sum, record) => sum + record.pointsCost, 0)

    // 待审核记录数
    const pendingRecords = pointRecords.filter(record => record.status === 'pending').length

    // 活动类型统计
    const activityStats = {}
    pointRecords.forEach(record => {
      if (record.status === 'approved') {
        const type = record.activityType || '其他'
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
        productStats[productId].points += record.pointsCost
      }
    })

    // 用户活跃度排行
    const userActivity = {}
    pointRecords.forEach(record => {
      if (record.status === 'approved') {
        const userId = record.userId
        if (!userActivity[userId]) {
          userActivity[userId] = { points: 0, records: 0 }
        }
        userActivity[userId].points += record.points
        userActivity[userId].records++
      }
    })

    // 转换为排行榜格式
    const topUsers = Object.entries(userActivity)
      .sort(([,a], [,b]) => b.points - a.points)
      .slice(0, 10)
      .map(([userId, stats]) => {
        const user = usersRes.data.find(u => u._openid === userId)
        return {
          userId,
          nickname: (user && user.nickname) || '未知用户',
          avatarUrl: (user && user.avatarUrl) || '',
          ...stats
        }
      })

    // 每日趋势数据
    const dailyTrend = await generateDailyTrend(startDate, now)

    return {
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          totalPointsIssued,
          totalPointsSpent,
          pendingRecords,
          totalProducts: products.length
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
    const records = await db.collection('pointRecords').where({
      userId: openid,
      status: 'approved',
      createdAt: _.gte(startDate).and(_.lte(endDate))
    }).orderBy('createdAt', 'asc').get()

    const trend = []
    let cumulativePoints = 0
    
    // 获取起始积分
    const earlierRecords = await db.collection('pointRecords').where({
      userId: openid,
      status: 'approved',
      createdAt: _.lt(startDate)
    }).get()
    
    cumulativePoints = earlierRecords.data.reduce((sum, record) => sum + record.points, 0)

    // 按日期分组
    const dailyPoints = {}
    records.data.forEach(record => {
      const date = new Date(record.createdAt).toDateString()
      if (!dailyPoints[date]) {
        dailyPoints[date] = 0
      }
      dailyPoints[date] += record.points
    })

    // 生成每日趋势
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = currentDate.toDateString()
      const dailyChange = dailyPoints[dateStr] || 0
      cumulativePoints += dailyChange
      
      trend.push({
        date: dateStr,
        points: cumulativePoints,
        change: dailyChange
      })
      
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
    const pointRecords = await db.collection('pointRecords').where({
      createdAt: _.gte(startDate).and(_.lte(endDate))
    }).get()

    const exchangeRecords = await db.collection('exchangeRecords').where({
      createdAt: _.gte(startDate).and(_.lte(endDate))
    }).get()

    const dailyData = {}
    
    // 统计每日积分发放
    pointRecords.data.forEach(record => {
      if (record.status === 'approved' && record.points > 0) {
        const date = new Date(record.createdAt).toDateString()
        if (!dailyData[date]) {
          dailyData[date] = { issued: 0, spent: 0, users: new Set() }
        }
        dailyData[date].issued += record.points
        dailyData[date].users.add(record.userId)
      }
    })

    // 统计每日积分消费
    exchangeRecords.data.forEach(record => {
      if (record.status !== 'cancelled') {
        const date = new Date(record.createdAt).toDateString()
        if (!dailyData[date]) {
          dailyData[date] = { issued: 0, spent: 0, users: new Set() }
        }
        dailyData[date].spent += record.pointsCost
        dailyData[date].users.add(record.userId)
      }
    })

    // 转换为数组格式
    const trend = []
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateStr = currentDate.toDateString()
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

    const records = await db.collection('pointRecords').where({
      userId: openid,
      status: 'approved',
      createdAt: _.gte(startDate)
    }).get()

    const activityStats = {}
    records.data.forEach(record => {
      const type = record.activityType || '其他'
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

    const records = await db.collection('exchangeRecords').where({
      userId: openid,
      createdAt: _.gte(startDate)
    }).get()

    const exchangeStats = {
      total: records.data.length,
      completed: records.data.filter(r => r.status === 'completed').length,
      pending: records.data.filter(r => r.status === 'pending').length,
      shipped: records.data.filter(r => r.status === 'shipped').length,
      cancelled: records.data.filter(r => r.status === 'cancelled').length,
      totalPoints: records.data
        .filter(r => r.status !== 'cancelled')
        .reduce((sum, r) => sum + r.pointsCost, 0)
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
    // 验证管理员权限
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()

    if (userRes.data.length === 0 || !userRes.data[0].isAdmin) {
      throw new Error('无权限访问')
    }

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

    const users = await db.collection('users').get()
    const pointRecords = await db.collection('pointRecords').where({
      createdAt: _.gte(startDate)
    }).get()

    // 成员活跃度统计
    const memberActivity = {}
    pointRecords.data.forEach(record => {
      if (record.status === 'approved') {
        const userId = record.userId
        if (!memberActivity[userId]) {
          memberActivity[userId] = {
            records: 0,
            points: 0,
            lastActivity: record.createdAt
          }
        }
        memberActivity[userId].records++
        memberActivity[userId].points += record.points
        if (new Date(record.createdAt) > new Date(memberActivity[userId].lastActivity)) {
          memberActivity[userId].lastActivity = record.createdAt
        }
      }
    })

    // 合并用户信息
    const memberStats = users.data.map(user => {
      const activity = memberActivity[user._openid] || { records: 0, points: 0, lastActivity: null }
      return {
        userId: user._openid,
        nickname: user.nickname,
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