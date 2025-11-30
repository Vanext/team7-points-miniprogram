// pages/home/home.js
const app = getApp()

Page({
  data: {
    userInfo: {},
    announcements: [],
    recentPoints: [],
    partners: Array(6).fill({ key: '', url: '' }),
    annExpandedIndex: -1,
    loading: false,
    isLoggedIn: false,
    isAdmin: false,
    partnerKeys: ['descente','qrtri','quintanaroo','kse','extra1','extra2'],
    bulletins: [],
    joinedMap: {},
    expandedIds: [],
    myOpenid: ''
  },

  onLoad() {
    this.loadData()
    this.fetchPartnersFromCloud()
    this.fetchTrainingBulletin()
  },

  onShow() {
    this.loadData()
    this.fetchPartnersFromCloud()
    this.fetchTrainingBulletin()
    this.startAnnAutoScroll()
    try {
      wx.cloud.callFunction({ name: 'statisticsManager', data: { action: 'recordVisit', data: { category: 'home', page: 'pages/home/home' } } })
    } catch (_) {}
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] })
  },

  async loadData() {
    try {
      this.setData({ loading: true })
      
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const token = wx.getStorageSync('token') || ''
      const isLoggedInByToken = !!token
      this.setData({ isLoggedIn: isLoggedInByToken })

      // 1. 获取 OpenID
      const { result: loginRes } = await wx.cloud.callFunction({ 
        name: 'login',
        config: {
          env: cloudEnv
        }
      })
      const openid = loginRes.openid
      
      // 2. 获取用户档案
      const { result: userRes } = await wx.cloud.callFunction({
        name: 'getUserProfile',
        config: {
          env: cloudEnv
        },
        data: { userId: openid }
      })

      let userInfo = {
        nickName: '未登录',
        avatarUrl: '/images/default-avatar.png',
        totalPoints: 0,
        isActivated: false
      }

      if (userRes.success && userRes.data && userRes.data.userInfo) {
        const u = userRes.data.userInfo
        const displayName = u.nickName || u.nickname || u.realName || '微信用户'
        const avatar = u.avatarUrl || '/images/default-avatar.png'
        userInfo = { ...u, nickName: displayName, avatarUrl: avatar, isActivated: true }
        app.globalData.userInfo = userInfo;
        app.globalData.isAdmin = u.isAdmin === true
        this.setData({ isLoggedIn: true, isAdmin: app.globalData.isAdmin === true })
      }

      // 3. 获取公告 (直接查询数据库)
      const { result: annRes } = await wx.cloud.callFunction({
        name: 'getAnnouncements',
        config: { env: cloudEnv },
        data: { limit: 5, homeOnly: true }
      })

      const annList = annRes && annRes.success ? annRes.data : []
      const announcements = (annList || []).map(item => ({
        id: item._id || String(item.createTime),
        title: item.title || '',
        content: item.content || '',
        createTime: this.formatTime(item.createTime)
      }))

      // 4. 训练营申请状态（云函数）
      let campStatus = 'none'
      try {
        const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'getMyStatus' } })
        if (r.result && r.result.success) campStatus = r.result.status || 'none'
      } catch (_) {
        try {
          const db = wx.cloud.database({ env: cloudEnv })
          const appRes = await db.collection('camp_applications').where({ _openid: openid }).orderBy('applyTime','desc').limit(1).get()
          const rec = (appRes && appRes.data && appRes.data[0]) || null
          if (rec && rec.status === 'approved') campStatus = 'approved'
          else if (rec && rec.status === 'pending') campStatus = 'pending'
        } catch (__) {}
      }

      this.setData({
        userInfo,
        announcements,
        recentPoints: [],
        campStatus,
        myOpenid: openid
      })
      
    } catch (error) {
      console.error('加载失败:', error)
      // 即使加载失败也显示默认状态，不频繁弹窗打扰用户
    } finally {
      this.setData({ loading: false })
    }
  },

  toggleAnnExpand(e) {
    const idx = e.currentTarget.dataset.index
    const cur = this.data.annExpandedIndex
    this.setData({ annExpandedIndex: cur === idx ? -1 : idx })
  },

  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  onUnload() {
    this.stopAnnAutoScroll()
  },

  navigateToUpload() {
    wx.switchTab({
      url: '/pages/upload/upload'
    })
  },

  navigateToStore() {
    wx.switchTab({
      url: '/pages/store/store'
    })
  },

  navigateToLeaderboard() {
    wx.switchTab({
      url: '/pages/leaderboard/leaderboard'
    })
  },

  navigateToProfile() {
    wx.switchTab({
      url: '/pages/profile/profile'
    })
  },

  navigateToTrainingAssistant() {
    wx.navigateTo({ url: '/pages/training-assistant/training-assistant' })
  },

  navigateToTools() {
    wx.navigateTo({
      url: '/pages/tools/tools'
    })
  },
  onJoinCamp() {
    const status = this.data.campStatus
    if (status === 'approved') {
      wx.navigateTo({ url: '/pages/camp/home/home?approved=1' })
      return
    }
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    wx.showLoading({ title: '提交申请...' })
    wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'apply' } })
      .then(r => {
        wx.hideLoading()
        if (r.result && r.result.success) {
          wx.showToast({ title: '已提交审核', icon: 'success' })
          this.setData({ campStatus: 'pending' })
        } else {
          wx.showToast({ title: '提交失败', icon: 'none' })
        }
      })
      .catch(err => {
        try {
          const db = wx.cloud.database({ env: cloudEnv })
          db.collection('camp_applications').add({ data: { status: 'pending', applyTime: Date.now() } })
            .then(() => {
              wx.hideLoading()
              wx.showToast({ title: '已提交审核', icon: 'success' })
              this.setData({ campStatus: 'pending' })
            })
            .catch(e => {
              wx.hideLoading()
              wx.showToast({ title: '提交失败', icon: 'none' })
              console.error('申请失败', e)
            })
        } catch (e2) {
          wx.hideLoading()
          wx.showToast({ title: '提交失败', icon: 'none' })
          console.error('申请失败', e2)
        }
      })
  },

  onAnnSwiperChange() {
    this.stopAnnAutoScroll()
    this.setData({ annScrollTop: 0 })
    this.startAnnAutoScroll()
  },

  startAnnAutoScroll() {
    if (this.annTimer) clearInterval(this.annTimer)
    this.annTimer = setInterval(() => {
      const cur = this.data.annScrollTop || 0
      const next = cur >= 2000 ? 0 : cur + 2
      this.setData({ annScrollTop: next })
    }, 60)
  },

  stopAnnAutoScroll() {
    if (this.annTimer) {
      clearInterval(this.annTimer)
      this.annTimer = null
    }
  },

  async fetchPartnersFromCloud() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'statisticsManager', data: { action: 'getPartners' }, config: { env: cloudEnv } })
      const list = (res.result && res.result.data && res.result.data.list) || []
      const partnerKeys = this.data.partnerKeys
      let ordered = partnerKeys.map(k => {
        const found = list.find(it => it.key === k) || { key: k, url: '', fileID: '' }
        return { key: found.key, url: found.url || '', fileID: found.fileID || '' }
      })
      const missing = ordered.filter(it => it.fileID && !it.url)
      if (missing.length) {
        try {
          const r = await wx.cloud.getTempFileURL({ fileList: missing.map(m => m.fileID) })
          const map = {}
          ;(r.fileList || []).forEach(f => { map[f.fileID] = f.tempFileURL || '' })
          ordered = ordered.map(it => ({ key: it.key, url: it.url || (it.fileID ? (map[it.fileID] || '') : ''), fileID: it.fileID }))
        } catch (_) {}
      }
      this.setData({ partners: ordered.map(it => ({ key: it.key, url: it.url })) })
    } catch (err) {
      console.error('获取合作伙伴失败', err)
    }
  },

  uploadPartnerImage(e) {
    if (!this.data.isAdmin) { wx.showToast({ title: '仅管理员可上传', icon: 'none' }); return }
    const index = e.currentTarget.dataset.index
    const key = this.data.partnerKeys[index] || `extra${index}`
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        const cloudPath = `partners/${key}_${Date.now()}.png`
        
        wx.showLoading({ title: '上传中...' })
        
        try {
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath, config: { env: cloudEnv } })
          await wx.cloud.callFunction({ name: 'statisticsManager', data: { action: 'upsertPartner', data: { key, fileID } }, config: { env: cloudEnv } })
          await this.fetchPartnersFromCloud()
          wx.hideLoading()
          wx.showToast({ title: '上传成功', icon: 'success' })
        } catch (error) {
          console.error('上传失败', error)
          wx.hideLoading()
          wx.showToast({ title: '上传失败', icon: 'none' })
        }
      }
    })
  },

  onShareAppMessage() {
    return {
      title: 'Team 7 积分小程序｜首页',
      path: '/pages/home/home?ref=share'
    }
  },

  onShareTimeline() {
    return {
      title: 'Team 7 积分小程序｜首页',
      query: 'ref=timeline'
    }
  }
