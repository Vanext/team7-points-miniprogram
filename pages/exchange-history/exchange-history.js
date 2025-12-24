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
        const data = raw.map(it => {
          // 对于"已完成"、"待处理"、"已发货"，显示实际消耗的积分（负数）
          // 对于"已取消"，通常显示0，或者显示返还（这里按照需求，似乎想看到当初这笔单是花了多少分，但因为取消了所以不计入消耗？）
          // 修正逻辑：
          // 用户反馈的问题是：取消或已完成都显示 -0
          // 原因是 it.pointsSpent 可能为 undefined 或 0，或者逻辑判断有问题
          // 实际上，已完成的订单肯定消耗了积分，应该显示具体的负数
          // 已取消的订单，积分已退回，显示 -0 或者 0 是合理的，或者显示 "已退回"
          // 但用户说"不对吧"，可能意味着他希望看到这笔订单原本价值多少分，或者现在的显示 -0 让他困惑
          // 我们这里统一显示这笔订单涉及的积分数额。
          // 如果是已完成/已发货/待处理，显示 -X 分
          // 如果是已取消，显示 0 分 (或者显示原价但划掉? 简单起见，已取消显示 0)
          
          let pointsDisplay = '0';
          const points = it.pointsSpent || it.pointsCost || it.totalPoints || 0; // 优先取 pointsSpent
          
          if (it.status === 'cancelled' || it.status === 'rejected') {
             pointsDisplay = '0'; // 取消或拒绝，实际未消耗（或已退还）
          } else {
             pointsDisplay = points > 0 ? `-${points}` : `${points}`;
          }

          return {
            ...it,
            displayStatus: labelMap[it.status] || it.status,
            displayPointsSpent: pointsDisplay,
            // 确保 WXML 里能取到正确的数值用于显示
            pointsCost: points 
          };
        });
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
