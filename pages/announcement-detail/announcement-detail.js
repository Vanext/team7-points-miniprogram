const app = getApp()

Page({
  data: {
    detail: {
      title: '',
      content: '',
      time: ''
    }
  },

  onLoad(options){
    // 支持通过 options 传对象 JSON 字符串或 id
    if (options && options.detail) {
      try {
        const detail = JSON.parse(decodeURIComponent(options.detail))
        this.setData({ detail })
        return
      } catch (e) {
        console.warn('parse detail failed', e)
      }
    }
    if (options && options.id) {
      this.fetchById(options.id)
    }
  },

  async fetchById(id){
    try {
      app.showLoading('加载中')
      // 使用与全局一致的云环境，避免跨环境导致数据读取失败
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const db = wx.cloud.database({ env: cloudEnv })
      const res = await db.collection('announcements').doc(id).get()
      const data = res.data || {}
      this.setData({
        detail: {
          title: data.title || '公告',
          content: data.content || '',
          time: data.createTime ? this.formatTime(new Date(data.createTime)) : ''
        }
      })
    } catch (e) {
      console.error(e)
      app.showToast('加载失败', 'error')
    } finally {
      wx.hideLoading()
    }
  },

  formatTime(date){
    const y = date.getFullYear()
    const m = (date.getMonth()+1).toString().padStart(2,'0')
    const d = date.getDate().toString().padStart(2,'0')
    const hh = date.getHours().toString().padStart(2,'0')
    const mm = date.getMinutes().toString().padStart(2,'0')
    return `${y}-${m}-${d} ${hh}:${mm}`
  }
})
