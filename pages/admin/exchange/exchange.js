// pages/admin/exchange/exchange.js
const app = getApp();

Page({
  data: {
    status: 'pending',
    list: []
  },

  onLoad() {
    this.fetch();
  },
  onShow() {
    this.fetch();
  },

  async fetch() {
    try {
      const status = this.data.status;
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'adminManageExchange', config: { env: cloudEnv }, data: { action: 'list', query: { status, limit: 100 } } });
      const raw = (res.result && res.result.data) || [];
      const labelMap = { pending: '待处理', shipped: '已发货', completed: '已完成', cancelled: '已取消' };
      const list = raw.map(it => ({
        ...it,
        displayStatus: labelMap[it.status] || it.status
      }));
      this.setData({ list });
    } catch (e) {
      console.error('获取兑换单失败', e);
      app.showToast('获取失败', 'error');
    }
  },

  onTab(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({ status }, () => this.fetch());
  },
  onCopy(e) {
    const type = e.currentTarget.dataset.type;
    const content = (e.currentTarget.dataset.content || '').trim();
    if (!content) return;
    wx.setClipboardData({
      data: content,
      success: () => {
        const label = type === 'address' ? '地址' : '收件人';
        wx.showToast({ title: `已复制${label}信息到剪贴板`, icon: 'none' });
      }
    });
  },

  onShip(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '标记发货',
      content: '请确认已准备好物流信息，将该订单标记为已发货。',
      confirmText: '去填写',
      success: (r) => {
        if (!r.confirm) return;
        wx.showModal({
          title: '填写物流',
          editable: true,
          placeholderText: '输入“快递公司,单号” 例如：顺丰, SF123456',
          success: async (r2) => {
            if (!r2.confirm) return;
            try {
              const input = (r2.content || '').trim();
              const splitResult = input.split(/[，,]/);
              const company = splitResult[0] || '';
              const trackingNumber = splitResult[1] || '';
              app.showLoading('更新中...');
              const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
              const res = await wx.cloud.callFunction({ name: 'adminManageExchange', config: { env: cloudEnv }, data: { action: 'ship', data: { id, company, trackingNumber } } });
              if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message);
              app.showToast('已标记发货');
              this.fetch();
            } catch (e) {
              console.error('发货失败', e);
              app.showToast(e.message || '发货失败', 'error');
            } finally {
              app.hideLoading();
            }
          }
        });
      }
    });
  },

  async onConfirmDone(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认完成',
      content: '确认该兑换已完成？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          app.showLoading('更新中...');
          const action = this.data.status === 'pending' ? 'confirm' : 'complete';
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const res = await wx.cloud.callFunction({ name: 'adminManageExchange', config: { env: cloudEnv }, data: { action, data: { id } } });
          if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message);
          app.showToast('状态已更新');
          this.fetch();
        } catch (e) {
          console.error('更新失败', e);
          app.showToast(e.message || '更新失败', 'error');
        } finally {
          app.hideLoading();
        }
      }
    });
  }
  ,
  async onCancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消申请',
      content: '确认取消该兑换申请并返还积分、回滚库存？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          app.showLoading('处理中...');
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const res = await wx.cloud.callFunction({ name: 'adminManageExchange', config: { env: cloudEnv }, data: { action: 'cancel', data: { id } } });
          if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message);
          app.showToast('已取消并返还积分');
          // 刷新当前列表，并同步“全部”状态时的展示
          this.fetch();
        } catch (e2) {
          console.error('取消失败', e2);
          app.showToast(e2.message || '取消失败', 'error');
        } finally {
          app.hideLoading();
        }
      }
    });
  }
});
