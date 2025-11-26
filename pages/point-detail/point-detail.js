// pages/point-detail/point-detail.js
const app = getApp()

Page({
  data: {
    records: [],
    loading: false,
    isEmpty: false
  },

  onLoad: function (options) {
    this.getPointRecords();
  },

  async getPointRecords() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    app.showLoading('加载中...');

    try {
      // 确保云环境已配置
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const db = wx.cloud.database({ env: cloudEnv });

      const userInfo = app.globalData.userInfo || {};
      const openid = userInfo._openid;
      
      if (!openid) {
        throw new Error('用户未登录');
      }

      const res = await db.collection('point_records').where({
        _openid: openid
      }).orderBy('submitTime', 'desc').get();

      const records = res.data.map(item => {
        item.formattedSubmitTime = app.formatTime(item.submitTime);
        return item;
      });

      this.setData({
        records: records,
        isEmpty: records.length === 0
      });

    } catch (err) {
      console.error('获取积分记录失败', err);
      app.showToast('加载失败', 'error');
    } finally {
      this.setData({ loading: false });
      app.hideLoading();
    }
  },

  onPullDownRefresh: function () {
    this.getPointRecords().then(() => {
      wx.stopPullDownRefresh();
    });
  }
})
