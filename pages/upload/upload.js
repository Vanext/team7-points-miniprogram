const app = getApp()

Page({
  data: {
    currentTab: 2, // Default to Training as per screenshot
    date: '',
    description: '',
    imageUrls: [],
    fileIds: [],
    showRulesModal: false,
    
    // Match Data
    matchTypes: ['大铁', '70.3', '标铁', '路跑赛事（半程以上）'],
    selectedMatchType: '',
    isPodium: false,
    
    // Activity Data
    activityTypes: ['分享会等大型俱乐部集体活动', '团练活动'],
    selectedActivityType: '',
    
    // Training Data
    hoursList: [],
    selectedHours: null,
    
    // Construction Data
    constructionTypes: ['公众号投稿', '拓展新会员'],
    selectedConstructionType: ''
  },

  onLoad() {
    // Initialize Date
    const today = new Date().toISOString().substring(0, 10)
    
    // Initialize Hours List (1-30)
    const hours = []
    for (let i = 1; i <= 30; i++) {
      hours.push(i)
    }

    this.setData({
      date: today,
      hoursList: hours
    })
  },

  // Tab Switching
  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({
      currentTab: index,
      // Reset form fields slightly but keep date? Or reset all? 
      // Let's keep date, reset others for better UX
      description: '',
      imageUrls: [],
      fileIds: [],
      selectedMatchType: '',
      isPodium: false,
      selectedActivityType: '',
      selectedHours: null,
      selectedConstructionType: ''
    })
  },

  // Rules Modal
  showRules() {
    this.setData({ showRulesModal: true })
  },

  hideRules() {
    this.setData({ showRulesModal: false })
  },

  // Field Handlers
  bindDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  bindDescriptionInput(e) {
    this.setData({ description: e.detail.value })
  },

  // Match Handlers
  bindMatchTypeChange(e) {
    this.setData({ selectedMatchType: this.data.matchTypes[e.detail.value] })
  },

  bindPodiumChange(e) {
    this.setData({ isPodium: e.detail.value })
  },

  // Activity Handlers
  bindActivityTypeChange(e) {
    this.setData({ selectedActivityType: this.data.activityTypes[e.detail.value] })
  },

  // Training Handlers
  selectHours(e) {
    this.setData({ selectedHours: e.currentTarget.dataset.hours })
  },

  // Construction Handlers
  bindConstructionTypeChange(e) {
    this.setData({ selectedConstructionType: this.data.constructionTypes[e.detail.value] })
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
    if (!size || size <= 700 * 1024) return originalPath

    let quality = 75
    if (size > 5 * 1024 * 1024) quality = 55
    else if (size > 2 * 1024 * 1024) quality = 65

    try {
      const out = await wx.compressImage({ src: originalPath, quality })
      const compressedPath = (out && out.tempFilePath) || originalPath
      const after = await this.getFileSizeBytes(compressedPath)
      if (after && after > 2 * 1024 * 1024 && quality > 55) {
        const out2 = await wx.compressImage({ src: compressedPath, quality: Math.max(45, quality - 10) })
        return (out2 && out2.tempFilePath) || compressedPath
      }
      return compressedPath
    } catch (_) {
      return originalPath
    }
  },

  // Image Upload
  chooseImage() {
    const remain = Math.max(0, 3 - (this.data.imageUrls.length || 0))
    if (remain <= 0) { wx.showToast({ title: '最多上传3张', icon: 'none' }); return }
    wx.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFilePaths || []
        if (!files.length) return
        wx.showLoading({ title: '上传图片中...' })
        try {
          const urls = (this.data.imageUrls || []).slice()
          const ids = (this.data.fileIds || []).slice()
          for (let i = 0; i < files.length; i++) {
            const tempFilePath = files[i]
            const uploadPath = await this.compressImageForUpload(tempFilePath)
            const ext = this.getFileExt(uploadPath, 'jpg')
            const cloudPath = `uploads/${Date.now()}-${Math.floor(Math.random() * 100000)}-${i}.${ext}`
            const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: uploadPath })
            urls.push(tempFilePath)
            ids.push(uploadRes.fileID)
          }
          this.setData({ imageUrls: urls.slice(0,3), fileIds: ids.slice(0,3) })
        } catch (err) {
          console.error('Upload failed', err)
          wx.showToast({ title: '图片上传失败', icon: 'none' })
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // Submit Form
  async submitForm() {
    const { currentTab, date, description, fileIds, selectedMatchType, isPodium, selectedActivityType, selectedHours, selectedConstructionType } = this.data

    // Validation
    if (!description) {
      wx.showToast({ title: '请填写描述', icon: 'none' })
      return
    }
    
    // Check specific fields based on tab
    let categoryId, categoryName, formData = {}, points = 0

    if (currentTab === 0) { // Match
      if (!selectedMatchType) {
        wx.showToast({ title: '请选择比赛类型', icon: 'none' })
        return
      }
      categoryId = 'match'
      categoryName = '参加比赛'
      formData = {
        date,
        matchType: selectedMatchType,
        isPodium,
        description,
        images: fileIds
      }
      
      // Calculate points (based on rules)
      const pointMap = {
        '大铁': 1500,
        '70.3': 700,
        '标铁': 300,
        '路跑赛事（半程以上）': 100
      }
      points = pointMap[selectedMatchType] || 0
      if (isPodium) points += 200

    } else if (currentTab === 1) { // Activity
      if (!selectedActivityType) {
        wx.showToast({ title: '请选择活动类型', icon: 'none' })
        return
      }
      categoryId = 'activity'
      categoryName = '参加活动'
      formData = {
        date,
        activityType: selectedActivityType,
        description,
        images: fileIds
      }
      
      const pointMap = {
        '分享会等大型俱乐部集体活动': 150,
        '团练活动': 20
      }
      points = pointMap[selectedActivityType] || 0

    } else if (currentTab === 2) { // Training
      if (!selectedHours) {
        wx.showToast({ title: '请选择训练时长', icon: 'none' })
        return
      }
      if (!fileIds || fileIds.length === 0) {
         wx.showToast({ title: '请上传打卡图片', icon: 'none' })
         return
      }

      categoryId = 'training'
      categoryName = '周训练打卡'
      formData = {
        date,
        selectedHours,
        description,
        images: fileIds
      }
      
      // Points: 2 points per hour
      points = selectedHours * 2

    } else if (currentTab === 3) { // Construction
      if (!selectedConstructionType) {
        wx.showToast({ title: '请选择建设类型', icon: 'none' })
        return
      }
      categoryId = 'construction'
      categoryName = '俱乐部建设'
      formData = {
        date,
        constructionType: selectedConstructionType,
        description,
        images: fileIds
      }
      
      const pointMap = {
        '公众号投稿': 200,
        '拓展新会员': 200
      }
      points = pointMap[selectedConstructionType] || 0
    }

    wx.showLoading({ title: '提交中...' })

    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const res = await wx.cloud.callFunction({
        name: 'submitPoints',
        config: {
          env: cloudEnv
        },
        data: {
          categoryId,
          categoryName,
          points,
          formData,
          imageFileIDs: fileIds
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        wx.showToast({
          title: '提交成功',
          icon: 'success',
          duration: 2000
        })
        
        // Reset form after delay
        setTimeout(() => {
          this.setData({
            description: '',
            imageUrls: [],
            fileIds: [],
            selectedMatchType: '',
            isPodium: false,
            selectedActivityType: '',
            selectedHours: null,
            selectedConstructionType: ''
          })
        }, 2000)
      } else {
        throw new Error(res.result.message || '提交失败')
      }
    } catch (err) {
      console.error('Submit failed', err)
      wx.hideLoading()
      wx.showToast({
        title: '提交失败，请重试',
        icon: 'none'
      })
    }
  }
})
