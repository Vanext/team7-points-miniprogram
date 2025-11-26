// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 获取积分记录列表
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
    
    // 获取参数
    const { status = 'pending', page = 1, pageSize = 10, onlySubmission = false, excludeTypes = ['exchange','refund','adjust'], isAdmin = false } = event
    const skip = (page - 1) * pageSize
    
    // 查询条件
    const condition = { status }
    if (isAdmin) {
      condition.type = _.nin(excludeTypes)
      condition.categoryName = _.exists(true)
    } else if (onlySubmission) {
      condition.type = _.nin(excludeTypes)
      condition.categoryName = _.exists(true)
    }
    
    // 查询总数
    const countResult = await db.collection('point_records')
      .where(condition)
      .count()
    
    // 查询记录
    const recordsResult = await db.collection('point_records')
      .where(condition)
      .orderBy('submitTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
    
    // 为每条记录添加用户信息
    const recordsWithUserInfo = await Promise.all(
      recordsResult.data.map(async (record) => {
        try {
          // 根据记录中的 _openid 查询用户信息
          const userResult = await db.collection('users')
            .where({ _openid: record._openid })
            .field({ nickName: true, avatarUrl: true })
            .get()
          
          // 添加用户信息到记录中
          const userInfo = userResult.data.length > 0 ? userResult.data[0] : {
            nickName: '未知用户',
            avatarUrl: ''
          }
          
          return {
            ...record,
            userInfo: {
              nickName: userInfo.nickName || '未知用户',
              avatarUrl: userInfo.avatarUrl || ''
            }
          }
        } catch (error) {
          console.error('获取用户信息失败', error)
          // 如果获取用户信息失败，使用默认值
          return {
            ...record,
            userInfo: {
              nickName: '未知用户',
              avatarUrl: ''
            }
          }
        }
      })
    )
    
    return {
      success: true,
      records: recordsWithUserInfo,
      total: countResult.total
    }
    
  } catch (error) {
    console.error('获取积分记录失败', error)
    return {
      success: false,
      message: '获取记录失败',
      error: error
    }
  }
}
