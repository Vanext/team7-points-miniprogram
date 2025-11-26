const app = getApp()
const imageUtils = require('../../../../utils/imageUtils.js')

Page({
  data: { recordId: '', record: null, loading: true, isAdmin: false },

  onLoad(options) {
    if (options.id) { this.setData({ recordId: options.id }); this.checkAdminStatus() } else { app.showToast('参数错误', 'error'); this.goBack() }
  },

  async checkAdminStatus() {
    const userInfo = app.globalData.userInfo
    if (!userInfo || userInfo.isAdmin !== true) { this.redirectToLogin(); return }
    this.setData({ isAdmin: true }); this.loadRecordDetail()
  },

  redirectToLogin() {
    wx.showModal({ title: '权限不足', content: '只有管理员才能访问此页面', showCancel: false, success: () => { wx.switchTab({ url: '/pages/profile/profile' }) } })
  },

  async loadRecordDetail() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'getPointRecordDetail', data: { recordId: this.data.recordId } })
      if (res.result && res.result.record) {
        let record = res.result.record
        // 处理头像
        if (record.userInfo && record.userInfo.avatarUrl) record.userInfo.avatarUrl = await imageUtils.processAvatarUrl(record.userInfo.avatarUrl)
        // 统一处理图片数组（兼容 imageFileIDs / imageUrl）
        let imgs = []
        if (Array.isArray(record.images)) imgs.push(...record.images)
        if (Array.isArray(record.imageFileIDs)) imgs.push(...record.imageFileIDs)
        if (typeof record.imageFileIDs === 'string') imgs.push(record.imageFileIDs)
        if (typeof record.imageUrl === 'string') imgs.push(record.imageUrl)
        // 转换到可显示 URL
        record.images = await imageUtils.processImageUrls(imgs, '/images/default-image.png')
        record.submitTimeFormatted = app.formatTime(record.submitTime)
        if (record.auditTime) record.auditTimeFormatted = app.formatTime(record.auditTime)
        this.setData({ record })
      } else { app.showToast('记录不存在', 'error'); this.goBack() }
    } catch (e) { console.error('获取记录详情失败', e); app.showToast('获取详情失败', 'error'); this.goBack() } finally { this.setData({ loading: false }) }
  },

  previewImage(e) {
    const index = e.currentTarget.dataset.index
    const urls = Array.isArray(this.data.record.images) ? this.data.record.images : []
    if (!urls.length) return wx.showToast({ title: '暂无图片', icon: 'none' })
    wx.previewImage({ current: urls[index], urls })
  },

  async approveRecord() { await this.updateRecordStatus('approved') },
  async rejectRecord() {
    wx.showModal({ title: '拒绝原因', editable: true, placeholderText: '请输入拒绝原因', success: async (r) => { if (r.confirm) await this.updateRecordStatus('rejected', r.content || '不符合积分规则') } })
  },

  async updateRecordStatus(status, reason = '') {
    app.showLoading('处理中...')
    try {
      const res = await wx.cloud.callFunction({ name: 'auditPointRecord', data: { recordId: this.data.recordId, status, reason } })
      if (res.result && res.result.success) { app.showToast('操作成功'); this.loadRecordDetail() } else { app.showToast(res.result.message || '操作失败', 'error') }
    } catch (e) { console.error('审核操作失败', e); app.showToast('操作失败', 'error') } finally { app.hideLoading() }
  },

  goBack() { wx.navigateBack() }
})