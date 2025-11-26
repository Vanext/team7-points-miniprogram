const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { targetUserId } = event
  const { OPENID } = cloud.getWXContext()
  
  if (!targetUserId) {
    return {
      success: false,
      message: '目标用户ID不能为空'
    }
  }

  if (OPENID === targetUserId) {
    return {
      success: true,
      isFollowing: false // 不能关注自己
    }
  }

  try {
    // 查询关注关系
    const result = await db.collection('follows').where({
      follower: OPENID,
      following: targetUserId
    }).get()

    return {
      success: true,
      isFollowing: result.data.length > 0
    }

  } catch (error) {
    console.error('检查关注状态失败:', error)
    return {
      success: false,
      message: '服务器错误，请稍后重试'
    }
  }
}