,
  async fetchTrainingBulletin() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const r = await wx.cloud.callFunction({ name: 'trainingBulletins', config: { env: cloudEnv }, data: { action: 'getActive', data: { limit: 2 } } })
      const data = r.result && r.result.data
      if (r.result && r.result.success && data && Array.isArray(data.bulletins)) {
        const list = data.bulletins.map(x => {
          const seen = {}
          const named = []
          ;(x.participants || []).forEach(p => {
            const k = (p && p.openid) || ''
            const nm = (p && p.nickName) || ''
            if (!k || seen[k]) return
            seen[k] = 1
            if (nm && nm !== '未登录' && nm !== '微信用户') named.push({ openid: k, nickName: nm })
          })
          return { ...x.bulletin, joined: !!x.joined, participants: named, expanded: false }
        })
        const joined = {}
        list.forEach(it => { joined[it._id] = !!it.joined })
        this.setData({ bulletins: list, joinedMap: joined })
      } else {
        this.setData({ bulletins: [], joinedMap: {} })
      }
    } catch (_) {
      this.setData({ bulletins: [], joinedMap: {} })
    }
  },

  async toggleJoinBulletin(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const b = (this.data.bulletins || []).find(x => x._id === id)
    if (!b) return
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    const action = this.data.joinedMap[id] ? 'leave' : 'join'
    const rawNick = (this.data.userInfo && (this.data.userInfo.nickName || this.data.userInfo.nickname || this.data.userInfo.realName)) || ''
    const validNick = (!!rawNick && rawNick !== '未登录' && rawNick !== '微信用户')
    const nick = validNick ? rawNick : ''
    wx.showLoading({ title: action === 'join' ? '加入中...' : '取消中...' })
    try {
      if (action === 'join' && b.reminderTemplateId) {
        try { await wx.requestSubscribeMessage({ tmplIds: [b.reminderTemplateId] }) } catch (_) {}
      }
      const r = await wx.cloud.callFunction({ name: 'trainingBulletins', config: { env: cloudEnv }, data: { action, data: { bulletinId: b._id, nickName: nick } } })
      wx.hideLoading()
      if (r.result && r.result.success) {
        // 乐观更新本地数据，立即显示标签
        const list = (this.data.bulletins || []).map(x => {
          if (x._id !== id) return x
          const participants = Array.isArray(x.participants) ? x.participants.slice() : []
          if (action === 'join') {
            const me = this.data.myOpenid
            if (me) {
              const exists = participants.some(p => p.openid === me)
              if (!exists && validNick) participants.push({ openid: me, nickName: nick })
            }
          } else {
            const filtered = participants.filter(p => p.openid !== this.data.myOpenid)
            return { ...x, participants: filtered, joined: false }
          }
          const seen = {}
          const dedup = []
          participants.forEach(p => {
            const k = p.openid
            if (!k || seen[k]) return
            seen[k] = 1
            dedup.push(p)
          })
          return { ...x, participants: dedup, joined: action === 'join' }
        })
        const jm = { ...this.data.joinedMap, [id]: action === 'join' }
        this.setData({ bulletins: list, joinedMap: jm })
        // 后续拉取以与云端数据对齐
        await this.fetchTrainingBulletin()
        wx.showToast({ title: action === 'join' ? '已加入' : '已取消', icon: 'success' })
      } else {
        const msg = (r.result && r.result.message) || '操作失败'
        wx.showToast({ title: msg, icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  toggleParticipantsExpanded(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const list = (this.data.bulletins || []).map(x => {
      if (x._id === id) return { ...x, expanded: !x.expanded }
      return x
    })
    this.setData({ bulletins: list })
  },
})
