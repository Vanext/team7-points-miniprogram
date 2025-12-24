// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 检查并自动解锁用户（当用户参与比赛后调用）
async function checkAndAutoUnlockAfterCompetition(userId) {
  try {
    // 调用manageExchangeLock云函数检查自动解锁
    const result = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'checkAndAutoUnlock',
        data: { userId: userId }
      }
    })
    
    if (result.result.success && result.result.unlocked) {
      console.log(`用户 ${userId} 参与比赛后已自动解锁:`, result.result.reason)
    }
    
    return result.result
  } catch (error) {
    console.error('自动解锁检查失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 提交积分记录的云函数
 * 修改为：所有新提交进入待审核（pending），不再自动通过
 * 新增：支持训练营上传功能
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    // 1. 获取用户信息，确认用户存在
    const userResult = await db.collection('users').where({
      _openid: openid
    }).get()
    
    if (userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在，请先登录'
      }
    }
    
    const user = userResult.data[0]
    
    // 2. 处理训练营上传
    let plannedMinutes = null
    let completionRate = null
    
    if (event.camp_id && event.week_num) {
      // 训练营上传，获取计划训练时间
      const campPlan = await db.collection('camp_plans').where({
        camp_id: event.camp_id
      }).get()
      
      if (campPlan.data.length > 0) {
        const weekData = campPlan.data[0].weeks.find(w => w.week_num === event.week_num)
        if (weekData) {
          plannedMinutes = (
            weekData.total_planned_minutes !== undefined
              ? weekData.total_planned_minutes
              : weekData.planned_minutes
          )
          if (event.actual_minutes && plannedMinutes && plannedMinutes > 0) {
            completionRate = Math.round((event.actual_minutes / plannedMinutes) * 100)
          }
        }
      }
    }
    
    // 3. 创建积分记录 - 修改为默认待审核状态
    const pointRecord = {
      ...event.formData,
      points: event.points,
      categoryId: event.categoryId,
      categoryName: event.categoryName,
      submitTime: db.serverDate(),
      status: 'pending', // 改为待审核
      _openid: openid,
      userId: user._id,
      userName: user.nickName,
      userAvatar: user.avatarUrl,
      submissionSource: 'user',
      // 训练营相关字段
      camp_id: event.camp_id || null,
      week_num: event.week_num || null,
      planned_minutes: plannedMinutes,
      actual_minutes: event.actual_minutes || null,
      completion_rate: completionRate,
      // 移除自动审核时间与自动通过标记
    }
    
    // 3. 如果有图片，处理图片路径（实际上传由前端完成）
    if (event.formData.images && event.formData.images.length > 0) {
      pointRecord.hasImages = true
      pointRecord.imageFileIDs = event.imageFileIDs || []
    } else {
      pointRecord.hasImages = false
      pointRecord.imageFileIDs = []
    }
    
    // 4. 使用事务仅保存记录（不再在提交时增加用户积分，改由审核通过后增加）
    const result = await db.runTransaction(async transaction => {
      // 4.1 添加积分记录
      const addRes = await transaction.collection('point_records').add({
        data: pointRecord
      })
      
      return { recordId: addRes._id }
    })
    
    // 5. 训练营进度自动解锁与推进（提交后立即解锁下一周，并将下一周作为“当前训练周”）
    try {
      if (event.camp_id && event.week_num) {
        // 确保进度集合存在
        try { await db.createCollection('camp_user_progress') } catch (_) {}
        // 查询训练营总周数
        const planRes = await db.collection('camp_plans').where({ camp_id: event.camp_id }).limit(1).get()
        const totalWeeks = (planRes.data[0] && planRes.data[0].total_weeks) ? planRes.data[0].total_weeks : 13
        // 计算下一周并推进解锁
        const nextWeek = Math.min(totalWeeks, Number(event.week_num) + 1)
        // 读取现有进度
        const progRes = await db.collection('camp_user_progress').where({ _openid: openid, camp_id: event.camp_id }).limit(1).get()
        const now = db.serverDate()
        if (progRes.data && progRes.data.length > 0) {
          const docId = progRes.data[0]._id
          const prevUnlocked = Number(progRes.data[0].unlocked_week || 1)
          const newUnlocked = Math.max(prevUnlocked, nextWeek)
          await db.collection('camp_user_progress').doc(docId).update({
            data: {
              unlocked_week: newUnlocked,
              current_week: newUnlocked,
              updatedAt: now
            }
          })
        } else {
          await db.collection('camp_user_progress').add({
            data: {
              _openid: openid,
              camp_id: event.camp_id,
              unlocked_week: nextWeek,
              current_week: nextWeek,
              createdAt: now,
              updatedAt: now
            }
          })
        }
      }
    } catch (e) {
      console.log('训练营自动解锁推进失败（不影响提交）', e)
    }
    
    // 6. 检查是否需要自动解锁（如果是铁人三项赛相关且已审核通过）
    // 完善当年参赛判定：当年时间范围（1月1-12月31）、参加铁人三项赛（只要是铁人三项赛都可以，距离不论）
    // 判断数据来源：会员上传的参赛获取积分的动作，已经通过并获得积分的比赛打卡
    // 使用表单内的比赛类型字段来识别是否为铁三类比赛
    const raceType = event.formData && event.formData.raceType
    const raceTypeLabel = event.formData && event.formData.raceTypeLabel
    const description = event.formData && event.formData.description
    const categoryName = (event.categoryName || '').toLowerCase()
    const labelLower = (raceTypeLabel || '').toLowerCase()
    const descLower = (description || '').toLowerCase()
    const triathlonTypeValues = ['ironman', 'half_ironman', 'standard', 'half_standard', 'youth_sprint']
    const isTriByTypeValue = triathlonTypeValues.includes(raceType)
    const isTriByLabelOrDesc = (
      (raceTypeLabel && (
        raceTypeLabel.includes('大铁') ||
        raceTypeLabel.includes('70.3') ||
        raceTypeLabel.includes('铁人三项') ||
        raceTypeLabel.includes('标铁') ||
        raceTypeLabel.includes('标准铁人三项') ||
        raceTypeLabel.includes('半程标铁') ||
        raceTypeLabel.includes('奥运距离') ||
        raceTypeLabel.includes('奥运') ||
        raceTypeLabel.includes('标准距离') ||
        raceTypeLabel.includes('标距') ||
        raceTypeLabel.includes('青少年短距离') ||
        labelLower.includes('ironman') ||
        labelLower.includes('triathlon') ||
        labelLower.includes('olympic') ||
        labelLower.includes('od') ||
        labelLower.includes('standard triathlon') ||
        labelLower.includes('sprint') ||
        labelLower.includes('youth')
      )) ||
      (description && (
        description.includes('大铁') ||
        description.includes('70.3') ||
        description.includes('铁人三项') ||
        description.includes('标铁') ||
        description.includes('标准铁人三项') ||
        description.includes('半程标铁') ||
        description.includes('奥运距离') ||
        description.includes('奥运') ||
        description.includes('标准距离') ||
        description.includes('标距') ||
        description.includes('青少年短距离') ||
        descLower.includes('ironman') ||
        descLower.includes('triathlon') ||
        descLower.includes('olympic') ||
        descLower.includes('od') ||
        descLower.includes('standard triathlon') ||
        descLower.includes('sprint') ||
        descLower.includes('youth')
      ))
    )
    // 新增：根据分类名称识别铁三，例如包含 70.3、铁人三项、IRONMAN 等
    const isTriByCategoryName = (
      categoryName.includes('70.3') ||
      categoryName.includes('铁人三项') ||
      categoryName.includes('标铁') ||
      categoryName.includes('半程标铁') ||
      categoryName.includes('奥运距离') ||
      categoryName.includes('奥运') ||
      categoryName.includes('标准距离') ||
      categoryName.includes('标距') ||
      categoryName.includes('ironman') ||
      categoryName.includes('triathlon') ||
      categoryName.includes('olympic') ||
      categoryName.includes('od') ||
      categoryName.includes('standard triathlon') ||
      categoryName.includes('sprint') ||
      categoryName.includes('youth')
    )
    const isTriathlonCompetition = isTriByTypeValue || isTriByLabelOrDesc || isTriByCategoryName

    // 调试日志：明确检测到的字段与匹配结果，便于定位未解锁原因
    console.log('Triathlon detection debug', {
      userId: user._id,
      raceType,
      raceTypeLabel,
      categoryName: event.categoryName,
      description,
      isTriByTypeValue,
      isTriByLabelOrDesc,
      isTriByCategoryName,
      isTriathlonCompetition,
      status: pointRecord.status
    })
    
    // 只有在记录已审核通过且是铁人三项赛时才触发自动解锁检查
    // 注意：本模块创建记录使用的是 `status` 字段，而非 `auditStatus`
    if (isTriathlonCompetition && pointRecord.status === 'approved') {
      try {
        console.log(`检测到铁人三项赛积分记录，用户 ${user._id}，触发自动解锁检查`)
        await checkAndAutoUnlockAfterCompetition(user._id)
      } catch (unlockError) {
        console.error('自动解锁检查失败:', unlockError)
        // 不影响主流程，继续返回成功
      }
    }
    
    return {
      success: true,
      message: '提交成功，请等待管理员审核',
      recordId: result.recordId
    }
    
  } catch (error) {
    console.error('提交积分记录失败', error)
    return {
      success: false,
      message: '提交失败，请稍后再试',
      error: error
    }
  }
}

// 导出辅助函数供其他云函数调用
exports.checkAndAutoUnlockAfterCompetition = checkAndAutoUnlockAfterCompetition
