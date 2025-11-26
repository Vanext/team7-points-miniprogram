// pages/exchange-history/exchange-history.js
const app = getApp();

Page({
  data: {
    history: [],
    isLoading: true,
    isEmpty: false,
    page: 1,
    pageSize: 10,
    hasMore: true
  },

  onLoad: function (options) {
    this.loadHistory();
  },

  loadHistory: function (loadMore = false) {
    if (!this.data.hasMore && loadMore) return;

    this.setData({ isLoading: true });

    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';

    wx.cloud.callFunction({
      name: 'getExchangeHistory',
      config: {
        env: cloudEnv
      },
      data: {
        page: this.data.page,
        pageSize: this.data.pageSize
      },
      success: res => {
        const raw = res.result.data || [];
        const labelMap = { pending: '待处理', shipped: '已发货', completed: '已完成', cancelled: '已取消' };
        const data = raw.map(it => ({
          ...it,
          displayStatus: labelMap[it.status] || it.status,
          displayPointsSpent: it.status === 'cancelled' ? '0' : ('-' + (it.pointsSpent || 0))
        }));
        const newHistory = loadMore ? this.data.history.concat(data) : data;

        this.setData({
          history: newHistory,
          isLoading: false,
          isEmpty: newHistory.length === 0,
          hasMore: data.length === this.data.pageSize,
          page: this.data.page + 1
        });
      },
      fail: err => {
        console.error('Failed to load exchange history', err);
        this.setData({ isLoading: false });
        app.showToast('加载失败，请稍后再试');
      }
    });
  },

  onCancel: function(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '取消兑换',
      content: '确认取消该兑换申请吗？积分将返还且库存回滚。',
      success: async (r) => {
        if (!r.confirm) return
        try {
          app.showLoading('取消中...')
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
          const res = await wx.cloud.callFunction({ 
            name: 'adminManageExchange', 
            config: {
              env: cloudEnv
            },
            data: { action: 'userCancel', data: { id } } 
          })
          if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message)
          app.showToast('已取消')
          this.setData({ page: 1, hasMore: true })
          this.loadHistory()
        } catch (err) {
          console.error('取消兑换失败', err)
          app.showToast(err.message || '取消失败', 'error')
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  onPullDownRefresh: function () {
    this.setData({
      page: 1,
      hasMore: true
    });
    this.loadHistory();
    wx.stopPullDownRefresh();
  },

  onReachBottom: function () {
    this.loadHistory(true);
  }
});
