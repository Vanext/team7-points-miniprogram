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
        // 优先显示详细描述(description)，其次显示分类名称(categoryName)，最后显示原因(reason)或默认文案
        // description: 通常用于兑换商品、管理员调整等
        // categoryName: 通常用于用户提交的积分申请（如训练打卡）
        item.displayReason = item.description || item.categoryName || item.reason || '积分变动';
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
