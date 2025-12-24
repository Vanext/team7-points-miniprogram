// app.js

App({
  onLaunch() {
    console.log('Team 7 积分小程序启动')
    
    // 检查云开发支持
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      // 初始化云开发
      wx.cloud.init({
        env: 'cloudbase-0gvjuqae479205e8',
        traceUser: true
      })
      console.log('云开发初始化成功')
    }

    // 检查登录态
    this.checkLoginStatus()
    
    // 获取系统信息（使用新API）
    this.getSystemInfo()
  },

  onShow() {
    console.log('小程序显示')
  },

  onHide() {
    console.log('小程序隐藏')
  },

  onError(msg) {
    console.error('小程序发生错误:', msg)
  },

  globalData: {
    userInfo: null,
    token: null,
    isAdmin: false,
    version: '1.0.0',
    systemInfo: {},
    cloudEnv: 'cloudbase-0gvjuqae479205e8'
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    
    if (token && userInfo) {
      this.globalData.token = token
      this.globalData.userInfo = userInfo
      // 修复管理员状态读取：以数据库中的 isAdmin 布尔值为准
      this.globalData.isAdmin = userInfo.isAdmin === true
      console.log('用户已登录:', userInfo.nickName)
    } else {
      console.log('用户未登录')
    }
  },

  // 获取系统信息（使用新的API）
  getSystemInfo() {
    const info = {}
    try { if (typeof wx.getDeviceInfo === 'function') Object.assign(info, wx.getDeviceInfo()) } catch (_) {}
    try { if (typeof wx.getWindowInfo === 'function') Object.assign(info, wx.getWindowInfo()) } catch (_) {}
    try { if (typeof wx.getAppBaseInfo === 'function') Object.assign(info, wx.getAppBaseInfo()) } catch (_) {}
    try { if (typeof wx.getSystemSetting === 'function') Object.assign(info, wx.getSystemSetting()) } catch (_) {}
    this.globalData.systemInfo = info
    try {
      const p = info.platform || ''
      const s = info.system || ''
      const v = info.version || ''
      const sdk = info.SDKVersion || ''
      console.log('系统信息获取成功:', { platform: p, system: s, version: v, SDKVersion: sdk })
    } catch (_) {}
  },

  // 用户登录方法（注册并以数据库为准回填资料）
  login() {
    return new Promise((resolve, reject) => {
      const cloudEnv = this.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const completeLogin = async (rawUserInfo) => {
        try {
          wx.showLoading({ title: '登录中...' })
          // 注册/更新用户资料到数据库
          await wx.cloud.callFunction({ name: 'registerUser', config: { env: cloudEnv }, data: { userInfo: rawUserInfo } })
          // 获取 openid
          const { result: loginRes } = await wx.cloud.callFunction({ name: 'login', config: { env: cloudEnv } })
          const openid = loginRes && loginRes.openid
          if (!openid) throw new Error('未获取到openid')
          // 以数据库为准回填用户资料
          const db = wx.cloud.database({ env: cloudEnv })
          const ures = await db.collection('users').where({ _openid: openid }).limit(1).get()
          const dbUser = (ures.data && ures.data[0]) || null
          if (!dbUser) throw new Error('用户未注册')
          this.globalData.userInfo = { ...dbUser }
          this.globalData.isAdmin = dbUser.isAdmin === true
          wx.setStorageSync('userInfo', this.globalData.userInfo)
          // 生成并保存模拟 token（保持原行为）
          const token = 'mock_token_' + Date.now()
          this.globalData.token = token
          wx.setStorageSync('token', token)
          wx.hideLoading()
          resolve(this.globalData.userInfo)
        } catch (err) {
          wx.hideLoading()
          reject(err)
        }
      }

      if (wx.getUserProfile) {
        wx.getUserProfile({
          desc: '用于完善会员资料',
          success: (res) => { completeLogin(res.userInfo) },
          fail: (err) => { reject(err) }
        })
      } else {
        wx.getUserInfo({
          success: (res) => { completeLogin(res.userInfo) },
          fail: (err) => { reject(err) }
        })
      }
    })
  },

  // 保存用户信息（保留方法以兼容旧调用，但不覆盖数据库字段）
  saveUserInfo(userInfo) {
    const prev = this.globalData.userInfo || {}
    const incoming = userInfo || {}
    const sanitized = { ...incoming }
    // 避免用占位符覆盖已有头像/昵称
    if (!incoming.avatarUrl || incoming.avatarUrl === '/images/default-avatar.png') {
      sanitized.avatarUrl = prev.avatarUrl || incoming.avatarUrl
    }
    const incName = incoming.nickName || incoming.nickname || incoming.realName
    const prevName = prev.nickName || prev.nickname || prev.realName
    if (!incName || incName === '微信用户' || incName === '未登录') {
      if (prevName) {
        sanitized.nickName = prev.nickName || prev.nickname || prev.realName
      }
    }
    const merged = { ...prev, ...sanitized }
    this.globalData.userInfo = merged
    wx.setStorageSync('userInfo', merged)
    const token = 'mock_token_' + Date.now()
    this.globalData.token = token
    wx.setStorageSync('token', token)
  },

  // 获取用户授权状态
  checkUserAuthorize() {
    if (wx.getAppAuthorizeSetting) {
      const authSetting = wx.getAppAuthorizeSetting()
      console.log('用户授权状态:', authSetting)
      return authSetting
    }
    return {}
  },

  // 格式化时间
  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  },

  // 统一提示方法
  showToast(title, icon = 'success') {
    wx.showToast({
      title: title,
      icon: icon,
      duration: 2000
    })
  },

  // 统一加载提示
  showLoading(title = '加载中...') {
    wx.showLoading({
      title: title,
      mask: true
    })
  },

  hideLoading() {
    wx.hideLoading()
  },

  // 统一错误处理
  handleError(error, defaultMsg = '操作失败') {
    console.error('错误:', error)
    const message = error.message || error.errMsg || defaultMsg
    this.showToast(message, 'error')
  },

  // 网络请求封装
  request(options) {
    return new Promise((resolve, reject) => {
      const { url, method = 'GET', data = {}, header = {} } = options
      
      // 添加token
      if (this.globalData.token) {
        header.Authorization = `Bearer ${this.globalData.token}`
      }

      wx.request({
        url: url,
        method: method,
        data: data,
        header: {
          'Content-Type': 'application/json',
          ...header
        },
        success: (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.data.message || '请求失败'}`))
          }
        },
        fail: (err) => {
          reject(new Error(err.errMsg || '网络请求失败'))
        }
      })
    })
  },

  // 格式化时间工具方法
  formatTime(date) {
    if (!date) return ''
    
    const now = new Date(date)
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  // 获取今天的日期字符串
  getTodayString() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
})
