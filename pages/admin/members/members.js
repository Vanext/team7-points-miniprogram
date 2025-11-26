// pages/admin/members/members.js
const app = getApp()

Page({
  data: {
    hasAccess: false,
    isAdmin: false,
    keyword: '',
    members: [],
    list: [],
    loading: false,
    hasMore: true,
    noMore: false,
    page: 1,
    pageSize: 25,
    skip: 0,
    limit: 25,
    selectedMember: null,
    newPoints: '',
    newPointsMap: {},
    deltaMap: {},
    sortBy: 'points',
    chunkSize: 12,
    sortDebounceMs: 150,
    searchDebounceMs: 250,
    totalCount: 0,
    officialCount: 0
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
    if (this.data.list.length === 0) this.fetch(true)
    this.updateCounts()
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
    const run = () => this.fetch(true)
    this._debounce('search', run, this.data.searchDebounceMs)
  },

  onSearch() {
    this.fetch(true)
  },

  async fetch(reset = false) {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const skip = reset ? 0 : this.data.skip
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'adminManageMembers',
        config: { env: cloudEnv },
        data: { action: 'list', query: { keyword: this.data.keyword, skip, limit: this.data.limit } }
      })
      
      if (!res.result || res.result.success !== true) {
        throw new Error(res.result?.message || '获取数据失败')
      }
      
      const arr = res.result.data || []
      
      // 调试日志：检查返回的用户数据结构
      console.log('云函数返回的用户数据:', arr)
      if (arr.length > 0) {
        console.log('第一个用户的 isAdmin 字段:', arr[0].isAdmin, '类型:', typeof arr[0].isAdmin)
        console.log('第一个用户完整数据:', arr[0])
      }
      
      // 处理用户头像URL和确保 isAdmin 字段是正确的布尔值类型
      const currentYear = new Date().getFullYear()
      const processedArr = arr.map(user => {
        const years = Array.isArray(user.membershipPaidYears) ? user.membershipPaidYears : []
        const paidThisYear = years.includes(currentYear)
        return {
          ...user,
          isAdmin: Boolean(user.isAdmin),
          paidThisYear
        }
      })
      const merged = reset ? processedArr : this.data.list.concat(processedArr)
      this.applySortAndRender(merged)
      this.setData({
        skip: (reset ? 0 : this.data.skip) + arr.length,
        noMore: arr.length < this.data.limit,
        hasMore: arr.length >= this.data.limit
      })
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
      const allRes = await db.collection('users').count()
      const officialRes = await db.collection('users').where({ isOfficialMember: true }).count()
      this.setData({ totalCount: (allRes && allRes.total) || 0, officialCount: (officialRes && officialRes.total) || 0 })
    } catch (e) {}
  },

  onSortByPoints() {
    const run = () => {
      if (this.data.sortBy !== 'points') this.setData({ sortBy: 'points' })
      this.applySortAndRender(this.data.list.slice())
    }
    this._debounce('sort', run, this.data.sortDebounceMs)
  },

  onSortByName() {
    const run = () => {
      if (this.data.sortBy !== 'name') this.setData({ sortBy: 'name' })
      this.applySortAndRender(this.data.list.slice())
    }
    this._debounce('sort', run, this.data.sortDebounceMs)
  },

  applySort(list) {
    const by = this.data.sortBy
    if (by === 'points') {
      return list.sort((a, b) => (Number(b.totalPoints || 0) - Number(a.totalPoints || 0)))
    }
    return list.sort((a, b) => {
      const an = (a.nickName || '').toString()
      const bn = (b.nickName || '').toString()
      return an.localeCompare(bn, 'zh')
    })
  },

  applySortAndRender(list) {
    const sorted = this.applySort(list)
    this.renderListChunked(sorted)
  },

  renderListChunked(arr) {
    // 取消上一次分片渲染
    if (this._renderToken == null) this._renderToken = 0
    this._renderToken += 1
    const token = this._renderToken
    const chunk = Math.max(6, this.data.chunkSize || 12)
    const total = arr.length
    const first = arr.slice(0, Math.min(chunk, total))
    this.setData({ list: first, members: first })
    let i = first.length
    const step = () => {
      if (token !== this._renderToken) return
      if (i >= total) return
      i = Math.min(i + chunk, total)
      const part = arr.slice(0, i)
      this.setData({ list: part, members: part })
      setTimeout(step, 16)
    }
    setTimeout(step, 16)
  },

  _debounce(key, fn, wait) {
    if (!this._timers) this._timers = {}
    if (this._timers[key]) clearTimeout(this._timers[key])
    this._timers[key] = setTimeout(() => {
      this._timers[key] = null
      try { fn() } catch (e) { console.error('debounce error', e) }
    }, Math.max(0, wait || 150))
  },

  onLoadMore() {
    if (!this.data.noMore) this.fetch(false)
  },

  onPointsInput(e) {
    const userId = e.currentTarget.dataset.userId
    const value = e.detail.value
    
    // 验证输入值，只允许数字和负号
    const validValue = value.replace(/[^-0-9]/g, '')
    
    // 确保负号只能在开头
    const sanitizedValue = validValue.replace(/(?!^)-/g, '')
    
    this.setData({ [`deltaMap.${userId}`]: sanitizedValue })
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
      console.log('排行榜缓存已清除');
    } catch (e) {
      console.warn('清除排行榜缓存失败:', e);
    }
  },

  async adjustPoints(e) {
    const userId = e.currentTarget.dataset.userId
    const deltaRaw = this.data.deltaMap[userId] || ''
    const delta = Number(deltaRaw)
    
    if (!userId || !Number.isFinite(delta) || delta === 0) {
      app.showToast('请输入非零数字', 'error')
      return
    }
    
    wx.showModal({
      title: '确认调整积分',
      content: `确认为该用户${delta > 0 ? '增加' : '扣减'} ${Math.abs(delta)} 分？`,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        
        try {
          app.showLoading('提交中...')
          
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const result = await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { 
              action: 'updatePoints', 
              data: { 
                id: userId, 
                delta, 
                reason: '后台调整' 
              } 
            }
          })
          
          if (!result.result || result.result.success !== true) {
            throw new Error(result.result?.message || '操作失败')
          }
          
          app.showToast('积分调整成功')
          this.setData({ [`deltaMap.${userId}`]: '' })
          
          // 清除排行榜缓存，确保积分更新后排行榜立即反映变化
          this.clearLeaderboardCache()
          
          this.fetch(true) // 刷新列表
          
        } catch (error) {
          console.error('调整失败:', error)
          app.showToast(error.message || '操作失败', 'error')
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 设置积分
  async onSetPoints(e) {
    const { id, openid } = e.currentTarget.dataset;
    const newPoints = parseInt(this.data.newPointsMap[id]);
    
    if (isNaN(newPoints) || newPoints < -8000) {
      wx.showToast({
        title: '积分值不能低于-8000分',
        icon: 'none'
      });
      return;
    }

    // 获取当前用户信息
    const currentMember = this.data.list.find(member => member._id === id);
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
                  openid: openid,
                  points: newPoints
                }
              }
            });

            if (result.result && result.result.success) {
              wx.showToast({
                title: '设置成功',
                icon: 'success'
              });
              
              // 清空输入框
              this.setData({
                [`newPointsMap.${id}`]: ''
              });
              
              // 清除排行榜缓存，确保积分更新后排行榜立即反映变化
              this.clearLeaderboardCache();
              
              // 刷新数据
              this.fetch(true);
            } else {
              throw new Error(result.result?.message || '设置失败');
            }
          } catch (error) {
            console.error('设置积分失败:', error);
            wx.showToast({
              title: error.message || '设置失败',
              icon: 'none'
            });
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
    
    // 修复：将字符串转换为布尔值
    const isAdmin = isAdminRaw === 'true' || isAdminRaw === true
    
    const action = isAdmin ? '取消管理员权限' : '设置为管理员'
    const content = isAdmin 
      ? `确认取消 ${nickName} 的管理员权限吗？取消后将无法进行管理操作。`
      : `确认将 ${nickName} 设置为管理员吗？设置为管理员后可发布公告、审核积分、管理兑换。`

    wx.showModal({
      title: action,
      content: content,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        
        try {
          app.showLoading('处理中...')
          
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const result = await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { 
              action: 'setAdmin', 
              data: { 
                id: userId, 
                isAdmin: !isAdmin 
              } 
            }
          })
          
          if (!result.result || result.result.success !== true) {
            throw new Error(result.result?.message || '操作失败')
          }
          
          // 立即更新本地数据，确保UI及时响应
          const updatedList = this.data.list.map(item => {
            if (item._id === userId) {
              return { ...item, isAdmin: !isAdmin }
            }
            return item
          })
          
          this.setData({
            list: updatedList
          })
          
          app.showToast(isAdmin ? '已取消管理员权限' : '已设置为管理员')
          
          // 不再自动刷新数据，避免覆盖本地更新
          
        } catch (error) {
          console.error('权限更新失败:', error)
          app.showToast(error.message || '操作失败', 'error')
          // 只在操作失败时刷新数据，恢复到服务器状态
          this.fetch(true)
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 新增：切换兑换锁定状态
  async toggleExchangeLock(e) {
    const userId = e?.currentTarget?.dataset?.userId
    // dataset 布尔可能是字符串，统一转为真正布尔
    const rawIsLocked = e?.currentTarget?.dataset?.isLocked
    const isLocked = rawIsLocked === true || rawIsLocked === 'true' || rawIsLocked === 1 || rawIsLocked === '1'
    const nickName = e?.currentTarget?.dataset?.nickName || '该用户'

    if (!userId) {
      console.error('toggleExchangeLock: 缺少 userId，dataset=', e?.currentTarget?.dataset)
      app.showToast('操作失败：缺少用户ID', 'error')
      return
    }
    // 非管理员保护（防止无权限调用云函数直接失败）
    if (app?.globalData?.isAdmin !== true) {
      app.showToast('仅管理员可进行此操作', 'error')
      return
    }
    
    const action = isLocked ? '解锁兑换' : '锁定兑换'
    const content = isLocked 
      ? `确认解锁 ${nickName} 的兑换权限吗？解锁后该用户可以正常兑换商品。`
      : `确认锁定 ${nickName} 的兑换权限吗？锁定后该用户将无法兑换商品，直到被解锁或参加比赛后自动解锁。`

    wx.showModal({
      title: action,
      content: content,
      confirmText: '确认',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        
        try {
          app.showLoading('处理中...')
          
          const result = await wx.cloud.callFunction({
            name: 'manageExchangeLock',
            data: { 
              action: isLocked ? 'unlockUser' : 'lockUser', 
              data: { 
                userId: userId,
                reason: isLocked ? '管理员手动解锁' : '管理员手动锁定'
              } 
            }
          })
          
          if (!result?.result || result.result.success !== true) {
            const msg = result?.result?.message || '操作失败'
            throw new Error(msg)
          }
          
          // 立即更新本地数据，确保UI及时响应
          const updatedList = this.data.list.map(item => {
            if (item._id === userId) {
              return { ...item, exchange_locked: !isLocked }
            }
            return item
          })
          
          this.setData({
            list: updatedList
          })
          
          app.showToast(isLocked ? '已解锁兑换权限' : '已锁定兑换权限')
          
        } catch (error) {
          console.error('兑换权限更新失败:', error)
          const errMsg = error?.errMsg || error?.message || '云函数调用失败'
          // 常见：无管理员权限、云环境未初始化、函数未部署
          if (/无管理员权限/.test(errMsg)) {
            app.showToast('操作失败：仅管理员可操作', 'error')
          } else if (/cloud.callFunction/.test(errMsg)) {
            app.showToast('云函数调用失败，请检查网络/云环境配置', 'error')
          } else {
            app.showToast(errMsg, 'error')
          }
          // 只在操作失败时刷新数据，恢复到服务器状态
          this.fetch(true)
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 新增：切换正式会员状态
  async toggleOfficialMember(e) {
    const userId = e?.currentTarget?.dataset?.userId
    const rawIsOfficial = e?.currentTarget?.dataset?.isOfficial
    const isOfficial = rawIsOfficial === true || rawIsOfficial === 'true' || rawIsOfficial === 1 || rawIsOfficial === '1'
    const nickName = e?.currentTarget?.dataset?.nickName || '该用户'

    if (!userId) return app.showToast('缺少用户ID', 'error')
    if (app?.globalData?.isAdmin !== true) return app.showToast('仅管理员可操作', 'error')

    const actionText = isOfficial ? '取消正式会员' : '设为正式会员'
    wx.showModal({
      title: actionText,
      content: `${actionText}：${nickName}？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          app.showLoading('处理中...')
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const result = await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { action: 'setMembership', data: { id: userId, isOfficialMember: !isOfficial } }
          })
          if (!result.result || result.result.success !== true) throw new Error(result.result?.message || '操作失败')
          // 更新本地列表
          const updatedList = this.data.list.map(item => item._id === userId ? { ...item, isOfficialMember: !isOfficial } : item)
          this.setData({ list: updatedList })
          app.showToast('更新成功')
        } catch (err) {
          console.error('更新正式会员失败', err)
          app.showToast(err.message || '操作失败', 'error')
          this.fetch(true)
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 新增：标记当年缴费
  async markPaidThisYear(e) {
    const userId = e?.currentTarget?.dataset?.userId
    const nickName = e?.currentTarget?.dataset?.nickName || '该用户'
    if (!userId) return app.showToast('缺少用户ID', 'error')
    if (app?.globalData?.isAdmin !== true) return app.showToast('仅管理员可操作', 'error')
    const currentYear = new Date().getFullYear()

    wx.showModal({
      title: '标记当年缴费',
      content: `确认标记 ${nickName} 已缴纳 ${currentYear} 年会费？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          app.showLoading('处理中...')
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const result = await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { action: 'setMembership', data: { id: userId, paidYear: currentYear } }
          })
          if (!result.result || result.result.success !== true) throw new Error(result.result?.message || '操作失败')
          // 更新本地列表：追加年份到 membershipPaidYears
          const updatedList = this.data.list.map(item => {
            if (item._id === userId) {
              const years = Array.isArray(item.membershipPaidYears) ? item.membershipPaidYears.slice() : []
              if (!years.includes(currentYear)) years.push(currentYear)
              return { ...item, membershipPaidYears: years, paidThisYear: true }
            }
            return item
          })
          this.setData({ list: updatedList })
          app.showToast('标记成功')
        } catch (err) {
          console.error('标记缴费失败', err)
          app.showToast(err.message || '操作失败', 'error')
          this.fetch(true)
        } finally {
          app.hideLoading()
        }
      }
    })
  },



  // 导出用户积分数据
  async onExportData() {
    if (this.data.loading || this.data.list.length === 0) return
    
    wx.showModal({
      title: '导出数据',
      content: '确认导出所有用户积分数据到CSV文件？',
      success: async (res) => {
        if (!res.confirm) return
        
        try {
          app.showLoading('正在导出数据...')
          
          // 调用云函数获取完整用户数据
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const result = await wx.cloud.callFunction({
            name: 'adminManageMembers',
            config: { env: cloudEnv },
            data: { 
              action: 'exportData'
            }
          })
          
          if (!result.result || result.result.success !== true) {
            throw new Error(result.result?.message || '获取数据失败')
          }
          
          const userData = result.result.data || []
          if (userData.length === 0) {
            app.showToast('暂无数据可导出', 'error')
            return
          }
          
          // 生成CSV内容
          const csvContent = this.generateCSV(userData)
          
          // 保存文件到本地
          await this.saveCSVFile(csvContent)
          
        } catch (error) {
          console.error('导出失败:', error)
          app.showToast(error.message || '导出失败', 'error')
        } finally {
          app.hideLoading()
        }
      }
    })
  },

  // 生成CSV内容
  generateCSV(userData) {
    // CSV表头
    const headers = [
      '用户昵称',
      '用户ID', 
      '总积分',
      '激活状态',
      '管理员状态',
      '注册时间',
      '最后活动时间',
      '积分获得次数'
    ]
    
    // 生成CSV行
    const rows = userData.map(user => {
      return [
        user.nickName || '未知昵称',
        user._openid || user.openid || '',
        user.totalPoints || 0,
        user.isActivated ? '已激活' : '未激活',
        user.isAdmin ? '是' : '否',
        user.createTime ? this.formatDate(user.createTime) : '',
        user.lastActiveTime ? this.formatDate(user.lastActiveTime) : '',
        user.pointsCount || 0
      ]
    })
    
    // 组合CSV内容
    const csvRows = [headers, ...rows]
    return csvRows.map(row => 
      row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')
    ).join('\n')
  },

  // 格式化日期
  formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  },

  // 保存CSV文件到本地
  async saveCSVFile(csvContent) {
    try {
      const fs = wx.getFileSystemManager()
      const fileName = `用户积分数据_${this.formatDate(Date.now()).replace(/[:\s]/g, '_')}.csv`
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`
      
      // 写入文件
      fs.writeFileSync(filePath, csvContent, 'utf8')
      
      // 显示成功提示并提供操作选项
      wx.showModal({
        title: '导出成功',
        content: `文件已保存为：${fileName}\n\n请选择后续操作：`,
        confirmText: '分享文件',
        cancelText: '完成',
        success: (res) => {
          if (res.confirm) {
            // 分享文件
            wx.shareFileMessage({
              filePath: filePath,
              fileName: fileName,
              success: () => {
                app.showToast('文件分享成功')
              },
              fail: (err) => {
                console.error('分享失败:', err)
                // 如果分享失败，尝试打开文档
                wx.openDocument({
                  filePath: filePath,
                  fileType: 'csv',
                  success: () => {
                    app.showToast('文件已打开')
                  },
                  fail: (openErr) => {
                    console.error('打开文件失败:', openErr)
                    app.showToast('文件已保存到本地', 'success')
                  }
                })
              }
            })
          } else {
            app.showToast('文件已保存到本地', 'success')
          }
        }
      })
      
    } catch (error) {
      console.error('保存文件失败:', error)
      throw new Error('保存文件失败')
    }
  }
})
