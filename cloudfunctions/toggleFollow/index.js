const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { targetUserId, action } = event
  const { OPENID } = cloud.getWXContext()
  
  if (!targetUserId || !action) {
    return {
      success: false,
      message: '参数不完整'
    }
  }

  if (OPENID === targetUserId) {
    return {
      success: false,
      message: '不能关注自己'
    }
  }

  try {
    if (action === 'follow') {
      // 关注用户
      // 先检查是否已经关注
      const existResult = await db.collection('follows').where({
        follower: OPENID,
        following: targetUserId
      }).get()

      if (existResult.data.length > 0) {
        return {
          success: false,
          message: '已经关注过该用户'
        }
      }

      // 添加关注记录
      await db.collection('follows').add({
        data: {
          follower: OPENID,
          following: targetUserId,
          createTime: new Date()
        }
      })

    } else if (action === 'unfollow') {
      // 取消关注
      await db.collection('follows').where({
        follower: OPENID,
        following: targetUserId
      }).remove()
    } else {
      return {
        success: false,
        message: '无效的操作类型'
      }
    }

    return {
      success: true,
      message: action === 'follow' ? '关注成功' : '取消关注成功'
    }

  } catch (error) {
    console.error('关注操作失败:', error)
    return {
      success: false,
      message: '服务器错误，请稍后重试'
    }
  }
}