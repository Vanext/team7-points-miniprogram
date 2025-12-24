const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { userInfo } = event

  if (!userInfo) {
    return { success: false, message: '用户信息不能为空' }
  }

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    
    if (userRes.data.length > 0) {
      const existing = userRes.data[0]
      const incomingNick = userInfo.nickName
      const incomingAvatar = userInfo.avatarUrl
      const isDefaultNick = !incomingNick || incomingNick === '微信用户'
      // 兼容：避免将前端处理过的临时HTTP头像URL写入数据库（会过期）
      const isTempHttpAvatar = typeof incomingAvatar === 'string' && incomingAvatar.startsWith('http') && incomingAvatar.includes('.tcb.qcloud.la')
      const isDefaultAvatar = !incomingAvatar || String(incomingAvatar).includes('thirdwx.qlogo.cn') || isTempHttpAvatar
      const newNick = isDefaultNick ? (existing.nickName || '微信用户') : incomingNick
      const newAvatar = isDefaultAvatar ? (existing.avatarUrl || incomingAvatar) : incomingAvatar
      await db.collection('users').doc(existing._id).update({
        data: {
          nickName: newNick,
          avatarUrl: newAvatar,
          isAdmin: existing.isAdmin === true,
          isOfficialMember: !!existing.isOfficialMember,
          joinDate: existing.joinDate || existing.createTime || db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      return { success: true, message: '用户已更新', isNew: false }
    } else {
      // Create new user
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickName: userInfo.nickName,
          avatarUrl: userInfo.avatarUrl,
          joinDate: db.serverDate(),
          createTime: db.serverDate(),
          updateTime: db.serverDate(),
          totalPoints: 0,
          isAdmin: false
        }
      })
      return { success: true, message: '用户已创建', isNew: true }
    }
  } catch (err) {
    console.error(err)
    return { success: false, message: '注册失败', error: err }
  }
}
