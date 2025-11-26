// 获取训练营排行榜的云函数
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取训练营排行榜
 * 按完成周数和平均完成率排序
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { camp_id, limit = 50, openid: overrideOpenId, _openid: altOpenId } = event || {}
  
  try {
    // 1. 验证用户权限（仅正式会员可访问）
    const effectiveOpenId = openid || overrideOpenId || altOpenId || null
    let user = null
    if (effectiveOpenId) {
      const userResult = await db.collection('users').where({
        _openid: effectiveOpenId
      }).get()
      if (userResult.data.length > 0) {
        user = userResult.data[0]
      }
    }
    
    if (!user) {
      return {
        success: false,
        message: effectiveOpenId ? '用户不存在' : '缺少用户身份，请在小程序内调用或提供 openid'
      }
    }
    if (user.isOfficialMember !== true) {
      return {
        success: false,
        message: '仅正式会员可访问训练营功能'
      }
    }
    
    // 2. 获取训练营计划
    const campPlanResult = await db.collection('camp_plans').where({
      camp_id: camp_id || 'camp_hengqin_2026'
    }).get()
    
    if (campPlanResult.data.length === 0) {
      return {
        success: false,
        message: '训练营不存在'
      }
    }
    
    const campPlan = campPlanResult.data[0]
    
    // 3. 获取所有用户的训练营完成记录
    const recordsResult = await db.collection('point_records').where({
      camp_id: campPlan.camp_id,
      status: 'approved'
    }).get()
    
    // 4. 聚合用户数据
    const userStats = {}
    const userIds = new Set()
    
    recordsResult.data.forEach(record => {
      const userId = record.userId
      userIds.add(userId)
      
      if (!userStats[userId]) {
        userStats[userId] = {
          userId: userId,
          totalWeeks: 0,
          totalCompletionRate: 0,
          completionRates: [],
          lastActivity: record.submitTime
        }
      }
      
      userStats[userId].totalWeeks++
      userStats[userId].completionRates.push(record.completion_rate || 0)
      userStats[userId].totalCompletionRate += record.completion_rate || 0
      
      // 更新最后活动时间
      if (new Date(record.submitTime) > new Date(userStats[userId].lastActivity)) {
        userStats[userId].lastActivity = record.submitTime
      }
    })
    
    // 5. 获取用户信息
    const usersResult = await db.collection('users').where({
      _id: _.in(Array.from(userIds))
    }).get()
    
    const userMap = {}
    usersResult.data.forEach(u => {
      userMap[u._id] = {
        // 兼容不同字段命名：nickName / nickname
        nickname: u.nickName || u.nickname || '匿名用户',
        avatarUrl: u.avatarUrl || '/images/default-avatar.png',
        role: u.role || 'user'
      }
    })
    
    // 6. 计算最终统计并排序
    const leaderboard = Object.values(userStats).map(stats => {
      const userInfo = userMap[stats.userId] || {
        nickname: '未知用户',
        avatarUrl: '',
        role: 'user'
      }
      
      return {
        userId: stats.userId,
        nickname: userInfo.nickname,
        avatarUrl: userInfo.avatarUrl,
        role: userInfo.role,
        weeksCompleted: stats.totalWeeks,
        avgCompletionRate: Math.round(stats.totalCompletionRate / stats.completionRates.length),
        totalCompletionRate: stats.totalCompletionRate,
        lastActivity: stats.lastActivity
      }
    }).sort((a, b) => {
      // 先按完成周数排序，再按平均完成率排序
      if (b.weeksCompleted !== a.weeksCompleted) {
        return b.weeksCompleted - a.weeksCompleted
      }
      return b.avgCompletionRate - a.avgCompletionRate
    }).slice(0, limit)
    
    // 7. 添加排名
    leaderboard.forEach((item, index) => {
      item.rank = index + 1
    })
    
    // 8. 获取当前用户在排行榜中的位置
    const currentUserRank = leaderboard.find(item => item.userId === user._id)
    
    return {
      success: true,
      data: {
        campInfo: {
          camp_id: campPlan.camp_id,
          name: campPlan.name,
          total_weeks: campPlan.total_weeks,
          start_date: campPlan.start_date,
          race_date: campPlan.race_date
        },
        leaderboard: leaderboard,
        currentUserRank: currentUserRank || null,
        totalParticipants: leaderboard.length
      }
    }
    
  } catch (error) {
    console.error('获取训练营排行榜失败', error)
    return {
      success: false,
      message: '获取失败，请稍后再试',
      error: error.message
    }
  }
}