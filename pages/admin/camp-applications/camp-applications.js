const app = getApp()

Page({
  data: {
    isAdmin: false,
    list: [],
    loading: false,
    currentTab: 'pending'
  },

  onLoad() {
    const u = app.globalData.userInfo
    if (!u || u.isAdmin !== true) {
      wx.showModal({ title: '权限不足', content: '只有管理员才能访问此页面', showCancel: false, success: () => { wx.switchTab({ url: '/pages/profile/profile' }) } })
      return
    }
    this.setData({ isAdmin: true })
    this.loadList()
  },

  onTabChange(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ currentTab: id })
    this.loadList()
  },

  async loadList() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
            try {
              const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'list', query: { status: this.data.currentTab, limit: 50 } } })
              const rows = (r.result && r.result.data) || []
              const list = rows.map(it => ({ ...it, applyTimeText: this.format(it.applyTime) }))
              this.setData({ list })
            } catch (_) {
              const db = wx.cloud.database({ env: cloudEnv })
              const where = this.data.currentTab === 'pending' ? { status: 'pending' } : (this.data.currentTab === 'approved' ? { status: 'approved' } : { status: 'rejected' })
              const res = await db.collection('camp_applications').where(where).orderBy('applyTime', 'desc').limit(50).get()
              const rows = res.data || []
              const openids = [...new Set(rows.map(x => x._openid).filter(Boolean))]
              let userMap = {}
              if (openids.length) {
                const _ = db.command
                const ur = await db.collection('users').where({ _openid: _.in(openids) }).get()
                (ur.data || []).forEach(u => { userMap[u._openid] = u })
              }
              const list = rows.map(it => ({
                ...it,
                nickName: (userMap[it._openid] && (userMap[it._openid].nickName || userMap[it._openid].realName)) || '',
                applyTimeText: this.format(it.applyTime)
              }))
              this.setData({ list })
            }
    } catch (err) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      console.error(err)
    } finally {
      this.setData({ loading: false })
    }
  },

  async approve(e) {
    const id = e.currentTarget.dataset.id
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    wx.showLoading({ title: '提交中...' })
    try {
      try {
        const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'approve', data: { id } } })
        wx.hideLoading()
        if (r.result && r.result.success) {
          wx.showToast({ title: '已通过', icon: 'success' })
          this.loadList()
          return
        }
      } catch (_) {
        const db = wx.cloud.database({ env: cloudEnv })
        await db.collection('camp_applications').doc(id).update({ data: { status: 'approved', approveTime: Date.now() } })
        wx.hideLoading()
        wx.showToast({ title: '已通过', icon: 'success' })
        this.loadList()
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
      console.error(err)
    }
  },

  async reject(e) {
    const id = e.currentTarget.dataset.id
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    wx.showLoading({ title: '提交中...' })
    try {
      try {
        const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'reject', data: { id } } })
        wx.hideLoading()
        if (r.result && r.result.success) {
          wx.showToast({ title: '已拒绝', icon: 'success' })
          this.loadList()
          return
        }
      } catch (_) {
        const db = wx.cloud.database({ env: cloudEnv })
        await db.collection('camp_applications').doc(id).update({ data: { status: 'rejected', rejectTime: Date.now() } })
        wx.hideLoading()
        wx.showToast({ title: '已拒绝', icon: 'success' })
        this.loadList()
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
      console.error(err)
    }
  },

  format(t) {
    try {
      const d = t ? new Date(t) : new Date()
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${y}-${m}-${da} ${hh}:${mm}`
    } catch (_) { return '' }
  }
})
