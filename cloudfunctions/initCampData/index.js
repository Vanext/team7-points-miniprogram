// 云函数入口文件
const cloud = require('wx-server-sdk')
const campPlanData = require('./camp_plan_data.json')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 初始化训练营数据
 * 用于创建camp_plans集合并导入13周训练计划
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    // 1. 验证管理员权限
    const effectiveOpenId = openid || event.openid || event._openid
    
    if (!effectiveOpenId) {
      return {
        success: false,
        message: '缺少用户身份，请在小程序内调用或提供 openid'
      }
    }
    
    const userResult = await db.collection('users').where({
      _openid: effectiveOpenId
    }).get()
    
    if (userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }
    
    const user = userResult.data[0]
    if (!user.isAdmin) {
      return {
        success: false,
        message: '无权限操作，需要管理员权限'
      }
    }
    
    // 2. 确保camp_plans集合存在
    try {
      await db.createCollection('camp_plans')
    } catch (e) {
      // 集合已存在，忽略错误
      console.log('camp_plans集合已存在')
    }
    
    // 3. 检查是否已有相同camp_id的数据
    const existingCamp = await db.collection('camp_plans').where({
      camp_id: campPlanData.camp_id
    }).get()
    
    if (existingCamp.data.length > 0) {
      return {
        success: false,
        message: `训练营 ${campPlanData.camp_id} 已存在，请勿重复创建`
      }
    }
    
    // 4. 插入训练营数据
    const result = await db.collection('camp_plans').add({
      data: {
        ...campPlanData,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    })
    
    return {
      success: true,
      message: '训练营数据创建成功',
      data: {
        campId: campPlanData.camp_id,
        name: campPlanData.name,
        totalWeeks: campPlanData.total_weeks,
        startDate: campPlanData.start_date,
        raceDate: campPlanData.race_date
      }
    }
    
  } catch (error) {
    console.error('创建训练营数据失败', error)
    return {
      success: false,
      message: '创建失败，请稍后再试',
      error: error.message
    }
  }
}