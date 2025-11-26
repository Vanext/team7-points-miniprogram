const app = getApp()

Page({
  data: {
    currentTab: 2, // Default to Training as per screenshot
    date: '',
    description: '',
    imageUrl: '',
    fileId: '',
    showRulesModal: false,
    
    // Match Data
    matchTypes: ['大铁', '70.3', '标铁', '半程马拉松', '远距赛事'],
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
      imageUrl: '',
      fileId: '',
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

  // Image Upload
  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({ imageUrl: tempFilePath })
        
        wx.showLoading({ title: '上传图片中...' })
        
        try {
          const cloudPath = `uploads/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempFilePath
          })
          
          this.setData({ fileId: uploadRes.fileID })
          wx.hideLoading()
        } catch (err) {
          console.error('Upload failed', err)
          wx.hideLoading()
          wx.showToast({
            title: '图片上传失败',
            icon: 'none'
          })
        }
      }
    })
  },

  // Submit Form
  async submitForm() {
    const { currentTab, date, description, fileId, selectedMatchType, isPodium, selectedActivityType, selectedHours, selectedConstructionType } = this.data

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
        evidence: fileId
      }
      
      // Calculate points (Mock logic based on rules)
      const pointMap = {
        '大铁': 1200,
        '70.3': 600,
        '标铁': 300,
        '半程马拉松': 300,
        '远距赛事': 100
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
        evidence: fileId
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
      if (!fileId) {
         wx.showToast({ title: '请上传打卡图片', icon: 'none' })
         return
      }

      categoryId = 'training'
      categoryName = '周训练打卡'
      formData = {
        date,
        selectedHours,
        description,
        evidence: fileId
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
        evidence: fileId
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
          formData
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
            imageUrl: '',
            fileId: '',
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
