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
        env: 'cloudbase-0gvjuae479205e8',
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
    cloudEnv: 'cloudbase-0gvjuae479205e8'
  },

  // 检查登录状态
  checkLoginStatus() {
    const token = wx.getStorageSync('token')
    const userInfo = wx.getStorageSync('userInfo')
    
    if (token && userInfo) {
      this.globalData.token = token
      this.globalData.userInfo = userInfo
      this.globalData.isAdmin = userInfo.role === 'admin'
      console.log('用户已登录:', userInfo.nickName)
    } else {
      console.log('用户未登录')
    }
  },

  // 获取系统信息（使用新的API）
  getSystemInfo() {
    try {
      // 获取设备信息
      const deviceInfo = wx.getDeviceInfo()
      
      // 获取窗口信息
      const windowInfo = wx.getWindowInfo()
      
      // 获取应用基础信息
      const appBaseInfo = wx.getAppBaseInfo()
      
      // 获取系统设置信息
      const systemSetting = wx.getSystemSetting()
      
      // 合并所有信息
      this.globalData.systemInfo = {
        ...deviceInfo,
        ...windowInfo,
        ...appBaseInfo,
        ...systemSetting
      }
      
      console.log('系统信息获取成功:', {
        platform: deviceInfo.platform,
        system: deviceInfo.system,
        version: appBaseInfo.version,
        SDKVersion: appBaseInfo.SDKVersion
      })
      
    } catch (error) {
      console.warn('新API不支持，回退到旧API')
      // 如果新API不支持，回退到旧API（但会有警告）
      wx.getSystemInfo({
        success: (res) => {
          this.globalData.systemInfo = res
          console.log('系统信息:', res.platform, res.version)
        },
        fail: (err) => {
          console.error('获取系统信息失败:', err)
        }
      })
    }
  },

  // 用户登录方法
  login() {
    return new Promise((resolve, reject) => {
      // 检查是否支持新的用户信息获取方式
      if (wx.getUserProfile) {
        wx.getUserProfile({
          desc: '用于完善会员资料',
          success: (res) => {
            console.log('获取用户信息成功:', res.userInfo)
            this.saveUserInfo(res.userInfo)
            resolve(res.userInfo)
          },
          fail: (err) => {
            console.error('获取用户信息失败:', err)
            reject(err)
          }
        })
      } else {
        // 兼容旧版本
        wx.getUserInfo({
          success: (res) => {
            console.log('获取用户信息成功:', res.userInfo)
            this.saveUserInfo(res.userInfo)
            resolve(res.userInfo)
          },
          fail: (err) => {
            console.error('获取用户信息失败:', err)
            reject(err)
          }
        })
      }
    })
  },

  // 保存用户信息
  saveUserInfo(userInfo) {
    // 保存用户信息
    this.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)
    
    // 生成模拟token（实际项目中应该调用后端接口）
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