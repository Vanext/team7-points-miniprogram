// 消息中心页面
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
      const query = {
        skip: this.data.skip,
        limit: this.data.limit
      }

      if (this.data.activeTab !== 'all') {
        query.type = this.data.activeTab
      }

      const res = await wx.cloud.callFunction({
        name: 'messageManager',
        data: {
          action: 'list',
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
      const types = ['all', 'audit_result', 'exchange_status', 'system']
      const promises = types.map(type => {
        const query = type === 'all' ? {} : { type }
        return wx.cloud.callFunction({
          name: 'messageManager',
          data: {
            action: 'getUnreadCount',
            query
          }
        })
      })

      const results = await Promise.all(promises)
      const unreadCount = {}
      
      types.forEach((type, index) => {
        const result = results[index]
        if (result.result.success) {
          unreadCount[type] = result.result.data.count
        } else {
          unreadCount[type] = 0
        }
      })

      this.setData({ unreadCount })
    } catch (error) {
      console.error('加载未读数量失败', error)
    }
  },

  // 点击消息项
  onMessageTap(e) {
    const message = e.currentTarget.dataset.message
    
    // 标记为已读
    if (!message.isRead) {
      this.markAsRead(message._id)
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
  async markAsRead(messageId) {
    try {
      await wx.cloud.callFunction({
        name: 'messageManager',
        data: {
          action: 'markRead',
          data: { id: messageId }
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

      await wx.cloud.callFunction({
        name: 'messageManager',
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
    const messageId = e.currentTarget.dataset.id
    
    try {
      const res = await wx.showModal({
        title: '确认删除',
        content: '确定要删除这条消息吗？'
      })

      if (!res.confirm) return

      await wx.cloud.callFunction({
        name: 'messageManager',
        data: {
          action: 'delete',
          data: { id: messageId }
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
    
    const date = new Date(timestamp)
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