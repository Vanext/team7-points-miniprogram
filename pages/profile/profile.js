const app = getApp()

Page({
  data: {
    userInfo: {},
    stats: {
      points: 0,
      rank: '-',
      days: 0
    },
    loading: true,
    unreadMsgCount: 0
  },

  onLoad() {
    this.loadUserData()
  },

  onShow() {
    this.loadUserData()
    this.loadUnreadMessages()
  },

  async loadUserData() {
    try {
      this.setData({ loading: true })
      
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';

      // 1. 获取 OpenID
      console.log('正在调用 login 云函数, env:', cloudEnv);
      const { result: loginRes } = await wx.cloud.callFunction({
        name: 'login',
        config: {
          env: cloudEnv
        }
      })
      
      if (!loginRes || !loginRes.openid) {
        throw new Error('Login failed: no openid returned');
      }
      
      const openid = loginRes.openid
      console.log('获取到 OpenID:', openid);
      
      // 2. 获取用户档案
      console.log('正在调用 getUserProfile 云函数');
      const { result: userRes } = await wx.cloud.callFunction({
        name: 'getUserProfile',
        data: { userId: openid },
        config: {
          env: cloudEnv
        }
      })

      if (userRes && userRes.success) {
        const userInfo = userRes.data.userInfo
        const displayName = userInfo.nickName || userInfo.nickname || userInfo.realName || '微信用户'
        const avatar = userInfo.avatarUrl || '/images/default-avatar.png'
        const isAdmin = userInfo.isAdmin === true
        this.setData({
          userInfo: {
            ...userInfo,
            nickName: displayName,
            avatarUrl: avatar,
            id: userInfo._id,
            isAdmin: isAdmin
          },
          stats: {
            points: userInfo.totalPoints || 0,
            rank: userInfo.rank || '-',
            days: 0
          },
          loading: false
        })
        app.globalData.userInfo = this.data.userInfo;
        app.globalData.isAdmin = isAdmin;
        try {
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const db = wx.cloud.database({ env: cloudEnv })
          let joinDate = userInfo.joinDate || userInfo.createTime || null
          if (!joinDate) {
            await db.collection('users').where({ _openid: openid }).update({ data: { joinDate: db.serverDate() } })
            joinDate = Date.now()
          }
          const jd = new Date(joinDate)
          const now = Date.now()
          const diff = Math.max(0, Math.floor((now - jd.getTime()) / 86400000) + 1)
          let display = ''
          if (diff >= 365) {
            const years = Math.floor(diff / 365)
            const days = diff % 365
            display = years + '年' + (days > 0 ? days + '天' : '')
          } else {
            display = diff + '天'
          }
          this.setData({ 'stats.days': diff, joinDaysDisplay: display })
        } catch (_) {}
      } else {
        // 用户可能未注册
        console.log('用户未注册或获取档案失败:', userRes);
        this.setData({
          userInfo: {},
          stats: {
            points: 0,
            rank: '-',
            days: 0
          },
          loading: false
        })
      }
    } catch (err) {
      console.error('加载用户数据失败:', err)
      this.setData({ loading: false })
      // 不弹窗报错，以免影响未登录用户的体验
    }
  },

  async loadUnreadMessages() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const r = await wx.cloud.callFunction({ name: 'messageManager', data: { action: 'getUnreadSummary', query: {} }, config: { env: cloudEnv } })
      const c = (r && r.result && r.result.success && r.result.data && r.result.data.counts && typeof r.result.data.counts.all === 'number') ? r.result.data.counts.all : 0
      this.setData({ unreadMsgCount: c })
    } catch (_) { this.setData({ unreadMsgCount: 0 }) }
  },

  login() {
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
    
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: async (res) => {
        try {
          wx.showLoading({ title: '登录中...' })
          console.log('调用 registerUser, env:', cloudEnv);
          
          const { result } = await wx.cloud.callFunction({
            name: 'registerUser',
            data: { userInfo: res.userInfo },
            config: {
              env: cloudEnv
            }
          })
          
          console.log('registerUser result:', result);
          
          if (result && result.success) {
            wx.showToast({ title: '登录成功' })
            this.loadUserData() // 刷新数据
          } else {
            throw new Error((result && result.message) || '注册失败')
          }
        } catch (err) {
          console.error('登录流程错误:', err)
          wx.showToast({ title: '登录失败: ' + (err.message || '未知错误'), icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err)
        wx.showToast({ title: '登录已取消', icon: 'none' })
      }
    })
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url
    // 允许未登录导航，具体页面内做拦截
    
    wx.navigateTo({
      url,
      fail: (err) => {
        console.error('导航失败:', err);
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        })
      }
    })
  }
})
