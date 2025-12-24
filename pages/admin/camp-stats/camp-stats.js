const app = getApp()

Page({
  data: {
    isAdmin: false,
    loading: false,
    list: [],
    totalCount: 0,
    campId: 'camp_hengqin_2026'
  },
  onLoad() {
    const u = app.globalData.userInfo
    const roles = (u && (u.roles || [])) || []
    const role = u && (u.role || '')
    const isAdmin = !!(u && (u.isAdmin === true || u.admin === true || u.isSuperAdmin === true || (Array.isArray(roles) && roles.includes('admin')) || role === 'admin'))
    if (!u || !isAdmin) {
      wx.showModal({ title: '权限不足', content: '只有管理员才能访问此页面', showCancel: false, success: () => { wx.switchTab({ url: '/pages/profile/profile' }) } })
      return
    }
    this.setData({ isAdmin: true })
    this.loadData()
  },
  async loadData() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'participantsStats', query: { camp_id: this.data.campId, limit: 200 } } })
      if (r && r.result && r.result.success) {
        const list = (r.result.data || []).map(it => ({
          ...it,
          lastText: it.lastActivity ? this.formatTime(it.lastActivity) : ''
        }))
        this.setData({ list, totalCount: r.result.count || list.length })
      } else {
        wx.showToast({ title: r.result && r.result.message ? r.result.message : '加载失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally { this.setData({ loading: false }) }
  },
  formatTime(t) {
    try { const d = new Date(t); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); const hh=String(d.getHours()).padStart(2,'0'); const mm=String(d.getMinutes()).padStart(2,'0'); return `${y}-${m}-${da} ${hh}:${mm}` } catch (_) { return '' }
  },
  async onExport() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'participantsExport', query: { camp_id: this.data.campId } } })
      if (r && r.result && r.result.success) {
        const url = r.result.url || ''
        const fileID = r.result.fileID || ''
        if (url) {
          try {
            wx.setClipboardData({ data: url })
            wx.showToast({ title: '下载链接已复制', icon: 'success' })
          } catch (_) {}
          wx.downloadFile({ url, success: (d) => { if (d.tempFilePath) wx.openDocument({ filePath: d.tempFilePath }) } })
        } else if (fileID) {
          wx.showToast({ title: '已生成文件', icon: 'success' })
        } else {
          wx.showToast({ title: '已生成CSV（无链接）', icon: 'none' })
        }
      } else {
        wx.showToast({ title: r.result && r.result.message ? r.result.message : '导出失败', icon: 'none' })
      }
    } catch (e) { wx.showToast({ title: '导出失败', icon: 'none' }) }
  }
})
