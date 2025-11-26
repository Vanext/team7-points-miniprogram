// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 获取积分记录详情
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    // 检查管理员权限
    const adminCheck = await db.collection('users').where({
      _openid: openid,
      isAdmin: true
    }).get()
    
    if (adminCheck.data.length === 0) {
      return {
        success: false,
        message: '权限不足'
      }
    }
    
    // 获取记录ID
    const { recordId } = event
    if (!recordId) {
      return {
        success: false,
        message: '参数错误'
      }
    }
    
    // 查询记录
    const recordResult = await db.collection('point_records').doc(recordId).get()
    
    if (!recordResult.data) {
      return {
        success: false,
        message: '记录不存在'
      }
    }
    
    return {
      success: true,
      record: recordResult.data
    }
    
  } catch (error) {
    console.error('获取积分记录详情失败', error)
    return {
      success: false,
      message: '获取详情失败',
      error: error
    }
  }
}