const app = getApp()

Page({
  data: {
    currentTab: 'month',
    top3: [],
    rankList: [],
    myRank: null,
    loading: true
  },

  onLoad() {
    this.loadLeaderboard()
  },

  onShow() {
    this.loadLeaderboard()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) return
    
    this.setData({ 
      currentTab: tab,
      loading: true
    })
    
    this.loadLeaderboard()
  },

  async loadLeaderboard() {
    try {
      this.setData({ loading: true })
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const tab = this.data.currentTab
      if (tab === 'month') {
        await this.loadMonthlyTrainingLeaderboard(cloudEnv)
        return
      }
      const res = await wx.cloud.callFunction({
        name: 'getLeaderboard',
        config: { env: cloudEnv },
        data: { limit: 50, offset: 0 }
      })
      if (res.result && res.result.success) {
        const list = res.result.data
        const mapped = list.map(u => ({ ...u, points: Number(u.totalPoints || 0) }))
        const top3 = mapped.slice(0, 3)
        const rankList = mapped.slice(3)
        let openid = (app.globalData.userInfo && app.globalData.userInfo._openid) || ''
        if (!openid) {
          try {
            const { result: loginRes } = await wx.cloud.callFunction({ name: 'login', config: { env: cloudEnv } })
            openid = loginRes.openid
          } catch (_) {}
        }
        let myRank = null
        if (openid) myRank = mapped.find(u => u._openid === openid || u.openid === openid)
        if (!myRank) myRank = { rank: '-', nickName: '我', points: 0, avatarUrl: '' }
        this.setData({ top3, rankList, myRank, loading: false })
      } else {
        throw new Error('getLeaderboard failed')
      }
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载排行失败', icon: 'none' })
    }
  },

  async loadMonthlyTrainingLeaderboard(cloudEnv) {
    try {
      const now = new Date()
      const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
      const res = await wx.cloud.callFunction({
        name: 'getTrainingLeaderboard',
        config: { env: cloudEnv },
        data: { limit: 50, month: monthStr }
      })
      if (!res.result || !res.result.success) throw new Error('cloudfn failed')
      const rows = (res.result.data.leaderboard || []).map((r, idx) => ({
        rank: r.rank || (idx + 1),
        userId: r.userId || '',
        nickName: r.nickname || '微信用户',
        avatarUrl: r.avatarUrl || '/images/default-avatar.png',
        points: `${Math.round(r.totalTrainingHours || 0)}h`
      }))
      const top3 = rows.slice(0,3)
      const rankList = rows.slice(3)
      let myRank = null
      const me = res.result.data.currentUserRank
      if (me && typeof me === 'object') {
        myRank = {
          rank: me.rank || '-',
          nickName: me.nickname || '我',
          avatarUrl: me.avatarUrl || '/images/default-avatar.png',
          points: `${Math.round(me.totalTrainingHours || 0)}h`
        }
      }
      if (!myRank) myRank = { rank: '-', nickName: '我', points: '0h', avatarUrl: '' }
      this.setData({ top3, rankList, myRank, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: '加载本月排行失败', icon: 'none' })
    }
  },

  getMockData(type) {
    // 生成模拟数据
    const users = [
      { id: 1, nickName: 'IronMan', points: 1500, avatarUrl: '' },
      { id: 2, nickName: 'Captain', points: 1450, avatarUrl: '' },
      { id: 3, nickName: 'Thor', points: 1300, avatarUrl: '' },
      { id: 4, nickName: 'Hulk', points: 1200, avatarUrl: '' },
      { id: 5, nickName: 'Widow', points: 1100, avatarUrl: '' },
      { id: 6, nickName: 'Hawkeye', points: 1000, avatarUrl: '' },
      { id: 7, nickName: 'Spider', points: 900, avatarUrl: '' },
      { id: 8, nickName: 'Strange', points: 800, avatarUrl: '' },
    ]

    // 根据类型稍微调整分数，让数据看起来不一样
    if (type === 'season') {
      users.forEach(u => u.points *= 3)
    }

    // 分配排名
    const top3 = users.slice(0, 3)
    const rankList = users.slice(3).map((u, index) => ({
      ...u,
      rank: index + 4
    }))

    return {
      top3,
      rankList,
      myRank: {
        rank: 99,
        nickName: '我',
        points: 0,
        avatarUrl: ''
      }
    }
  }
})
