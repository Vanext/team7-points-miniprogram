// 图片处理工具类 - 增强版，解决跨设备显示问题
const imageUtils = {
  // 临时URL缓存
  tempUrlCache: new Map(),
  
  // 缓存过期时间（6小时）
  CACHE_EXPIRE_TIME: 6 * 60 * 60 * 1000,
  
  // 最大重试次数
  MAX_RETRY_COUNT: 3,
  
  // 调试模式
  DEBUG: false,
  
  // 云存储配置状态
  cloudStorageStatus: {
    initialized: false,
    hasPermission: null,
    lastCheck: 0,
    checkInterval: 5 * 60 * 1000 // 5分钟检查一次
  },
  
  // 日志记录
  log(message, type = 'info') {
    if (this.DEBUG) {
      const timestamp = new Date().toLocaleTimeString()
      console.log(`[ImageUtils ${type.toUpperCase()}] ${timestamp}: ${message}`)
    }
  },

  // 检查云存储配置和权限
  async checkCloudStoragePermission() {
    const now = Date.now()
    
    // 如果最近检查过且在检查间隔内，直接返回缓存结果
    if (this.cloudStorageStatus.lastCheck && 
        (now - this.cloudStorageStatus.lastCheck) < this.cloudStorageStatus.checkInterval) {
      return this.cloudStorageStatus.hasPermission
    }
    
    try {
      this.log('检查云存储权限配置...')
      
      // 尝试获取一个简单的云存储信息来测试权限
      const testResult = await wx.cloud.getTempFileURL({
        fileList: ['cloud://test-permission-check']
      })
      
      // 更新状态
      this.cloudStorageStatus.initialized = true
      this.cloudStorageStatus.hasPermission = true
      this.cloudStorageStatus.lastCheck = now
      
      this.log('云存储权限检查通过', 'success')
      return true
      
    } catch (error) {
      this.cloudStorageStatus.initialized = true
      this.cloudStorageStatus.lastCheck = now
      
      if (this.isPermissionError(error)) {
        this.cloudStorageStatus.hasPermission = false
        this.log(`云存储权限不足: ${error.message}`, 'warn')
        this.log('建议检查小程序云开发配置和存储权限设置', 'warn')
        return false
      } else {
        // 其他错误可能是网络问题，不确定权限状态
        this.cloudStorageStatus.hasPermission = null
        this.log(`云存储权限检查失败: ${error.message}`, 'error')
        return null
      }
    }
  },

  // 获取云存储配置诊断信息
  getCloudStorageDiagnostics() {
    return {
      status: this.cloudStorageStatus,
      cacheStats: this.getCacheStats(),
      recommendations: this.getConfigRecommendations()
    }
  },

  // 获取配置建议
  getConfigRecommendations() {
    const recommendations = []
    
    if (this.cloudStorageStatus.hasPermission === false) {
      recommendations.push('检查云开发控制台中的存储权限配置')
      recommendations.push('确认小程序已正确初始化云开发环境')
      recommendations.push('验证云存储安全规则是否允许当前用户访问')
      recommendations.push('如果使用免费版云开发，考虑升级到付费版以获得完整权限')
      recommendations.push('当前已启用降级模式：权限受限的图片将不显示，避免重复错误')
    }
    
    if (this.cloudStorageStatus.hasPermission === null) {
      recommendations.push('检查网络连接状态')
      recommendations.push('确认云开发服务是否正常运行')
    }
    
    return recommendations
  },

  // 检查缓存是否有效
  isCacheValid(cacheItem) {
    if (!cacheItem) return false
    return Date.now() - cacheItem.timestamp < this.CACHE_EXPIRE_TIME
  },

  // 获取缓存的临时URL
  getCachedTempUrl(cloudUrl) {
    const cacheItem = this.tempUrlCache.get(cloudUrl)
    if (this.isCacheValid(cacheItem)) {
      this.log(`使用缓存的临时URL: ${cloudUrl}`)
      return cacheItem.tempUrl
    }
    return null
  },

  // 缓存临时URL
  cacheTempUrl(cloudUrl, tempUrl) {
    this.tempUrlCache.set(cloudUrl, {
      tempUrl,
      timestamp: Date.now()
    })
    this.log(`缓存临时URL: ${cloudUrl} -> ${tempUrl}`)
  },

  // 清理过期缓存
  cleanExpiredCache() {
    const now = Date.now()
    for (const [key, value] of this.tempUrlCache.entries()) {
      if (now - value.timestamp >= this.CACHE_EXPIRE_TIME) {
        this.tempUrlCache.delete(key)
        this.log(`清理过期缓存: ${key}`)
      }
    }
  },

  // 带重试机制的云存储URL转换
  // 检查是否为权限相关错误
  isPermissionError(error) {
    const permissionErrors = [
      'STORAGE_EXCEED_AUTHORITY',
      'PERMISSION_DENIED',
      'ACCESS_DENIED',
      'UNAUTHORIZED'
    ]
    return permissionErrors.some(errType => 
      error.message && error.message.includes(errType)
    )
  },

  // 尝试构建备用URL格式
  tryAlternativeUrlFormats(cloudUrl) {
    try {
      // 从cloud://格式提取文件路径信息
      const cloudMatch = cloudUrl.match(/^cloud:\/\/([^\/]+)\/(.+)$/)
      if (!cloudMatch) {
        return null
      }
      
      const [, envId, filePath] = cloudMatch
      
      // 尝试构建标准的腾讯云存储URL格式
      // 格式: https://{envId}.tcb.qcloud.la/{filePath}
      const alternativeUrl = `https://${envId}.tcb.qcloud.la/${filePath}`
      this.log(`尝试备用URL格式: ${alternativeUrl}`)
      
      return alternativeUrl
    } catch (error) {
      this.log(`构建备用URL失败: ${error.message}`, 'error')
      return null
    }
  },

  async convertCloudUrlWithRetry(cloudUrl, retryCount = 0) {
    try {
      this.log(`转换云存储URL (尝试 ${retryCount + 1}/${this.MAX_RETRY_COUNT}): ${cloudUrl}`)
      
      const result = await wx.cloud.getTempFileURL({
        fileList: [cloudUrl]
      })
      
      if (result.fileList && result.fileList.length > 0) {
        const fileInfo = result.fileList[0]
        
        if (fileInfo.status === 0 && fileInfo.tempFileURL) {
          this.log(`URL转换成功: ${fileInfo.tempFileURL}`, 'success')
          this.cacheTempUrl(cloudUrl, fileInfo.tempFileURL)
          return fileInfo.tempFileURL
        } else {
          this.log(`URL转换失败: ${fileInfo.errMsg || '未知错误'}`, 'error')
          throw new Error(fileInfo.errMsg || 'URL转换失败')
        }
      } else {
        throw new Error('未返回文件信息')
      }
    } catch (error) {
      this.log(`URL转换异常: ${error.message}`, 'error')
      
      // 检查是否为权限错误
      if (this.isPermissionError(error)) {
        this.log(`检测到权限错误，尝试备用URL格式`, 'warn')
        const alternativeUrl = this.tryAlternativeUrlFormats(cloudUrl)
        if (alternativeUrl) {
          this.log(`使用备用URL: ${alternativeUrl}`)
          // 缓存备用URL，避免重复尝试
          this.cacheTempUrl(cloudUrl, alternativeUrl)
          return alternativeUrl
        }
        
        // 如果备用URL也失败，直接抛出权限错误，不再重试
        this.log(`权限错误且无可用备用URL，停止重试`, 'error')
        throw new Error(`云存储权限不足: ${error.message}`)
      }
      
      // 对于非权限错误，继续重试机制
      if (retryCount < this.MAX_RETRY_COUNT - 1) {
        this.log(`准备重试，等待 ${(retryCount + 1) * 1000}ms`)
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000))
        return await this.convertCloudUrlWithRetry(cloudUrl, retryCount + 1)
      }
      
      throw error
    }
  },

  // 处理单个图片URL - 增强版
  async processImageUrl(imageUrl, defaultImage = '/images/default-avatar.png') {
    // 清理过期缓存
    this.cleanExpiredCache()
    
    if (!imageUrl || imageUrl.trim() === '') {
      this.log(`图片URL为空，使用默认图片: ${defaultImage}`)
      return defaultImage
    }

    this.log(`开始处理图片URL: ${imageUrl}`)

    // 如果已经是HTTP/HTTPS URL，直接返回
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      this.log(`使用HTTP URL: ${imageUrl}`)
      return imageUrl
    }

    // 如果是云存储URL，转换为临时URL
    if (imageUrl.startsWith('cloud://')) {
      try {
        // 先检查缓存
        const cachedUrl = this.getCachedTempUrl(imageUrl)
        if (cachedUrl) {
          this.log(`使用缓存的云存储URL: ${imageUrl}`)
          return cachedUrl
        }
        
        // 转换URL
        this.log(`转换云存储URL: ${imageUrl}`)
        const tempUrl = await this.convertCloudUrlWithRetry(imageUrl)
        return tempUrl
        
      } catch (error) {
        this.log(`处理云存储URL失败: ${error.message}，使用默认图片`, 'error')
        return defaultImage
      }
    }

    // 处理微信临时文件 wxfile://
    if (imageUrl.startsWith('wxfile://')) {
      this.log(`检测到微信临时文件，尝试转换为云存储URL: ${imageUrl}`)
      // 微信临时文件通常需要上传到云存储后才能在其他地方访问
      // 这里我们先返回原URL，让小程序尝试显示
      // 如果需要转换，应该在上传时就处理
      return imageUrl
    }

    // 如果是相对路径，直接返回
    if (imageUrl.startsWith('/')) {
      this.log(`使用相对路径: ${imageUrl}`)
      return imageUrl
    }

    // 其他情况，尝试作为云存储URL处理
    if (imageUrl.includes('cloudbase') || imageUrl.includes('tcb.qcloud.la')) {
      try {
        // 尝试构建正确的cloud://格式
        let cloudUrl = imageUrl
        if (!cloudUrl.startsWith('cloud://')) {
          // 从URL中提取环境ID和文件路径
          const match = imageUrl.match(/https?:\/\/([^.]+)\.tcb\.qcloud\.la\/(.+)/)
          if (match) {
            const [, envId, filePath] = match
            cloudUrl = `cloud://${envId}/${filePath}`
            this.log(`构建云存储URL: ${cloudUrl}`)
          }
        }
        
        const cachedUrl = this.getCachedTempUrl(cloudUrl)
        if (cachedUrl) {
          this.log(`使用缓存的临时URL: ${cloudUrl}`)
          return cachedUrl
        }
        
        const tempUrl = await this.convertCloudUrlWithRetry(cloudUrl)
        return tempUrl
        
      } catch (error) {
        // 如果是权限错误且为免费版限制，提供更友好的处理
        if (this.isPermissionError(error)) {
          this.log(`云存储权限受限（可能为免费版限制），暂时隐藏图片`, 'warn')
          return ''
        }
        
        this.log(`处理云存储URL失败: ${error.message}，使用默认图片`, 'error')
        return defaultImage
      }
    }

    this.log(`未知URL格式: ${imageUrl}，使用默认图片`)
    return defaultImage
  },

  // 处理多个图片URL
  async processImageUrls(imageUrls, defaultImage = '/images/default-image.png') {
    if (!Array.isArray(imageUrls)) {
      this.log('图片URL列表不是数组，返回空数组')
      return []
    }

    this.log(`开始处理 ${imageUrls.length} 个图片URL`)
    const processedUrls = []
    
    for (let i = 0; i < imageUrls.length; i++) {
      try {
        const processedUrl = await this.processImageUrl(imageUrls[i], defaultImage)
        processedUrls.push(processedUrl)
        this.log(`处理图片 ${i + 1}/${imageUrls.length} 完成`)
      } catch (error) {
        this.log(`处理图片 ${i + 1}/${imageUrls.length} 失败: ${error.message}`, 'error')
        processedUrls.push(defaultImage)
      }
    }
    
    return processedUrls
  },

  // 处理头像URL
  async processAvatarUrl(avatarUrl) {
    this.log(`处理头像URL: ${avatarUrl}`)
    return await this.processImageUrl(avatarUrl, '/images/default-avatar.png')
  },

  // 处理用户数组中的头像
  async processUsersAvatars(users) {
    if (!Array.isArray(users)) {
      this.log('用户列表不是数组，直接返回')
      return users
    }

    this.log(`开始处理 ${users.length} 个用户头像`)
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i]
      if (user && user.avatarUrl) {
        try {
          user.avatarUrl = await this.processAvatarUrl(user.avatarUrl)
          this.log(`处理用户 ${i + 1} 头像完成`)
        } catch (error) {
          this.log(`处理用户 ${i + 1} 头像失败: ${error.message}`, 'error')
          user.avatarUrl = '/images/default-avatar.png'
        }
      }
    }
    
    return users
  },

  // 处理积分记录中的图片 - 支持免费版云存储限制
  async processPointRecordsImages(records) {
    if (!Array.isArray(records)) {
      this.log('积分记录不是数组，直接返回')
      return records
    }

    this.log(`开始处理 ${records.length} 条积分记录的图片`)
    
    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      
      try {
        // 处理用户头像
        if (record.userInfo && record.userInfo.avatarUrl) {
          const processedAvatar = await this.processAvatarUrl(record.userInfo.avatarUrl)
          // 如果返回空字符串（权限受限），使用默认头像
          record.userInfo.avatarUrl = processedAvatar || '/images/default-avatar.png'
        }
        
        // 处理打卡图片
        if (record.imageUrl) {
          const processedImage = await this.processImageUrl(record.imageUrl, '/images/default-image.png')
          // 如果返回空字符串（权限受限），清空该字段
          record.imageUrl = processedImage || ''
        }
        
        // 处理多张图片 - 支持多种字段名
        if (record.images && Array.isArray(record.images)) {
          this.log(`处理记录 ${i + 1} 的 images 字段，共 ${record.images.length} 张图片`)
          const processedImages = await this.processImageUrls(record.images, '/images/default-image.png')
          // 过滤掉空字符串（权限受限的图片）
          record.images = processedImages.filter(url => url && url.trim() !== '')
        }
        
        // 处理 imageFileIDs 字段（如果存在且 images 不存在）
        if (record.imageFileIDs && Array.isArray(record.imageFileIDs) && (!record.images || record.images.length === 0)) {
          this.log(`处理记录 ${i + 1} 的 imageFileIDs 字段，共 ${record.imageFileIDs.length} 张图片`)
          const processedImages = await this.processImageUrls(record.imageFileIDs, '/images/default-image.png')
          // 过滤掉空字符串（权限受限的图片）
          record.images = processedImages.filter(url => url && url.trim() !== '')
        }
        
        this.log(`处理记录 ${i + 1} 图片完成`)
      } catch (error) {
        this.log(`处理记录 ${i + 1} 图片失败: ${error.message}`, 'error')
      }
    }
    
    return records
  },

  // 预加载图片（用于提前转换URL）
  async preloadImages(imageUrls) {
    if (!Array.isArray(imageUrls)) return
    
    this.log(`预加载 ${imageUrls.length} 个图片`)
    
    const promises = imageUrls.map(async (url, index) => {
      try {
        await this.processImageUrl(url)
        this.log(`预加载图片 ${index + 1} 完成`)
      } catch (error) {
        this.log(`预加载图片 ${index + 1} 失败: ${error.message}`, 'error')
      }
    })
    
    await Promise.allSettled(promises)
    this.log('预加载完成')
  },

  // 清除所有缓存
  clearCache() {
    this.tempUrlCache.clear()
    this.log('已清除所有缓存')
  },

  // 获取缓存统计信息
  getCacheStats() {
    const stats = {
      totalCached: this.tempUrlCache.size,
      validCached: 0,
      expiredCached: 0
    }
    
    const now = Date.now()
    for (const [key, value] of this.tempUrlCache.entries()) {
      if (now - value.timestamp < this.CACHE_EXPIRE_TIME) {
        stats.validCached++
      } else {
        stats.expiredCached++
      }
    }
    
    return stats
  }
}

module.exports = imageUtils