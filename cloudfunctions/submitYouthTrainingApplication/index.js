const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 辅助函数：确保集合存在
async function ensureCollection(name) {
  try {
    await db.createCollection(name)
  } catch (err) {
    // 忽略集合已存在的错误 (-502005 类似的错误码，或者错误信息包含 already exists)
    // 如果是权限错误或其他错误，可能需要记录日志，但通常 createCollection 在已有集合时会报错，我们直接忽略
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { 
    name, 
    gender,
    age, 
    height, 
    hasInsurance,
    days, 
    contactPerson, 
    contactPhone 
  } = event

  try {
    // 尝试创建集合（如果不存在）
    await ensureCollection('youth_training_applications')

    const res = await db.collection('youth_training_applications').add({
      data: {
        _openid: OPENID,
        name,
        gender,
        age,
        height,
        hasInsurance,
        days,
        contactPerson,
        contactPhone,
        createTime: db.serverDate()
      }
    })
    return {
      success: true,
      _id: res._id
    }
  } catch (err) {
    console.error(err)
    return {
      success: false,
      message: err.message
    }
  }
}
