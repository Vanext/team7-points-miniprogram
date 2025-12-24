Page({
  data: {
    campId: '',
    week: 1,
    plannedMinutes: 0,
    plannedHours: 0,
    images: [],
    actualMinutes: 0,
    actualHours: 0,
    submitting: false,
    canSubmit: false,
    inputHoursStr: '',
    inputMinutesStr: '',
    completionRate: 0
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
    if (!size || size <= 900 * 1024) return originalPath
    let quality = 80
    if (size > 5 * 1024 * 1024) quality = 60
    else if (size > 2 * 1024 * 1024) quality = 70
    try {
      const out = await wx.compressImage({ src: originalPath, quality })
      const compressedPath = (out && out.tempFilePath) || originalPath
      return compressedPath
    } catch (_) {
      return originalPath
    }
  },
  onLoad(options) {
    const campId = options.camp_id || 'camp_hengqin_2026'
    const week = parseInt(options.week || '1')
    const plannedMinutes = parseInt(options.planned || '0')
    const plannedHours = plannedMinutes ? Math.round((plannedMinutes / 60) * 10) / 10 : 0
    this.setData({ campId, week, plannedMinutes, plannedHours })
  },
  async chooseImage() {
    try {
      const res = await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
      const filePath = res.tempFilePaths[0]
      this.setData({ images: [filePath] })
      const uploadPath = await this.compressImageForUpload(filePath)
      const ext = this.getFileExt(uploadPath, 'jpg')
      const cloudPath = `t7_images/camp_checkin/${Date.now()}.${ext}`
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: uploadPath })
      const uploadedFileID = up.fileID
      const canSubmit = !!uploadedFileID && (this.data.actualMinutes || 0) > 0
      this.setData({ uploadedFileID, canSubmit })
      wx.showToast({ title: '上传成功，请手动输入时长', icon: 'none' })
    } catch (err) {
      const canSubmit = !!this.data.uploadedFileID && (this.data.actualMinutes || 0) > 0
      this.setData({ canSubmit })
      wx.showToast({ title: '上传失败，请重试', icon: 'none' })
    }
  },
  onHoursInput(e) {
    let v = parseFloat(String(e.detail.value || '0').replace(/[^\d.]/g, ''))
    if (isNaN(v)) v = 0
    v = Math.max(0, Math.round(v * 10) / 10)
    const minutes = Math.round(v * 60)
    const canSubmit = minutes > 0 && !!this.data.uploadedFileID
    this.setData({ actualHours: v, actualMinutes: minutes, canSubmit })
    this.updateCompletion()
  },
  onHoursPartInput(e) {
    const v = String(e.detail.value || '').replace(/[^\d.]/g, '')
    this.setData({ inputHoursStr: v })
    this.computeFromInputs()
  },
  onMinutesPartInput(e) {
    const v = String(e.detail.value || '').replace(/[^\d]/g, '')
    this.setData({ inputMinutesStr: v })
    this.computeFromInputs()
  },
  computeFromInputs() {
    const hs = this.data.inputHoursStr || ''
    const ms = this.data.inputMinutesStr || ''
    let h = parseFloat(hs)
    if (isNaN(h)) h = 0
    let m = parseInt(ms)
    if (isNaN(m)) m = 0
    if (ms !== '') {
      const hi = Math.floor(h)
      m = Math.min(Math.max(m, 0), 59)
      const total = hi * 60 + m
      const hh = Math.round((total / 60) * 10) / 10
      const canSubmit = total > 0 && !!this.data.uploadedFileID
      this.setData({ actualMinutes: total, actualHours: hh, canSubmit })
      this.updateCompletion()
    } else {
      const hh = Math.max(0, Math.round(h * 10) / 10)
      const total = Math.round(hh * 60)
      const canSubmit = total > 0 && !!this.data.uploadedFileID
      this.setData({ actualMinutes: total, actualHours: hh, canSubmit })
      this.updateCompletion()
    }
  },
  updateCompletion() {
    const planned = this.data.plannedMinutes || 0
    const actual = this.data.actualMinutes || 0
    let rate = 0
    if (planned > 0) rate = Math.min(100, Math.round((actual / planned) * 100))
    this.setData({ completionRate: rate })
  },
  submit() {
    if (!this.data.canSubmit || !this.data.images.length) return
    this.setData({ submitting: true })
    const categoryName = '横琴训练营'
    const hours = Math.max(0, this.data.actualHours)
    const points = Math.min(Math.round(hours) * 2, 40)
    const imageFileIDs = [this.data.uploadedFileID].filter(Boolean)
    Promise.resolve().then(() => {
      const formData = {
        campTraining: true,
        category: 'camp',
        description: `周${this.data.week}打卡：手工录入 ${hours} 小时`,
        images: this.data.images
      }
      return wx.cloud.callFunction({
        name: 'submitPoints',
        data: {
          formData,
          points,
          categoryId: 'camp',
          categoryName,
          imageFileIDs,
          camp_id: this.data.campId,
          week_num: this.data.week,
          actual_minutes: this.data.actualMinutes
        }
      })
    }).then(res => {
      this.setData({ submitting: false })
      if (res && res.result && res.result.success) {
        wx.showToast({ title: '提交成功，待审核', icon: 'success' })
        setTimeout(() => { wx.navigateBack({ delta: 1 }) }, 1500)
      } else {
        wx.showToast({ title: '提交失败', icon: 'error' })
      }
    }).catch(() => {
      this.setData({ submitting: false })
      wx.showToast({ title: '提交失败', icon: 'error' })
    })
  }
})
