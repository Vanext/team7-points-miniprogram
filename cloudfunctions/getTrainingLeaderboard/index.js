// 获取训练时长排行榜的云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取训练时长排行榜
 * 按累计训练时长排序
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { limit = 50, month } = event || {}
  
  try {
    // 1. 统计周期（默认当前月份）
    const now = new Date()
    const [y, m] = month && typeof month === 'string' && month.includes('-')
      ? month.split('-').map(v => parseInt(v, 10))
      : [now.getFullYear(), now.getMonth() + 1]
    const start = new Date(y, m - 1, 1)
    const end = new Date(y, m, 0, 23, 59, 59, 999)
    const monthKey = `${y}-${String(m).padStart(2, '0')}`
    const nextMonthBoundary = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const boundaryY = nextMonthBoundary.getFullYear()
    const boundaryM = nextMonthBoundary.getMonth() + 1
    const useUserOnly = (y > boundaryY) || (y === boundaryY && m >= boundaryM)
    
    // 2. 获取当前调用者的用户ID（用于返回个人排名）
    let currentUserId = null
    if (openid) {
      const meRes = await db.collection('users').where({ _openid: openid }).limit(1).get()
      if (meRes.data && meRes.data[0]) currentUserId = meRes.data[0]._id
    }

    // 3. 为无 trainingStats 的用户准备基于 point_records 的兜底聚合（分页读取）
    const fallbackHoursByUserId = {}
    const fallbackHoursByOpenid = {}
    const lastActivityByUserId = {}
    const lastActivityByOpenid = {}
    const PAGE_SIZE = 1000
    let offset = 0
    while (true) {
      const whereCond = {
        status: 'approved',
        submitTime: _.gte(start).and(_.lte(end))
      }
      if (useUserOnly) whereCond.submissionSource = 'user'
      const batch = await db.collection('point_records').where(whereCond).skip(offset).limit(PAGE_SIZE).get()
      const list = batch.data || []
      if (!list.length) break
      for (const record of list) {
        const isTraining = (record.category === 'training') || (record.categoryId === 'training') || (record.formData && record.formData.category === 'training')
        const isCamp = (record.category === 'camp') || (record.categoryId === 'camp') || (record.formData && record.formData.category === 'camp')
        const isAnyTraining = isTraining || isCamp
        if (!isAnyTraining) continue
        let rd = null
        if (record.date) rd = new Date(String(record.date).replace(/-/g, '/'))
        if (!rd || isNaN(rd.getTime())) rd = record.submitTime ? new Date(record.submitTime) : null
        if (!rd) continue
        if (rd.getFullYear() !== y || (rd.getMonth() + 1) !== m) continue
        let h = 0
        if (typeof record.selectedHours === 'number' && record.selectedHours > 0) h = record.selectedHours
        else if (typeof record.actual_minutes === 'number' && record.actual_minutes > 0) h = Math.round((record.actual_minutes / 60) * 100) / 100
        else if (isTraining && typeof record.points === 'number' && record.points > 0) h = Math.round((record.points / 2) * 100) / 100
        else continue
        const uid = record.userId
        const oid = record._openid
        if (uid) {
          fallbackHoursByUserId[uid] = (fallbackHoursByUserId[uid] || 0) + h
          if (!lastActivityByUserId[uid] || new Date(record.submitTime) > new Date(lastActivityByUserId[uid])) lastActivityByUserId[uid] = record.submitTime
        }
        if (oid) {
          fallbackHoursByOpenid[oid] = (fallbackHoursByOpenid[oid] || 0) + h
          if (!lastActivityByOpenid[oid] || new Date(record.submitTime) > new Date(lastActivityByOpenid[oid])) lastActivityByOpenid[oid] = record.submitTime
        }
      }
      offset += list.length
      if (list.length < PAGE_SIZE) break
    }

    // 4. 读取用户信息与 trainingStats
    // 4. 分页读取用户信息
    const users = []
    let uOffset = 0
    while (true) {
      const uBatch = await db.collection('users').skip(uOffset).limit(PAGE_SIZE).get()
      const uList = uBatch.data || []
      if (!uList.length) break
      users.push(...uList)
      uOffset += uList.length
      if (uList.length < PAGE_SIZE) break
    }
      const leaderboard = users.map(u => {
        const stats = (u.trainingStats || {})
        const byMonth = stats.byMonth || {}
        let hours = 0
        const raw = byMonth[monthKey]
        if (!useUserOnly) {
          if (typeof raw === 'number') {
            hours = raw
          } else if (typeof raw === 'string') {
            const n = Number(raw)
            if (isFinite(n)) hours = n
          }
        }
        if (!hours) {
          hours = (fallbackHoursByUserId[u._id] || 0)
          if (!hours) hours = (fallbackHoursByOpenid[u._openid] || 0)
        }
      const lastActivity = lastActivityByUserId[u._id] || lastActivityByOpenid[u._openid] || stats.lastActivity || null
      return {
        userId: u._id,
        nickname: u.nickName || u.nickname || '匿名用户',
        avatarUrl: u.avatarUrl || '/images/default-avatar.png',
        role: u.role || 'user',
        totalTrainingHours: Math.round(hours * 100) / 100,
        trainingCount: stats.trainingCount || 0,
        lastActivity
      }
    }).filter(item => item.totalTrainingHours > 0)
      .sort((a, b) => b.totalTrainingHours - a.totalTrainingHours)
      .slice(0, limit)

    // 5. 添加排名
    leaderboard.forEach((item, index) => { item.rank = index + 1 })

    // 6. 当前用户排名
    const currentUserRank = currentUserId ? leaderboard.find(item => item.userId === currentUserId) : null

    return {
      success: true,
      data: { leaderboard, currentUserRank: currentUserRank || null, totalParticipants: leaderboard.length }
    }
    
  } catch (error) {
    console.error('获取训练时长排行榜失败', error)
    return {
      success: false,
      message: '获取失败，请稍后再试',
      error: error.message
    }
  }
}
