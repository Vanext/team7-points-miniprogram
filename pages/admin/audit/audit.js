const app = getApp()
const imageUtils = require('../../../utils/imageUtils.js')

Page({
  data: {
    records: [],
    loading: false,
    currentTab: 'pending', // pending, approved, rejected
    tabs: [
      { id: 'pending', name: '待审核' },
      { id: 'approved', name: '已通过' },
      { id: 'rejected', name: '已拒绝' }
    ],
    isAdmin: false,
    page: 1,
    pageSize: 10,
    hasMore: true
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '积分审核' })
    // 检查是否为管理员
    this.checkAdminStatus()
  },

  onShow() {
    if (this.data.isAdmin) {
      this.loadRecords(true)
    }
  },

  // 检查管理员状态
  async checkAdminStatus() {
    const userInfo = app.globalData.userInfo
    
    if (!userInfo) {
      this.redirectToLogin()
      return
    }

    // 检查用户是否为管理员
    if (userInfo.isAdmin) {
      this.setData({ isAdmin: true })
      this.loadRecords(true)
    } else {
      this.redirectToLogin()
    }
  },

  // 重定向到登录页
  redirectToLogin() {
    wx.showModal({
      title: '权限不足',
      content: '只有管理员才能访问此页面',
      showCancel: false,
      success: () => {
        wx.switchTab({
          url: '/pages/profile/profile'
        })
      }
    })
  },

  // 切换标签
  onTabChange(e) {
    const tabId = e.currentTarget.dataset.id
    this.setData({
      currentTab: tabId,
      page: 1,
      hasMore: true
    })
    this.loadRecords(true)
  },

  // 加载积分记录
  async loadRecords(refresh = false) {
    if (this.data.loading) return

    if (refresh) {
      this.setData({
        records: [],
        page: 1,
        hasMore: true
      })
    }

    if (!this.data.hasMore) return

    this.setData({ loading: true })

    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'getPointRecords',
        config: { env: cloudEnv },
        data: {
          status: this.data.currentTab,
          page: this.data.page,
          pageSize: this.data.pageSize,
          isAdmin: true,
          onlySubmission: true
        }
      })

      if (res.result && res.result.records) {
        let records = res.result.records
        
        // 批量将云 fileID 转为临时URL，增强审核页图片显示稳定性
        try {
          const idMap = {}
          const fileIds = []
          records.forEach(r => {
            const srcs = []
            if (Array.isArray(r.images)) srcs.push(...r.images)
            if (Array.isArray(r.imageFileIDs)) srcs.push(...r.imageFileIDs)
            if (typeof r.imageFileIDs === 'string') srcs.push(r.imageFileIDs)
            if (r.formData) {
              if (Array.isArray(r.formData.imageFileIDs)) srcs.push(...r.formData.imageFileIDs)
              if (Array.isArray(r.formData.images)) srcs.push(...r.formData.images)
            }
            if (typeof r.imageUrl === 'string') srcs.push(r.imageUrl)
            srcs.forEach(id => { if (typeof id === 'string' && id.indexOf('cloud://') === 0) fileIds.push(id) })
          })
          if (fileIds.length > 0) {
            const chunkSize = 20
            for (let i = 0; i < fileIds.length; i += chunkSize) {
              const sub = fileIds.slice(i, i + chunkSize)
              const r = await wx.cloud.getTempFileURL({ fileList: sub })
              ;(r && r.fileList || []).forEach(it => { if (it.fileID && it.tempFileURL) idMap[it.fileID] = it.tempFileURL })
            }
          }
          const toAltUrl = (fid) => {
            try {
              const m = String(fid).match(/^cloud:\/\/([^\.]+)\.[^\/]+\/(.+)$/)
              if (!m) return ''
              const envId = m[1]
              const filePath = m[2]
              return `https://${envId}.tcb.qcloud.la/${filePath}`
            } catch (_) { return '' }
          }
          const compress = (url) => {
            if (!url) return url
            if (url.indexOf('?') >= 0) return url
            return `${url}?imageMogr2/thumbnail/600x/quality/75/format/webp`
          }

          records = records.map(r => {
            const srcs = []
            if (Array.isArray(r.images)) srcs.push(...r.images)
            if (Array.isArray(r.imageFileIDs)) srcs.push(...r.imageFileIDs)
            if (typeof r.imageFileIDs === 'string') srcs.push(r.imageFileIDs)
            if (r.formData) {
              if (Array.isArray(r.formData.imageFileIDs)) srcs.push(...r.formData.imageFileIDs)
              if (Array.isArray(r.formData.images)) srcs.push(...r.formData.images)
            }
            if (typeof r.imageUrl === 'string') srcs.push(r.imageUrl)
            let imgs = srcs.map(id => (idMap[id] || (String(id).startsWith('http') ? id : toAltUrl(id)))).filter(u => typeof u === 'string' && u.trim() !== '')
            const cmpImgs = imgs.map(compress)
            const thumb = cmpImgs && cmpImgs.length > 0 ? cmpImgs[0] : ''
            return { ...r, images: cmpImgs, thumb }
          })
        } catch (_) {}

        // 使用通用工具兜底转换
        records = await imageUtils.processPointRecordsImages(records)
        // 兜底设置缩略图字段（防止 images 在工具处理后为空）
        records = records.map(r => {
          const thumb = (Array.isArray(r.images) && r.images.length > 0) ? r.images[0] : (r.thumb || '')
          return { ...r, thumb }
        })

        // 对仍缺少 thumb 的记录，逐条调用云API获取临时URL
        try {
          for (let i = 0; i < records.length; i++) {
            if (!records[i].thumb) {
              const candidates = []
              const r = records[i]
              if (Array.isArray(r.imageFileIDs)) candidates.push(r.imageFileIDs[0])
              else if (typeof r.imageFileIDs === 'string') candidates.push(r.imageFileIDs)
              if (r.formData && Array.isArray(r.formData.imageFileIDs)) candidates.push(r.formData.imageFileIDs[0])
              if (typeof r.imageUrl === 'string') candidates.push(r.imageUrl)
              const fid = candidates.find(s => typeof s === 'string' && s.indexOf('cloud://') === 0)
              if (fid) {
                const r2 = await wx.cloud.getTempFileURL({ fileList: [fid] })
                const u = (r2 && r2.fileList && r2.fileList[0] && r2.fileList[0].tempFileURL) || ''
                if (u) {
                  const cu = u.indexOf('?') >= 0 ? u : `${u}?imageMogr2/thumbnail/600x/quality/75/format/webp`
                  records[i].thumb = cu
                  if (!Array.isArray(records[i].images) || records[i].images.length === 0) {
                    records[i].images = [u]
                  }
                }
              }
            }
          }
        } catch (_) {}
        
        // 格式化时间
        records.forEach(record => {
          record.submitTimeFormatted = app.formatTime(record.submitTime)
          if (record.auditTime) {
            record.auditTimeFormatted = app.formatTime(record.auditTime)
          }
        })

        const allRecords = refresh ? records : [...this.data.records, ...records]
        
        this.setData({
          records: allRecords,
          page: this.data.page + 1,
          hasMore: records.length === this.data.pageSize
        })
      }
    } catch (error) {
      console.error('获取记录失败', error)
      app.showToast('获取记录失败', 'error')
    } finally {
      this.setData({ loading: false })
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadRecords(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore) {
      this.loadRecords()
    }
  },

  

  // 图片预览
  previewImages(e) {
    const images = e.currentTarget.dataset.images || []
    if (!images || images.length === 0) {
      wx.showToast({ title: '暂无图片', icon: 'none' })
      return
    }
    wx.previewImage({ current: images[0], urls: images })
  },

  // 审核通过
  async approveRecord(e) {
    const recordId = e.currentTarget.dataset.id
    await this.updateRecordStatus(recordId, 'approved')
  },

  // 审核拒绝
  async rejectRecord(e) {
    const recordId = e.currentTarget.dataset.id
    wx.showModal({
      title: '拒绝原因',
      editable: true,
      placeholderText: '请输入拒绝原因',
      success: async (res) => {
        if (res.confirm) {
          const reason = res.content || '不符合积分规则'
          await this.updateRecordStatus(recordId, 'rejected', reason)
        }
      }
    })
  },

  // 取消通过
  async cancelApproval(e) {
    const recordId = e.currentTarget.dataset.id
    await this.updateRecordStatus(recordId, 'rejected')
  },
  
  // 重新通过已拒绝的记录
  async approveRejected(e) {
    const recordId = e.currentTarget.dataset.id
    await this.updateRecordStatus(recordId, 'approved')
  },

  // 更新记录状态
  async updateRecordStatus(recordId, status, reason = '') {
    app.showLoading('处理中...')
    
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'auditPointRecord',
        config: { env: cloudEnv },
        data: {
          recordId,
          status,
          reason
        }
      })

      if (res.result && res.result.success) {
        app.showToast('操作成功')
        // 刷新当前列表
        this.loadRecords(true)
      } else {
        app.showToast(res.result.message || '操作失败', 'error')
      }
    } catch (error) {
      console.error('审核操作失败', error)
      app.showToast('操作失败', 'error')
    } finally {
      app.hideLoading()
    }
  },
  // 查看详情（仅已拒绝）
  viewDetail(e) {
    const recordId = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/audit/detail/detail?id=${recordId}` })
  }
})
