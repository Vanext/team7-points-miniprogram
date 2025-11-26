// 云函数：获取公告列表（若无则写入默认“积分规则”）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { limit = 10, homeOnly = false } = event || {}
    const coll = db.collection('announcements')
    let query = coll
    if (homeOnly) {
      query = query.where({ showOnHome: true })
    }
    const res = await query
      .orderBy('createTime', 'desc')
      .limit(limit)
      .get()

    if (res.data && res.data.length > 0) {
      return { success: true, data: res.data }
    }

    // 无数据则插入默认“积分规则”公告
    const defaultDoc = {
      title: '俱乐部积分规则（试行）',
      content: [
        '1) 积分获取：参加比赛、活动、周训练打卡、俱乐部建设等按规则加分。',
        '2) 审核机制：管理员审核后积分计入 totalPoints。',
        '3) 积分使用：可在积分商城兑换商品，消耗积分且记录兑换历史。',
        '4) 公告管理：管理员可发布/更新公告内容，以最新发布为准。',
        '5) 规则解释权归 Team7 俱乐部所有。'
      ].join('\n'),
      isActive: true,
      type: 'rules',
      showOnHome: false,
      createTime: db.serverDate(),
      updateTime: db.serverDate(),
      createdBy: 'system'
    }

    await db.collection('announcements').add({ data: defaultDoc })

    return { success: true, data: [defaultDoc] }
  } catch (err) {
    console.error('getAnnouncements failed', err)
    return { success: false, message: err.message || '获取公告失败' }
  }
}
