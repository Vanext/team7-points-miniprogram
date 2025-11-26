// 获取训练营数据的云函数（修复版）
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取训练营数据
 * 返回训练计划和用户完成状态
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { camp_id, openid: overrideOpenId, _openid: altOpenId } = event || {}
  
  try {
    // 1. 验证用户权限（仅正式会员可访问）
    // 修复：使用正确的查询方式
    let user = null
    const effectiveOpenId = openid || overrideOpenId || altOpenId || null
    if (effectiveOpenId) {
      try {
        const userResult = await db.collection('users').where({
          _openid: effectiveOpenId
        }).limit(1).get()
        if (userResult.data.length > 0) {
          user = userResult.data[0]
        }
      } catch (userError) {
        console.log('用户查询错误:', userError)
      }
    }
    
    if (user && user.isOfficialMember !== true) {
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
    
    // 3. 计算当前周
    const startDate = new Date(campPlan.start_date)
    const currentDate = new Date()
    const diffTime = currentDate - startDate
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    const currentWeek = Math.min(Math.max(Math.ceil(diffDays / 7), 1), campPlan.total_weeks)
    
    // 4. 获取用户的训练营完成记录
    const userProgressResult = await db.collection('point_records').where({
      camp_id: camp_id || 'camp_hengqin_2026',
      status: 'approved',
      ...(openid ? { _openid: openid } : {})
    }).get()
    
    const completedWeeks = userProgressResult.data.map(record => record.week_num).filter(Boolean)
    const totalWeeksCompleted = completedWeeks.length
    const weekCompletion = {}
    let completionSum = 0
    let completionCount = 0
    let userWeekMinutes = 0
    userProgressResult.data.forEach(r => {
      if (r.week_num) {
        weekCompletion[r.week_num] = { completion_rate: r.completion_rate || 0, record_id: r._id }
        completionSum += (r.completion_rate || 0)
        completionCount += 1
        if (r.week_num === currentWeek) userWeekMinutes += (r.actual_minutes || 0)
      }
    })
    const currentWeekPlan = (campPlan.weeks || []).find(w => w.week_num === currentWeek) || {}
    const plannedMinutesForCurrentWeek = currentWeekPlan.total_planned_minutes || currentWeekPlan.planned_minutes || 0
    const userWeekHours = Math.round((userWeekMinutes / 60) * 10) / 10
    const userWeekRate = plannedMinutesForCurrentWeek > 0 ? Math.round((userWeekMinutes / plannedMinutesForCurrentWeek) * 100) : 0
    
    // 5. 计算倒计时
    const raceDate = new Date(campPlan.race_date || '2026-03-15')
    const countdownDays = Math.ceil((raceDate - currentDate) / (1000 * 60 * 60 * 24))
    
    const maxCompleted = completedWeeks.length ? Math.max.apply(null, completedWeeks) : 0
    const baseline = 2
    const unlockedWeek = Math.min(campPlan.total_weeks, Math.max(baseline, currentWeek, maxCompleted + 1))

    return {
      success: true,
      campPlan: campPlan,
      userProgress: {
        current_week: currentWeek,
        completed_weeks: completedWeeks,
        total_weeks_completed: totalWeeksCompleted,
        total_weeks: campPlan.total_weeks,
        week_completion: weekCompletion,
        overall_completion: Math.round((totalWeeksCompleted / campPlan.total_weeks) * 100),
        avg_completion_rate: completionCount ? Math.round(completionSum / completionCount) : 0,
        unlocked_week: unlockedWeek,
        week_completed_minutes: userWeekMinutes,
        week_completed_hours: userWeekHours,
        week_completed_rate: userWeekRate
      },
      countdown: {
        days: countdownDays,
        text: countdownDays > 0 ? `距离比赛还有 ${countdownDays} 天` : '比赛已开始',
        days_to_race: countdownDays
      }
    }
    
  } catch (error) {
    console.error('获取训练营数据失败', error)
    return {
      success: false,
      message: '获取失败，请稍后再试',
      error: error.message
    }
  }
}