const app = getApp()

Page({
  data: {
    products: [],
    loading: true
  },

  onLoad() {
    this.loadProducts()
  },

  onShow() {
    // Refresh if needed
  },

  async loadProducts() {
    try {
      this.setData({ loading: true })
      
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const res = await wx.cloud.callFunction({
        name: 'getProducts',
        config: {
          env: cloudEnv
        },
        data: {
          limit: 20,
          offset: 0
        }
      })

      if (res.result && res.result.success && res.result.data && res.result.data.length > 0) {
        this.setData({ products: res.result.data, loading: false })
      } else {
        const db = wx.cloud.database({ env: cloudEnv })
        const _ = db.command
        const r2 = await db.collection('products')
          .where({ isActive: true, stock: _.gt(0) })
          .orderBy('createTime', 'desc')
          .limit(20)
          .get()
        this.setData({ products: r2.data || [], loading: false })
      }
    } catch (err) {
      console.error('加载商品失败', err)
      this.setData({ loading: false })
      // 如果云函数调用失败，保留空列表或显示错误
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  viewProduct(e) {
    const id = e.currentTarget.dataset.id
    // 跳转到详情页
    wx.navigateTo({ url: `/pages/store-detail/store-detail?id=${id}` })
  }
})
