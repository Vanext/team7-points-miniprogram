// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { limit = 20, offset = 0 } = event
    
    // 优化查询：只获取必要字段，添加索引建议
    const result = await db.collection('users')
      .field({
        _id: true,
        _openid: true,
        openid: true,
        nickName: true,
        avatarUrl: true,
        totalPoints: true
      })
      .where({
        totalPoints: db.command.gt(0) // 只获取有积分的用户
      })
      .orderBy('totalPoints', 'desc')
      .skip(offset)
      .limit(Math.min(limit, 50)) // 限制最大返回数量
      .get()

    // 处理数据，添加排名
    const leaderboard = result.data.map((user, index) => ({
      rank: offset + index + 1,
      _openid: user._openid || user.openid,
      openid: user.openid || user._openid,
      nickName: user.nickName || '匿名用户',
      avatarUrl: user.avatarUrl || '/images/default-avatar.png',
      totalPoints: user.totalPoints || 0
    }))

    return {
      success: true,
      data: leaderboard,
      total: result.data.length,
      hasMore: result.data.length === limit
    }
  } catch (error) {
    console.error('获取排行榜失败:', error)
    return {
      success: false,
      message: '获取排行榜失败',
      error: error.message
    }
  }
}