const ocr = require('../../../utils/ocr')

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
  onLoad(options) {
    const campId = options.camp_id || 'camp_hengqin_2026'
    const week = parseInt(options.week || '1')
    const plannedMinutes = parseInt(options.planned || '0')
    const plannedHours = plannedMinutes ? Math.round((plannedMinutes / 60) * 10) / 10 : 0
    this.setData({ campId, week, plannedMinutes, plannedHours })
  },
  chooseImage() {
    wx.chooseImage({ count: 1 }).then(res => {
      const filePath = res.tempFilePaths[0]
      this.setData({ images: [filePath] })
      const ext = (filePath.split('.').pop() || 'jpg').toLowerCase()
      const cloudPath = `t7_images/camp_checkin/${Date.now()}.${ext}`
      return wx.cloud.uploadFile({ cloudPath, filePath })
    }).then(up => {
      this.setData({ uploadedFileID: up.fileID })
      wx.showToast({ title: '正在识别截图文字...', icon: 'none' })
      return ocr.recognizeTextByFileID(up.fileID)
    }).then(text => {
      // 自动解析训练分钟
      const minutes = this.parseMinutes(text)
      const hours = Math.round((minutes / 60) * 10) / 10
      const canSubmit = minutes > 0 && !!this.data.uploadedFileID
      this.setData({ actualMinutes: minutes, actualHours: hours, canSubmit, inputHoursStr: String(hours), inputMinutesStr: '' })
      this.updateCompletion()
      if (minutes > 0) {
        wx.showToast({ title: `识别成功：${hours}小时`, icon: 'success' })
      } else {
        wx.showToast({ title: '未识别到时长，请手动输入', icon: 'none' })
      }
    }).catch(err => {
      const canSubmit = !!this.data.uploadedFileID && this.data.actualMinutes > 0
      this.setData({ canSubmit })
      wx.showToast({ title: '识别失败，请手动输入', icon: 'none' })
    })
  },
  parseMinutes(text) {
    const s = (text || '').toLowerCase()
    let h = 0, m = 0
    const mm = s.match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/)
    if (mm) { h = parseInt(mm[1]); m = parseInt(mm[2]); return h * 60 + m }
    const hm = s.match(/(\d+(?:\.\d+)?)\s*h(\d+)?\s*m?/)
    if (hm) { h = parseFloat(hm[1]); m = hm[2] ? parseInt(hm[2]) : 0; return Math.round(h * 60 + m) }
    const zh = s.match(/(\d+(?:\.\d+)?)\s*小?时(\d+)?\s*分?/)
    if (zh) { h = parseFloat(zh[1]); m = zh[2] ? parseInt(zh[2]) : 0; return Math.round(h * 60 + m) }
    const onlyH = s.match(/(\d+(?:\.\d+)?)\s*(h|小?时)/)
    if (onlyH) { const hh = parseFloat(onlyH[1]); return Math.round(hh * 60) }
    const onlyM = s.match(/(\d+)\s*(m|分)/)
    if (onlyM) { return parseInt(onlyM[1]) }
    return 0
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