// pages/home/home.js
const app = getApp()

Page({
  data: {
    userInfo: {},
    announcements: [],
    recentPoints: [],
    loading: true
  },

  onLoad() {
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      
      // 模拟数据（实际项目中连接后端API）
      const userInfo = {
        nickName: '新用户',
        totalPoints: 0,
        isActivated: false
      }
      
      const announcements = [
        {
          id: 1,
          title: '欢迎使用Team 7积分系统！',
          createTime: '刚刚'
        }
      ]

      this.setData({
        userInfo,
        announcements,
        recentPoints: []
      })
      
    } catch (error) {
      console.error('加载失败:', error)
      app.showToast('加载失败', 'error')
    } finally {
      this.setData({ loading: false })
    }
  },

  navigateToUpload() {
    wx.switchTab({
      url: '/pages/upload/upload'
    })
  },

  navigateToStore() {
    wx.switchTab({
      url: '/pages/store/store'
    })
  }
})
