// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 这个云函数的作用是返回调用者的 openid
 * openid 是用户在小程序中的唯一标识
 */
exports.main = async (event, context) => {
  // 获取微信调用上下文
  const wxContext = cloud.getWXContext()

  // 返回 openid 给前端
  return {
    event,
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}
