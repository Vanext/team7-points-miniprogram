const app = getApp()

const CACHE_VERSION = 1
const CACHE_TTL_SEASON_MS = 60 * 1000
const CACHE_TTL_MONTH_MS = 3 * 60 * 1000

function cacheKey(tab, month) {
  const m = month ? String(month) : ''
  return `leaderboard_cache_v${CACHE_VERSION}:${String(tab)}:${m}`
}

function readCache(key, ttlMs) {
  try {
    const v = wx.getStorageSync(key)
    if (!v || typeof v !== 'object') return null
    const ts = v.ts
    if (!ts || (Date.now() - ts) > ttlMs) return null
    return v.data || null
  } catch (_) {
    return null
  }
}

function writeCache(key, data) {
  try {
    wx.setStorageSync(key, { ts: Date.now(), data })
  } catch (_) {}
}

Page({
  data: {
    currentTab: 'season',
    top3: [],
    rankList: [],
    myRank: null,
    loading: true,
    selectedMonth: '',
    fallbackUsed: false,
    fallbackTipMonth: ''
  },

  onLoad() {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    this.setData({ selectedMonth: monthStr })
    this.loadLeaderboard()
  },

  onShow() {
    if (this.data.loading !== true && this.data.top3 && this.data.top3.length) return
    this.loadLeaderboard()
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) return
    
    this.setData({ 
      currentTab: tab,
      loading: true,
      fallbackUsed: false,
      fallbackTipMonth: ''
    })
    
    this.loadLeaderboard()
  },

  onMonthChange(e) {
    const val = e.detail && e.detail.value
    if (!val) return
    this.setData({ selectedMonth: val, fallbackUsed: false, fallbackTipMonth: '' })
    this.loadLeaderboard()
  },

  async loadLeaderboard() {
    const tab = this.data.currentTab
    const monthStr = this.data.selectedMonth
    const inflightKey = `${tab}:${monthStr || ''}`
    if (this._inflightKey === inflightKey && this._inflightPromise) return this._inflightPromise
    this._inflightKey = inflightKey
    try {
      this.setData({ loading: true })
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      if (tab === 'month') {
        const key = cacheKey(tab, monthStr)
        const cached = readCache(key, CACHE_TTL_MONTH_MS)
        if (cached) {
          this.applyMonthlyLeaderboardData(cached)
          this.setData({ loading: false })
          return
        }
        this._inflightPromise = this.loadMonthlyTrainingLeaderboard(cloudEnv)
        await this._inflightPromise
        return
      }
      const key = cacheKey(tab, '')
      const cached = readCache(key, CACHE_TTL_SEASON_MS)
      if (cached && Array.isArray(cached.list)) {
        const openid = (app.globalData.userInfo && app.globalData.userInfo._openid) || ''
        this.applySeasonLeaderboardList(cached.list, openid)
        this.setData({ loading: false })
        return
      }
      const p = this.loadSeasonLeaderboard(cloudEnv)
      this._inflightPromise = p
      await p
      return
    } finally {
      this._inflightPromise = null
      this._inflightKey = ''
    }
  },

  async loadSeasonLeaderboard(cloudEnv) {
    const res = await wx.cloud.callFunction({
      name: 'getLeaderboard',
      config: { env: cloudEnv },
      data: { limit: 50, offset: 0 }
    })
    if (res.result && res.result.success) {
      const list = res.result.data
      let openid = (app.globalData.userInfo && app.globalData.userInfo._openid) || ''
      if (!openid) {
        try {
          const { result: loginRes } = await wx.cloud.callFunction({ name: 'login', config: { env: cloudEnv } })
          openid = loginRes.openid
        } catch (_) {}
      }
      this.applySeasonLeaderboardList(list, openid)
      writeCache(cacheKey('season', ''), { list })
    } else {
      throw new Error('getLeaderboard failed')
    }
  },

  applySeasonLeaderboardList(list, openid) {
    const mapped = (Array.isArray(list) ? list : []).map(u => ({ ...u, points: Number(u.totalPoints || 0) }))
    const top3 = mapped.slice(0, 3)
    const rankList = mapped.slice(3)
    let myRank = null
    if (openid) myRank = mapped.find(u => u._openid === openid || u.openid === openid)
    if (!myRank) myRank = { rank: '-', nickName: '我', points: 0, avatarUrl: '' }
    this.setData({ top3, rankList, myRank, loading: false })
  },

  applyMonthlyLeaderboardData(data) {
    const monthStr = this.data.selectedMonth
    let rows = (data.leaderboard || []).map((r, idx) => ({
      rank: r.rank || (idx + 1),
      userId: r.userId || '',
      nickName: r.nickname || '微信用户',
      avatarUrl: r.avatarUrl || '/images/default-avatar.png',
      points: `${Math.round(r.totalTrainingHours || 0)}h`
    }))
    if (rows.length === 0 && data.fallback && data.fallback.month && Array.isArray(data.fallback.leaderboard)) {
      rows = data.fallback.leaderboard.map((r, idx) => ({
        rank: r.rank || (idx + 1),
        userId: r.userId || '',
        nickName: r.nickname || '微信用户',
        avatarUrl: r.avatarUrl || '/images/default-avatar.png',
        points: `${Math.round(r.totalTrainingHours || 0)}h`
      }))
      this.setData({ fallbackUsed: true, fallbackTipMonth: data.fallback.month })
    } else {
      this.setData({ fallbackUsed: false, fallbackTipMonth: '' })
    }
    const top3 = rows.slice(0, 3)
    const rankList = rows.slice(3)
    let myRank = null
    const me = data.currentUserRank
    if (me && typeof me === 'object') {
      myRank = {
        rank: me.rank || '-',
        nickName: me.nickname || '我',
        avatarUrl: me.avatarUrl || '/images/default-avatar.png',
        points: `${Math.round(me.totalTrainingHours || 0)}h`
      }
    }
    if (!myRank) myRank = { rank: '-', nickName: '我', points: '0h', avatarUrl: '' }
    this.setData({ top3, rankList, myRank, loading: false, selectedMonth: monthStr })
  },

  async ensureOpenid(cloudEnv) {
    let openid = (app.globalData.userInfo && app.globalData.userInfo._openid) || ''
    if (openid) return openid
    try {
      const { result: loginRes } = await wx.cloud.callFunction({ name: 'login', config: { env: cloudEnv } })
      return loginRes.openid
    } catch (_) {
      return ''
    }
  },

  async loadMonthlyTrainingLeaderboard(cloudEnv) {
    const monthStr = this.data.selectedMonth
    const res = await wx.cloud.callFunction({
      name: 'getTrainingLeaderboard',
      config: { env: cloudEnv },
      data: { limit: 50, month: monthStr }
    })
    if (!res.result || !res.result.success) throw new Error('cloudfn failed')
    let payload = res.result.data || {}
    if ((payload.leaderboard || []).length === 0) {
      const [y, m] = monthStr.split('-').map(v => parseInt(v, 10))
      const prev = new Date(y, m - 2, 1)
      const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
      const res2 = await wx.cloud.callFunction({ name: 'getTrainingLeaderboard', config: { env: cloudEnv }, data: { limit: 50, month: prevStr } })
      if (res2.result && res2.result.success) {
        const p2 = res2.result.data || {}
        payload = { ...payload, fallback: { month: prevStr, leaderboard: p2.leaderboard || [] } }
      }
    }
    this.applyMonthlyLeaderboardData(payload)
    writeCache(cacheKey('month', monthStr), payload)
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
