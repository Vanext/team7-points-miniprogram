const cloud = require('wx-server-sdk');
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 获取当前用户的兑换记录
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { page = 1, pageSize = 10 } = event;

  try {
    const res = await db.collection('exchange_records').where({
      _openid: openid
    }).orderBy('exchange_time', 'desc').skip((page - 1) * pageSize).limit(pageSize).get();

    const data = (res.data || []).map(item => ({
      ...item,
      exchangeDate: item.exchange_time,
      pointsSpent: item.pointsSpent
    }))

    return {
      code: 0,
      data,
      message: '获取兑换记录成功'
    };
  } catch (e) {
    console.error(e);
    return {
      code: 1,
      message: '获取兑换记录失败'
    };
  }
};