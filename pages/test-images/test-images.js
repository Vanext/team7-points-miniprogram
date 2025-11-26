// 图片测试页面 - 用于诊断跨设备图片显示问题
const app = getApp()

Page({
  data: {
    testResults: [],
    uploadedImages: [],
    debugInfo: [],
    loading: false,
    cloudEnvId: '636c-cloudbase-0gvjuqae479205e8-1377814389',
    imageFolder: 't7_images',
    partnerKeys: ['descente','qrtri','quintanaroo','kse'],
    partnerMap: { descente: {}, qrtri: {}, quintanaroo: {}, kse: {} },
    canvasWidth: 400,
    canvasHeight: 200,
    ocrText: ''
  },

  onLoad() {
    this.addDebugInfo('页面加载完成', 'info')
    this.testCloudStorageAccess()
  },

  // 添加调试信息
  addDebugInfo(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString()
    this.data.debugInfo.unshift({
      timestamp,
      message,
      type
    })
    this.setData({
      debugInfo: this.data.debugInfo.slice(0, 50) // 只保留最近50条
    })
    console.log(`[${type.toUpperCase()}] ${timestamp}: ${message}`)
  },

  // 测试云存储访问
  async testCloudStorageAccess() {
    this.addDebugInfo('开始测试云存储访问...', 'info')
    
    try {
      // 测试云存储初始化
      const cloudInfo = await wx.cloud.init()
      this.addDebugInfo(`云开发初始化成功: ${JSON.stringify(cloudInfo)}`, 'success')
      this.addDebugInfo('云能力可用', 'info')
      
    } catch (error) {
      this.addDebugInfo(`云存储访问失败: ${error.message}`, 'error')
    }
  },

  // 选择并上传测试图片
  async chooseAndUploadImage() {
    this.addDebugInfo('开始选择图片...', 'info')
    
    try {
      const res = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })
      
      const tempFilePath = res.tempFilePaths[0]
      this.addDebugInfo(`图片选择成功: ${tempFilePath}`, 'success')
      
      await this.uploadImageToCloud(tempFilePath)
      
    } catch (error) {
      this.addDebugInfo(`选择图片失败: ${error.message}`, 'error')
    }
  },

  // 上传图片到云存储
  async uploadImageToCloud(tempFilePath) {
    this.setData({ loading: true })
    this.addDebugInfo('开始上传图片到云存储...', 'info')
    
    try {
      const timestamp = Date.now()
      const fileExtension = tempFilePath.split('.').pop()
      const cloudPath = `${this.data.imageFolder}/test_${timestamp}.${fileExtension}`
      
      this.addDebugInfo(`上传路径: ${cloudPath}`, 'info')
      
      const uploadResult = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: tempFilePath
      })
      
      this.addDebugInfo(`上传成功，fileID: ${uploadResult.fileID}`, 'success')
      
      // 测试图片URL转换
      await this.testImageUrlConversion(uploadResult.fileID, tempFilePath)

      // 自动触发一次 MVP OCR 识别
      await this.callOcrMvp(uploadResult.fileID)
      
    } catch (error) {
      this.addDebugInfo(`上传失败: ${error.message}`, 'error')
    } finally {
      this.setData({ loading: false })
    }
  },

  // 测试图片URL转换
  async testImageUrlConversion(fileID, originalPath) {
    this.addDebugInfo('开始测试图片URL转换...', 'info')
    
    const testResult = {
      id: Date.now(),
      originalPath,
      fileID,
      tempURL: '',
      status: 'testing',
      error: null,
      timestamp: new Date().toLocaleString()
    }
    
    try {
      // 方法1: 直接使用getTempFileURL
      const tempResult = await wx.cloud.getTempFileURL({
        fileList: [fileID]
      })
      
      if (tempResult.fileList && tempResult.fileList.length > 0) {
        const fileInfo = tempResult.fileList[0]
        testResult.tempURL = fileInfo.tempFileURL
        testResult.status = fileInfo.status === 0 ? 'success' : 'failed'
        testResult.error = fileInfo.errMsg
        
        this.addDebugInfo(`URL转换${testResult.status}: ${testResult.tempURL}`, testResult.status === 'success' ? 'success' : 'error')
      } else {
        testResult.status = 'failed'
        testResult.error = '未返回临时URL'
        this.addDebugInfo('URL转换失败: 未返回临时URL', 'error')
      }
      
    } catch (error) {
      testResult.status = 'failed'
      testResult.error = error.message
      this.addDebugInfo(`URL转换异常: ${error.message}`, 'error')
    }
    
    // 添加到测试结果
    this.data.uploadedImages.unshift(testResult)
    this.setData({
      uploadedImages: this.data.uploadedImages
    })
    
    // 测试图片加载
    if (testResult.status === 'success') {
      this.testImageLoad(testResult.tempURL, testResult.id)
    }
  },

  // 测试图片加载
  testImageLoad(imageUrl, testId) {
    this.addDebugInfo(`测试图片加载: ${imageUrl}`, 'info')
    wx.getImageInfo({
      src: imageUrl,
      success: () => {
        this.addDebugInfo(`图片加载成功: ${imageUrl}`, 'success')
        this.updateTestResult(testId, { loadStatus: 'success' })
      },
      fail: (error) => {
        const msg = (error && error.errMsg) || '未知错误'
        this.addDebugInfo(`图片加载失败: ${msg}`, 'error')
        this.updateTestResult(testId, { loadStatus: 'failed', loadError: msg })
      }
    })
  },

  // 更新测试结果
  updateTestResult(testId, updates) {
    const index = this.data.uploadedImages.findIndex(item => item.id === testId)
    if (index !== -1) {
      this.data.uploadedImages[index] = {
        ...this.data.uploadedImages[index],
        ...updates
      }
      this.setData({
        uploadedImages: this.data.uploadedImages
      })
    }
  },

  // 重新测试URL转换
  async retestUrlConversion(e) {
    const testId = e.currentTarget.dataset.id
    const testItem = this.data.uploadedImages.find(item => item.id === testId)
    
    if (!testItem) return
    
    this.addDebugInfo(`重新测试URL转换: ${testItem.fileID}`, 'info')
    await this.testImageUrlConversion(testItem.fileID, testItem.originalPath)
  },

  // 清除测试结果
  clearResults() {
    this.setData({
      uploadedImages: [],
      debugInfo: []
    })
    this.addDebugInfo('测试结果已清除', 'info')
  },

  choosePartner(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album'] }).then(res => {
      const temp = res.tempFilePaths[0]
      wx.getImageInfo({ src: temp }).then(info => {
        const w = Math.max(1, info.width)
        const h = Math.max(1, info.height)
        this.setData({ canvasWidth: w, canvasHeight: h })
        this.makeTransparentAndUpload(key, temp, w, h)
      }).catch(() => { this.uploadPartnerRaw(key, temp) })
    }).catch(err => { this.addDebugInfo(`选择失败: ${err.errMsg}`, 'error') })
  },

  makeTransparentAndUpload(key, temp, w, h) {
    const ctx = wx.createCanvasContext('partnerCanvas', this)
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(temp, 0, 0, w, h)
    ctx.draw(false, () => {
      wx.canvasGetImageData({ canvasId: 'partnerCanvas', x: 0, y: 0, width: w, height: h, success: (res) => {
        const data = res.data
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2]
          if (r > 240 && g > 240 && b > 240) { data[i + 3] = 0 }
        }
        wx.canvasPutImageData({ canvasId: 'partnerCanvas', x: 0, y: 0, width: w, height: h, data, success: () => {
          wx.canvasToTempFilePath({ canvasId: 'partnerCanvas', fileType: 'png', destWidth: w, destHeight: h, quality: 1, success: (r2) => {
            this.uploadPartnerRaw(key, r2.tempFilePath)
          }, fail: () => { this.uploadPartnerRaw(key, temp) } })
        }, fail: () => { this.uploadPartnerRaw(key, temp) } })
      }, fail: () => { this.uploadPartnerRaw(key, temp) } })
    })
  },

  uploadPartnerRaw(key, temp) {
    const cloudPath = `partners/${key}.png`
    wx.cloud.uploadFile({ cloudPath, filePath: temp }).then(up => {
      wx.cloud.getTempFileURL({ fileList: [up.fileID] }).then(r => {
        const url = (r.fileList && r.fileList[0] && r.fileList[0].tempFileURL) || ''
        const map = Object.assign({}, this.data.partnerMap)
        map[key] = { fileID: up.fileID, tempURL: url }
        this.setData({ partnerMap: map })
        try {
          const store = wx.getStorageSync('partners_fileids') || {}
          store[key] = up.fileID
          wx.setStorageSync('partners_fileids', store)
        } catch (_) {}
        this.addDebugInfo(`上传成功 ${key}: ${up.fileID}`, 'success')
      }).catch(err => {
        const map = Object.assign({}, this.data.partnerMap)
        map[key] = { fileID: up.fileID, tempURL: '' }
        this.setData({ partnerMap: map })
        this.addDebugInfo(`获取URL失败 ${key}: ${err.errMsg}`, 'error')
      })
    }).catch(err => { this.addDebugInfo(`上传失败 ${key}: ${err.errMsg}`, 'error') })
  },

  // 测试现有云存储图片
  async testExistingImage() {
    wx.showModal({
      title: '测试现有图片',
      content: '请输入要测试的云存储fileID',
      editable: true,
      placeholderText: 'cloud://xxx.xxx',
      success: async (res) => {
        if (res.confirm && res.content) {
          this.addDebugInfo(`测试现有图片: ${res.content}`, 'info')
          await this.testImageUrlConversion(res.content, '现有图片')
        }
      }
    })
  },

  // 图片加载错误处理
  onImageError(e) {
    const testId = e.currentTarget.dataset.id
    this.addDebugInfo(`图片显示失败 (ID: ${testId}): ${e.detail.errMsg}`, 'error')
    this.updateTestResult(testId, { displayStatus: 'failed', displayError: e.detail.errMsg })
  },

  // 图片加载成功处理
  onImageLoad(e) {
    const testId = e.currentTarget.dataset.id
    this.addDebugInfo(`图片显示成功 (ID: ${testId})`, 'success')
    this.updateTestResult(testId, { displayStatus: 'success' })
  },

  // 复制URL到剪贴板
  copyUrl(e) {
    const url = e.currentTarget.dataset.url
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({
          title: 'URL已复制',
          icon: 'success'
        })
      }
    })
  },
  // 调用 MVP OCR 云函数
  async callOcrMvp(fileID) {
    this.addDebugInfo('调用 OCR MVP 云函数...', 'info')
    try {
      const res = await wx.cloud.callFunction({ name: 'ocrMvp', data: { fileID } })
      const r = res && res.result
      if (r && r.success) {
        this.setData({ ocrText: r.text || '' })
        this.addDebugInfo(`OCR识别成功，长度：${(r.text || '').length}`, 'success')
      } else {
        const msg = (r && r.message) || 'OCR失败'
        this.addDebugInfo(`OCR识别失败：${msg}`, 'error')
      }
    } catch (e) {
      this.addDebugInfo(`OCR调用异常：${e.message}`, 'error')
    }
  },
  callOcrMvpLatest() {
    const latest = this.data.uploadedImages && this.data.uploadedImages[0]
    const fid = latest && latest.fileID
    if (!fid) {
      wx.showToast({ title: '请先上传图片', icon: 'none' })
      return
    }
    this.callOcrMvp(fid)
  }
})
