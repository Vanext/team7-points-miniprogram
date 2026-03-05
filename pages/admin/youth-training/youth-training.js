const app = getApp()
Page({
  data: {
    list: [],
    total: 0,
    loading: false,
    hasMore: true,
    page: 0,
    limit: 20
  },
  onLoad() {
    this.loadData()
  },
  async loadData(more = false) {
    if (this.data.loading || (more && !this.data.hasMore)) return
    
    this.setData({ loading: true })
    const { page, limit, list } = this.data
    const skip = more ? list.length : 0
    
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'adminManageYouthTraining',
        config: { env: cloudEnv },
        data: { action: 'list', skip, limit }
      })
      
      if (res.result && res.result.success) {
        const newData = res.result.data
        const total = res.result.total
        this.setData({
          list: more ? list.concat(newData) : newData,
          total,
          hasMore: (more ? list.length : 0) + newData.length < total,
          loading: false
        })
      } else {
         wx.showToast({ title: res.result.message || '加载失败', icon: 'none' })
         this.setData({ loading: false })
      }
    } catch (err) {
      console.error(err)
      this.setData({ loading: false })
    }
  },
  loadMore() {
    if (this.data.hasMore) {
      this.loadData(true)
    }
  },
  async exportCSV() {
    wx.showLoading({ title: '生成中...' })
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'adminManageYouthTraining',
        config: { env: cloudEnv },
        data: { action: 'export' }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.setClipboardData({
          data: res.result.url,
          success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
        })
      } else {
        wx.showToast({ title: '导出失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '导出失败', icon: 'none' })
    }
  },

  onDelete(e) {
    const { id, name } = e.currentTarget.dataset
    if (!id) return
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 ${name || ''} 的报名记录吗？此操作不可恢复。`,
      confirmColor: '#f44336',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          try {
            const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
            const result = await wx.cloud.callFunction({
              name: 'adminManageYouthTraining',
              config: { env: cloudEnv },
              data: { action: 'delete', id }
            })
            
            wx.hideLoading()
            
            if (result.result && result.result.success) {
              wx.showToast({ title: '已删除', icon: 'success' })
              // Refresh list
              this.setData({ list: [], hasMore: true, page: 0, total: 0 })
              this.loadData()
            } else {
              wx.showToast({ title: result.result.message || '删除失败', icon: 'none' })
            }
          } catch (err) {
            wx.hideLoading()
            console.error(err)
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  }
})
