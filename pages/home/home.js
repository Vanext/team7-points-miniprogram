// pages/home/home.js
const app = getApp()

Page({
  data: {
    userInfo: {},
    announcements: [],
    recentPoints: [],
    partners: Array(6).fill({ url: '' }),
    annExpandedIndex: -1,
    loading: true,
    isLoggedIn: false
  },

  onLoad() {
    this.loadData()
    const cachedPartners = wx.getStorageSync('partners_config')
    if (cachedPartners) {
      this.setData({ partners: cachedPartners })
    }
  },

  onShow() {
    this.loadData()
    this.startAnnAutoScroll()
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const token = wx.getStorageSync('token') || ''
      const isLoggedInByToken = !!token
      this.setData({ isLoggedIn: isLoggedInByToken })

      // 1. 获取 OpenID
      const { result: loginRes } = await wx.cloud.callFunction({ 
        name: 'login',
        config: {
          env: cloudEnv
        }
      })
      const openid = loginRes.openid
      
      // 2. 获取用户档案
      const { result: userRes } = await wx.cloud.callFunction({
        name: 'getUserProfile',
        config: {
          env: cloudEnv
        },
        data: { userId: openid }
      })

      let userInfo = {
        nickName: '未登录',
        avatarUrl: '/images/default-avatar.png',
        totalPoints: 0,
        isActivated: false
      }

      if (userRes.success && userRes.data && userRes.data.userInfo) {
        const u = userRes.data.userInfo
        const displayName = u.nickName || u.nickname || u.realName || '微信用户'
        const avatar = u.avatarUrl || '/images/default-avatar.png'
        userInfo = { ...u, nickName: displayName, avatarUrl: avatar, isActivated: true }
        app.globalData.userInfo = userInfo;
        app.globalData.isAdmin = u.isAdmin === true
        this.setData({ isLoggedIn: true })
      }

      // 3. 获取公告 (直接查询数据库)
      const { result: annRes } = await wx.cloud.callFunction({
        name: 'getAnnouncements',
        config: { env: cloudEnv },
        data: { limit: 5, homeOnly: true }
      })

      const annList = annRes && annRes.success ? annRes.data : []
      const announcements = (annList || []).map(item => ({
        id: item._id || String(item.createTime),
        title: item.title || '',
        content: item.content || '',
        createTime: this.formatTime(item.createTime)
      }))

      // 4. 训练营申请状态（云函数）
      let campStatus = 'none'
      try {
        const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'getMyStatus' } })
        if (r.result && r.result.success) campStatus = r.result.status || 'none'
      } catch (_) {
        try {
          const db = wx.cloud.database({ env: cloudEnv })
          const appRes = await db.collection('camp_applications').where({ _openid: openid }).orderBy('applyTime','desc').limit(1).get()
          const rec = (appRes && appRes.data && appRes.data[0]) || null
          if (rec && rec.status === 'approved') campStatus = 'approved'
          else if (rec && rec.status === 'pending') campStatus = 'pending'
        } catch (__) {}
      }

      this.setData({
        userInfo,
        announcements,
        recentPoints: [],
        campStatus
      })
      
    } catch (error) {
      console.error('加载失败:', error)
      // 即使加载失败也显示默认状态，不频繁弹窗打扰用户
    } finally {
      this.setData({ loading: false })
    }
  },

  toggleAnnExpand(e) {
    const idx = e.currentTarget.dataset.index
    const cur = this.data.annExpandedIndex
    this.setData({ annExpandedIndex: cur === idx ? -1 : idx })
  },

  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  onUnload() {
    this.stopAnnAutoScroll()
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
  },

  navigateToLeaderboard() {
    wx.switchTab({
      url: '/pages/leaderboard/leaderboard'
    })
  },

  navigateToProfile() {
    wx.switchTab({
      url: '/pages/profile/profile'
    })
  },

  navigateToTrainingAssistant() {
    wx.navigateTo({
      url: '/pages/training-assistant/training-assistant'
    })
  }
  ,
  navigateToTools() {
    wx.navigateTo({
      url: '/pages/tools/tools'
    })
  },
  onJoinCamp() {
    const status = this.data.campStatus
    if (status === 'approved') {
      wx.navigateTo({ url: '/pages/camp/home/home' })
      return
    }
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    wx.showLoading({ title: '提交申请...' })
    wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'apply' } })
      .then(r => {
        wx.hideLoading()
        if (r.result && r.result.success) {
          wx.showToast({ title: '已提交审核', icon: 'success' })
          this.setData({ campStatus: 'pending' })
        } else {
          wx.showToast({ title: '提交失败', icon: 'none' })
        }
      })
      .catch(err => {
        try {
          const db = wx.cloud.database({ env: cloudEnv })
          db.collection('camp_applications').add({ data: { status: 'pending', applyTime: Date.now() } })
            .then(() => {
              wx.hideLoading()
              wx.showToast({ title: '已提交审核', icon: 'success' })
              this.setData({ campStatus: 'pending' })
            })
            .catch(e => {
              wx.hideLoading()
              wx.showToast({ title: '提交失败', icon: 'none' })
              console.error('申请失败', e)
            })
        } catch (e2) {
          wx.hideLoading()
          wx.showToast({ title: '提交失败', icon: 'none' })
          console.error('申请失败', e2)
        }
      })
  },

  onAnnSwiperChange() {
    this.stopAnnAutoScroll()
    this.setData({ annScrollTop: 0 })
    this.startAnnAutoScroll()
  },

  startAnnAutoScroll() {
    if (this.annTimer) clearInterval(this.annTimer)
    this.annTimer = setInterval(() => {
      const cur = this.data.annScrollTop || 0
      const next = cur >= 2000 ? 0 : cur + 2
      this.setData({ annScrollTop: next })
    }, 60)
  },

  stopAnnAutoScroll() {
    if (this.annTimer) {
      clearInterval(this.annTimer)
      this.annTimer = null
    }
  },

  uploadPartnerImage(e) {
    const index = e.currentTarget.dataset.index
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        const cloudPath = `partners/partner_${index}_${Date.now()}.png`
        
        wx.showLoading({ title: '上传中...' })
        
        try {
          const { fileID } = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath,
            config: {
              env: app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
            }
          })
          
          const partners = this.data.partners
          partners[index] = { url: fileID }
          this.setData({ partners })
          wx.setStorageSync('partners_config', partners)
          
          wx.hideLoading()
          wx.showToast({ title: '上传成功', icon: 'success' })
        } catch (error) {
          console.error('上传失败', error)
          wx.hideLoading()
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  }
})
