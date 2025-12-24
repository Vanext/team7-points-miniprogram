const app = getApp()
const imageUtils = require('../../utils/imageUtils.js')

Page({
  data: {
    userInfo: null,
    tempNickname: '',
    saving: false
  },
  getFileExt(filePath, fallbackExt = 'jpg') {
    const m = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/)
    return (m && m[1] ? m[1] : fallbackExt).toLowerCase()
  },
  getFileSizeBytes(filePath) {
    return new Promise((resolve) => {
      wx.getFileInfo({
        filePath,
        success: (res) => resolve(res && typeof res.size === 'number' ? res.size : 0),
        fail: () => resolve(0)
      })
    })
  },
  async compressImageForUpload(filePath) {
    const originalPath = filePath
    const size = await this.getFileSizeBytes(originalPath)
    if (!size || size <= 500 * 1024) return originalPath
    let quality = 75
    if (size > 3 * 1024 * 1024) quality = 60
    else if (size > 1.5 * 1024 * 1024) quality = 70
    try {
      const out = await wx.compressImage({ src: originalPath, quality })
      return (out && out.tempFilePath) || originalPath
    } catch (_) {
      return originalPath
    }
  },

  onLoad() {
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  async loadUserInfo() {
    const g = getApp()
    let userInfo = g.globalData.userInfo
    if (!userInfo) {
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    try {
      const cloudEnv = g.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const db = wx.cloud.database({ env: cloudEnv })
      const res = await db.collection('users').where({ _openid: userInfo._openid }).get()
      if (res.data && res.data.length > 0) {
        const u = res.data[0]
        userInfo = { ...userInfo, ...u, avatarUrl: u.avatarUrl || userInfo.avatarUrl, nickName: u.nickName || userInfo.nickName }
        g.globalData.userInfo = userInfo
        let dbUserInfo = { ...u }
        if (dbUserInfo.joinDate) dbUserInfo.formattedJoinDate = app.formatTime(dbUserInfo.joinDate)
        this.setData({ dbUserInfo })
      }
      let processed = { ...userInfo }
      if (processed.avatarUrl) {
        try { processed.avatarUrl = await imageUtils.processAvatarUrl(processed.avatarUrl) } catch (_) { processed.avatarUrl = '/images/default-avatar.png' }
      } else {
        processed.avatarUrl = '/images/default-avatar.png'
      }
      this.setData({ userInfo: processed })
    } catch (error) {
      let processed = { ...userInfo }
      if (processed.avatarUrl) {
        try { processed.avatarUrl = await imageUtils.processAvatarUrl(processed.avatarUrl) } catch (_) { processed.avatarUrl = '/images/default-avatar.png' }
      } else {
        processed.avatarUrl = '/images/default-avatar.png'
      }
      this.setData({ userInfo: processed })
    }
  },

  async getUserFromDB(openid) {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const db = wx.cloud.database({ env: cloudEnv })
      const res = await db.collection('users').where({ _openid: openid }).get()
      if (res.data.length > 0) return res.data[0]
      return null
    } catch (err) {
      return null
    }
  },

  onAvatarTap() {
    wx.showActionSheet({
      itemList: ['从相册选择', '拍照'],
      success: (res) => {
        const sourceType = res.tapIndex === 0 ? ['album'] : ['camera']
        this.chooseImage(sourceType)
      }
    })
  },

  chooseImage(sourceType) {
    wx.chooseImage({
      count: 1,
      sourceType,
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadAvatar(tempFilePath)
      }
    })
  },

  async uploadAvatar(tempFilePath) {
    wx.showLoading({ title: '上传中...' })
    try {
      const user = this.data.userInfo
      if (!user || !user._openid) { app.showToast('用户信息异常', 'error'); return }
      const uploadPath = await this.compressImageForUpload(tempFilePath)
      const fileExtension = this.getFileExt(uploadPath, 'jpg')
      const fileName = `t7_images/avatars/${user._openid}_${Date.now()}.${fileExtension}`
      const uploadResult = await wx.cloud.uploadFile({ cloudPath: fileName, filePath: uploadPath })
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const db = wx.cloud.database({ env: cloudEnv })
      await db.collection('users').where({ _openid: user._openid }).update({ data: { avatarUrl: uploadResult.fileID } })
      const updatedUserInfo = { ...user, avatarUrl: uploadResult.fileID }
      this.setData({ userInfo: updatedUserInfo })
      app.globalData.userInfo = updatedUserInfo
      wx.setStorageSync('userInfo', updatedUserInfo)
      this.clearLeaderboardCache()
      wx.hideLoading()
      app.showToast('头像更新成功')
    } catch (err) {
      wx.hideLoading()
      app.showToast('上传失败，请重试', 'error')
    }
  },

  onNicknameInput(e) {
    this.setData({ tempNickname: e.detail.value })
  },

  saveProfile() {
    if (this.data.saving) return
    const tempNickname = this.data.tempNickname
    const userInfo = this.data.userInfo
    if (!tempNickname || tempNickname.trim().length === 0) { app.showToast('昵称不能为空', 'error'); return }
    if (tempNickname.length > 20) { app.showToast('昵称不能超过20个字符', 'error'); return }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    const db = wx.cloud.database({ env: cloudEnv })
    // 仅更新昵称，避免将已处理为临时HTTP地址的头像URL写回数据库（临时URL会过期导致头像失效）
    // 如果需要同时更新头像，请使用上传头像流程，该流程会写入永久的 fileID。
    db.collection('users').where({ _openid: userInfo._openid }).update({ data: { nickName: tempNickname.trim() } })
      .then(() => {
        userInfo.nickName = tempNickname.trim()
        app.globalData.userInfo = userInfo
        wx.setStorageSync('userInfo', userInfo)
        this.clearLeaderboardCache()
        wx.hideLoading()
        app.showToast('保存成功')
        setTimeout(() => { wx.navigateBack() }, 1500)
        this.setData({ saving: false })
      })
      .catch(() => {
        wx.hideLoading()
        app.showToast('保存失败，请重试', 'error')
        this.setData({ saving: false })
      })
  },

  clearLeaderboardCache() {
    try {
      wx.removeStorageSync('leaderboard_cache')
      wx.removeStorageSync('leaderboard_cache_time')
    } catch (e) {}
  },

  goBack() {
    wx.navigateBack()
  }
})
