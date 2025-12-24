// 消息中心页面
const app = getApp()

Page({
  data: {
    messages: [],
    loading: false,
    hasMore: true,
    skip: 0,
    limit: 20,
    activeTab: 'all', // all, audit_result, exchange_status, system
    unreadCount: {
      all: 0,
      audit_result: 0,
      exchange_status: 0,
      system: 0
    }
  },

  onLoad() {
    this.loadMessages()
    this.loadUnreadCount()
  },

  onShow() {
    // 页面显示时刷新未读数量
    this.loadUnreadCount()
  },

  onPullDownRefresh() {
    this.setData({
      messages: [],
      skip: 0,
      hasMore: true
    })
    this.loadMessages().then(() => {
      wx.stopPullDownRefresh()
      this.loadUnreadCount()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMessages()
    }
  },

  // 切换标签页
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({
      activeTab: tab,
      messages: [],
      skip: 0,
      hasMore: true
    })
    this.loadMessages()
  },

  // 加载消息列表
  async loadMessages() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const query = {
        skip: this.data.skip,
        limit: this.data.limit
      }

      if (this.data.activeTab !== 'all') {
        query.type = this.data.activeTab
      }

      const res = await wx.cloud.callFunction({
        name: 'messageManager',
        config: { env: cloudEnv },
        data: {
          action: 'aggregateList',
          query
        }
      })

      if (res.result.success) {
        const newMessages = res.result.data || []
        this.setData({
          messages: [...this.data.messages, ...newMessages],
          skip: this.data.skip + newMessages.length,
          hasMore: newMessages.length === this.data.limit,
          loading: false
        })
      } else {
        throw new Error(res.result.message || '加载失败')
      }
    } catch (error) {
      console.error('加载消息失败', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  // 加载未读消息数量
  async loadUnreadCount() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const r = await wx.cloud.callFunction({
        name: 'messageManager',
        config: { env: cloudEnv },
        data: { action: 'getUnreadSummary', query: {} }
      })
      const counts = (r && r.result && r.result.success && r.result.data && r.result.data.counts) ? r.result.data.counts : null
      if (counts) {
        this.setData({ unreadCount: counts })
      } else {
        this.setData({ unreadCount: { all: 0, audit_result: 0, exchange_status: 0, system: 0 } })
      }
    } catch (error) {
      console.error('加载未读数量失败', error)
    }
  },

  // 点击消息项
  onMessageTap(e) {
    const message = e.currentTarget.dataset.message
    
    // 标记为已读
    if (!message.isRead) {
      this.markAsRead(message)
    }

    // 根据消息类型跳转到相应页面
    if (message.type === 'audit_result' && message.relatedId) {
      wx.navigateTo({
        url: `/pages/point-detail/point-detail?id=${message.relatedId}`
      })
    } else if (message.type === 'exchange_status' && message.relatedId) {
      wx.navigateTo({
        url: `/pages/exchange-history/exchange-history`
      })
    }
  },

  // 标记消息为已读
  async markAsRead(message) {
    try {
      const messageId = message && message._id
      if (!messageId) return
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      await wx.cloud.callFunction({
        name: 'messageManager',
        config: { env: cloudEnv },
        data: {
          action: 'markRead',
          data: { id: messageId, source: message.source }
        }
      })

      // 更新本地数据
      const messages = this.data.messages.map(msg => {
        if (msg._id === messageId) {
          return { ...msg, isRead: true }
        }
        return msg
      })
      this.setData({ messages })
      
      // 刷新未读数量
      this.loadUnreadCount()
    } catch (error) {
      console.error('标记已读失败', error)
    }
  },

  // 标记全部已读
  async markAllAsRead() {
    try {
      const data = {}
      if (this.data.activeTab !== 'all') {
        data.type = this.data.activeTab
      }

      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      await wx.cloud.callFunction({
        name: 'messageManager',
        config: { env: cloudEnv },
        data: {
          action: 'markAllRead',
          data
        }
      })

      // 更新本地数据
      const messages = this.data.messages.map(msg => ({
        ...msg,
        isRead: true
      }))
      this.setData({ messages })
      
      // 刷新未读数量
      this.loadUnreadCount()

      wx.showToast({
        title: '已全部标记为已读',
        icon: 'success'
      })
    } catch (error) {
      console.error('标记全部已读失败', error)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  // 删除消息
  async deleteMessage(e) {
    const message = e.currentTarget.dataset.message
    const messageId = message && message._id
    if (!messageId) return
    
    try {
      const res = await wx.showModal({
        title: '确认删除',
        content: '确定要删除这条消息吗？'
      })

      if (!res.confirm) return

      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      await wx.cloud.callFunction({
        name: 'messageManager',
        config: { env: cloudEnv },
        data: {
          action: 'delete',
          data: { id: messageId, source: message.source }
        }
      })

      // 从本地数据中移除
      const messages = this.data.messages.filter(msg => msg._id !== messageId)
      this.setData({ messages })
      
      // 刷新未读数量
      this.loadUnreadCount()

      wx.showToast({
        title: '删除成功',
        icon: 'success'
      })
    } catch (error) {
      console.error('删除消息失败', error)
      wx.showToast({
        title: '删除失败',
        icon: 'none'
      })
    }
  },

  // 格式化时间
  formatTime(timestamp) {
    if (!timestamp) return ''
    let date = null
    if (timestamp instanceof Date) {
      date = timestamp
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp)
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp)
    } else if (timestamp && timestamp.$date) {
      date = new Date(timestamp.$date)
    } else if (timestamp && timestamp.time) {
      date = new Date(timestamp.time)
    } else {
      try {
        date = new Date(timestamp)
      } catch (e) {
        return ''
      }
    }
    if (!date || isNaN(date.getTime())) return ''
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) { // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) { // 1小时内
      return `${Math.floor(diff / 60000)}分钟前`
    } else if (diff < 86400000) { // 1天内
      return `${Math.floor(diff / 3600000)}小时前`
    } else if (diff < 604800000) { // 1周内
      return `${Math.floor(diff / 86400000)}天前`
    } else {
      return date.toLocaleDateString()
    }
  }
})
