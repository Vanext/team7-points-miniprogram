// pages/admin/members/members.js
const app = getApp()

Page({
  data: {
    hasAccess: false,
    isAdmin: false,
    keyword: '',
    fullList: [], // 所有已加载的数据
    members: [], // 废弃，保留兼容
    list: [], // 当前渲染的数据
    loading: false,
    hasMore: true,
    noMore: false,
    page: 1,
    pageSize: 50,
    skip: 0,
    limit: 50,
    selectedMember: null,
    newPoints: '',
    newPointsMap: {}, // 存储每个用户的积分输入
    deltaMap: {}, // 废弃，保留兼容
    sortBy: 'points', // 'points' | 'name'
    chunkSize: 20,
    sortDebounceMs: 150,
    searchDebounceMs: 250,
    totalCount: 0,
    officialCount: 0,
    memberModalVisible: false,
    memberModalUser: {},
    memberModalExpiryDate: ''
  },

  _toTs(v) {
    if (!v) return 0
    if (v instanceof Date) return v.getTime()
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const t = new Date(v).getTime()
      return Number.isFinite(t) ? t : 0
    }
    if (v && typeof v === 'object') {
      if (v.$date) {
        const t = new Date(v.$date).getTime()
        return Number.isFinite(t) ? t : 0
      }
      if (v.time) {
        const t = new Date(v.time).getTime()
        return Number.isFinite(t) ? t : 0
      }
    }
    return 0
  },

  _formatUntil(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    if (!Number.isFinite(d.getTime())) return ''
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  _normalizeUserForList(user) {
    const untilTs = this._toTs(user.officialMemberUntil)
    const isOfficialMember = user.isOfficialMember === true
    const isOfficialValid = isOfficialMember && (untilTs === 0 || untilTs > Date.now())
    const exchangeLocked = user.exchange_locked === true
    const isExchangeActivated = user.isExchangeActivated === true || (user.isExchangeActivated == null && isOfficialValid && !exchangeLocked)

    return {
      ...user,
      totalPoints: Number(user.totalPoints || 0),
      isAdmin: user.isAdmin === true,
      isOfficialMember: isOfficialValid,
      exchange_locked: exchangeLocked,
      officialMemberUntilText: isOfficialValid ? this._formatUntil(untilTs) : '',
      isExchangeActivated: Boolean(isExchangeActivated)
    }
  },

  onShow() {
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo') || null
    if (!userInfo || userInfo.isAdmin !== true) {
      this.setData({ 
        isAdmin: false,
        hasAccess: false 
      })
      return
    }
    this.setData({ 
      isAdmin: true,
      hasAccess: true 
    })
    // 如果列表为空，初始化加载
    if (this.data.list.length === 0) this.fetch(true)
    this.updateCounts()
  },

  noop() {},

  onOpenMemberModal(e) {
    const id = e.currentTarget.dataset.id
    const user = this.data.fullList.find(it => it && it._id === id) || this.data.list.find(it => it && it._id === id) || null
    if (!user) return
    const expiryDate = user.isOfficialMember ? this._formatUntil(this._toTs(user.officialMemberUntil)) : ''
    this.setData({
      memberModalVisible: true,
      memberModalUser: user,
      memberModalExpiryDate: expiryDate
    })
  },

  onCloseMemberModal() {
    this.setData({
      memberModalVisible: false,
      memberModalUser: {},
      memberModalExpiryDate: ''
    })
  },

  onMemberExpiryChange(e) {
    const v = (e && e.detail && e.detail.value) || ''
    this.setData({ memberModalExpiryDate: v })
  },

  async onSaveMemberExpiry() {
    const user = this.data.memberModalUser
    const expiryDate = this.data.memberModalExpiryDate
    if (!user || !user._id || !expiryDate) return
    try {
      wx.showLoading({ title: '保存中...' })
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const r = await wx.cloud.callFunction({
        name: 'adminManageMembers',
        config: { env: cloudEnv },
        data: {
          action: 'setMembership',
          data: { id: user._id, isOfficialMember: true, officialMemberUntil: expiryDate }
        }
      })

      if (!r.result || !r.result.success) throw new Error(r.result?.message || '保存失败')

      const d = (r.result && r.result.data) || {}
      const nextUntil = d.officialMemberUntil
      const nextLocked = typeof d.exchange_locked === 'boolean' ? d.exchange_locked : (user.exchange_locked !== false)
      const nextOfficial = d.isOfficialMember === true

      this.updateLocalList(user._id, {
        isOfficialMember: nextOfficial,
        officialMemberUntil: nextUntil,
        officialMemberUntilText: nextOfficial ? this._formatUntil(this._toTs(nextUntil)) : '',
        exchange_locked: nextLocked,
        isExchangeActivated: nextOfficial && !nextLocked
      })

      wx.showToast({ title: '保存成功', icon: 'success' })
      this.onCloseMemberModal()
      this.updateCounts()
    } catch (e) {
      console.error('保存到期日期失败', e)
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
    const run = () => this.fetch(true)
    this._debounce('search', run, this.data.searchDebounceMs)
  },

  onSearch() {
    this.fetch(true)
  },

  // 核心拉取函数：支持分页和排序
  async fetch(reset = false) {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const skip = reset ? 0 : this.data.skip
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      
      // 根据 sortBy 决定排序参数
      let sortField = 'totalPoints'
      let sortOrder = 'desc'
      if (this.data.sortBy === 'name') {
        sortField = 'nickName'
        sortOrder = 'asc'
      }
      
      const res = await wx.cloud.callFunction({
        name: 'adminManageMembers',
        config: { env: cloudEnv },
        data: { 
          action: 'list', 
          query: { 
            keyword: this.data.keyword, 
            skip, 
            limit: this.data.limit,
            sortField,
            sortOrder
          } 
        }
      })
      
      if (!res.result || res.result.success !== true) {
        throw new Error(res.result?.message || '获取数据失败')
      }
      
      const arr = res.result.data || []

      const processedArr = arr.map(user => this._normalizeUserForList(user))
      
      // 如果是重置，直接替换 fullList；如果是加载更多，追加到 fullList
      // 注意：由于使用服务端排序，每次fetch都是有序的下一页
      const merged = reset ? processedArr : this.data.fullList.concat(processedArr)
      
      const newSkip = (reset ? 0 : this.data.skip) + arr.length
      const noMore = arr.length < this.data.limit
      
      this.setData({
        fullList: merged,
        skip: newSkip,
        noMore: noMore,
        hasMore: !noMore
      })
      
      // 渲染列表
      this.renderListChunked(merged, !reset)
      
    } catch (e) {
      console.error('加载失败', e)
      wx.showToast({
        title: e.message || '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async updateCounts() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const db = wx.cloud.database({ env: cloudEnv })
      const _ = db.command
      const now = new Date()
      const allRes = await db.collection('users').count()
      const officialRes = await db.collection('users').where(_.or([
        { isOfficialMember: true, officialMemberUntil: _.gt(now) },
        { isOfficialMember: true, officialMemberUntil: null },
        { isOfficialMember: true, officialMemberUntil: _.exists(false) }
      ])).count()
      this.setData({ totalCount: (allRes && allRes.total) || 0, officialCount: (officialRes && officialRes.total) || 0 })
    } catch (e) {}
  },

  onSortByPoints() {
    const run = () => {
      if (this.data.sortBy !== 'points') {
        this.setData({ sortBy: 'points' })
        this.fetch(true)
      }
    }
    this._debounce('sort', run, this.data.sortDebounceMs)
  },

  onSortByName() {
    const run = () => {
      if (this.data.sortBy !== 'name') {
        this.setData({ sortBy: 'name' })
        this.fetch(true)
      }
    }
    this._debounce('sort', run, this.data.sortDebounceMs)
  },

  // 分片渲染，避免一次性setData数据量过大
  renderListChunked(arr, isAppend = false) {
    // 取消上一次分片渲染
    if (this._renderToken == null) this._renderToken = 0
    this._renderToken += 1
    const token = this._renderToken
    
    const chunk = Math.max(20, this.data.chunkSize || 20)
    const total = arr.length
    
    // 如果数据量较小，直接渲染，不走分片
    if (total <= chunk * 2) {
      this.setData({ list: arr })
      return
    }

    let i = 0
    if (isAppend) {
      // 如果是追加数据，从当前长度开始，避免列表回弹
      i = this.data.list.length
    } else {
      // 如果是刷新，从头开始，先渲染一屏
      i = Math.min(chunk, total)
      const first = arr.slice(0, i)
      this.setData({ list: first })
    }
    
    // 递归分片渲染剩余数据
    const step = () => {
      if (token !== this._renderToken) return // 如果有新的渲染任务，停止当前任务
      if (i >= total) return
      
      i = Math.min(i + chunk, total)
      const part = arr.slice(0, i)
      this.setData({ list: part })
      
      if (i < total) {
        setTimeout(step, 32) // 稍微增加延时，给UI线程喘息
      }
    }
    
    if (i < total) {
      setTimeout(step, 32)
    }
  },

  _debounce(key, fn, wait) {
    if (!this._timers) this._timers = {}
    if (this._timers[key]) clearTimeout(this._timers[key])
    this._timers[key] = setTimeout(() => {
      this._timers[key] = null
      try { fn() } catch (e) { console.error('debounce error', e) }
    }, Math.max(0, wait || 150))
  },

  // 触底加载更多
  onLoadMore() {
    if (!this.data.noMore && !this.data.loading) {
      this.fetch(false)
    }
  },

  onNewPointsInput(e) {
    const id = e.currentTarget.dataset.id
    const value = e.detail.value
    // 验证输入值，只允许数字和负号
    const validValue = value.replace(/[^-0-9]/g, '')
    // 确保负号只能在开头
    const sanitizedValue = validValue.replace(/(?!^)-/g, '')
    this.setData({ [`newPointsMap.${id}`]: sanitizedValue })
  },

  // 清除排行榜缓存
  clearLeaderboardCache() {
    try {
      wx.removeStorageSync('leaderboard_cache');
      wx.removeStorageSync('leaderboard_cache_time');
    } catch (e) {}
  },

  // 设置积分
  async onSetPoints(e) {
    const { id } = e.currentTarget.dataset;
    const newPoints = parseInt(this.data.newPointsMap[id]);
    
    if (isNaN(newPoints) || newPoints < -8000) {
      wx.showToast({
        title: '请输入有效积分',
        icon: 'none'
      });
      return;
    }

    const currentMember = this.data.fullList.find(member => member._id === id);
    const currentPoints = currentMember ? (currentMember.totalPoints || 0) : 0;

    wx.showModal({
      title: '确认设置积分',
      content: `将用户积分从 ${currentPoints} 设置为 ${newPoints}？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '设置中...' });
            
            const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
            const result = await wx.cloud.callFunction({
              name: 'adminManageMembers',
              config: { env: cloudEnv },
              data: {
                action: 'setPoints',
                data: {
                  id: id,
                  points: newPoints
                }
              }
            });

            if (result.result && result.result.success) {
              wx.showToast({ title: '设置成功', icon: 'success' });
              this.setData({ [`newPointsMap.${id}`]: '' });
              this.clearLeaderboardCache();
              this.fetch(true); // 积分改变影响排序，必须刷新
            } else {
              throw new Error(result.result?.message || '设置失败');
            }
          } catch (error) {
            console.error('设置积分失败:', error);
            wx.showToast({ title: error.message || '设置失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 切换管理员状态
  async toggleAdminStatus(e) {
    const userId = e.currentTarget.dataset.userId
    const isAdminRaw = e.currentTarget.dataset.isAdmin
    const nickName = e.currentTarget.dataset.nickName
    const isAdmin = isAdminRaw === true || String(isAdminRaw) === 'true'
    
    const action = isAdmin ? '取消管理员' : '设为管理员'
    
    wx.showModal({
      title: action,
      content: `确认将 ${nickName} ${action}吗？`,
      success: async (res) => {
        if (!res.confirm) return
        
        try {
          app.showLoading('处理中...')
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { 
              action: 'setAdmin', 
              data: { id: userId, isAdmin: !isAdmin } 
            }
          })
          
          app.showToast('操作成功')
          
          // 本地更新状态，避免全量刷新
          this.updateLocalList(userId, { isAdmin: !isAdmin })
          
        } catch (error) {
          app.showToast(error.message || '操作失败', 'error')
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 切换兑换锁定状态
  async toggleExchangeLock(e) {
    const { userId, isLocked, nickName } = e.currentTarget.dataset
    const locked = isLocked === true || String(isLocked) === 'true'
    const actionText = locked ? '解锁' : '锁定'
    
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: `确认${actionText}？`,
        content: `确定要${actionText}用户 "${nickName}" 的兑换权限吗？`,
        confirmText: '确定',
        cancelText: '取消',
        success: (res) => resolve(res && res.confirm === true),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) return

    try {
      this.setData({ loading: true })
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'adminManageMembers',
        config: { env: cloudEnv },
        data: {
          action: 'setExchangeLock',
          data: { id: userId, lock: !locked }
        }
      })
      
      if (!res.result || !res.result.success) throw new Error(res.result?.message || '操作失败')
      
      app.showToast('操作成功')
      const current = this.data.fullList.find(it => it._id === userId) || {}
      const untilTs = this._toTs(current.officialMemberUntil)
      const isOfficialValid = current.isOfficialMember === true && (untilTs === 0 || untilTs > Date.now())
      const nextLocked = !locked
      this.updateLocalList(userId, { exchange_locked: nextLocked, isExchangeActivated: isOfficialValid && !nextLocked })
    } catch (err) {
      console.error('Toggle lock failed', err)
      app.showToast('操作失败', 'error')
    } finally {
      this.setData({ loading: false })
    }
  },

  // 切换正式会员
  async toggleOfficialMember(e) {
    const userId = e.currentTarget.dataset.userId
    const isOfficialRaw = e.currentTarget.dataset.isOfficial
    const nickName = e.currentTarget.dataset.nickName
    const isOfficial = isOfficialRaw === true || String(isOfficialRaw) === 'true'

    const action = isOfficial ? '取消正式会员' : '设为正式会员'
    
    wx.showModal({
      title: action,
      content: `确认更改 ${nickName} 的会员状态吗？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          app.showLoading('处理中...')
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const r = await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { 
              action: 'setMembership', 
              data: { id: userId, isOfficialMember: !isOfficial } 
            }
          })

          if (!r.result || !r.result.success) throw new Error(r.result?.message || '操作失败')
          const d = (r.result && r.result.data) || {}
          const nextOfficial = !isOfficial
          const nextUntil = d.officialMemberUntil || (nextOfficial ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null)
          const nextLocked = typeof d.exchange_locked === 'boolean' ? d.exchange_locked : (nextOfficial ? true : false)
          
          app.showToast('操作成功')
          this.updateLocalList(userId, {
            isOfficialMember: nextOfficial,
            officialMemberUntil: nextUntil,
            officialMemberUntilText: nextOfficial ? this._formatUntil(this._toTs(nextUntil)) : '',
            exchange_locked: nextLocked,
            isExchangeActivated: nextOfficial && !nextLocked
          })
          this.updateCounts() // 更新统计
          
        } catch (error) {
          app.showToast(error.message || '操作失败', 'error')
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 辅助：本地更新列表数据
  updateLocalList(userId, updates) {
    const updateItem = (item) => {
      if (item._id === userId) {
        return { ...item, ...updates }
      }
      return item
    }

    const newFullList = this.data.fullList.map(updateItem)
    const newList = this.data.list.map(updateItem)

    this.setData({
      fullList: newFullList,
      list: newList
    })
  },

  onExportData() {
    wx.showToast({ title: '功能开发中', icon: 'none' })
  }
})
