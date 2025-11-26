const app = getApp()

Page({
  data: { timeRange: '30d', totals: { total: 0, home: 0, tools: 0, upload: 0, store: 0, admin: 0 }, business: { submissions: 0, audits: 0, products: 0 }, bars: [], summary: '' },
  onShow() { this.fetchAnalytics() },
  async fetchAnalytics() {
    try {
      app.showLoading('加载中')
      const res = await wx.cloud.callFunction({ name: 'statisticsManager', data: { action: 'getQuickAnalytics', data: { timeRange: this.data.timeRange } } })
      if (!res.result || res.result.success !== true) {
        // 回退：尝试管理员统计，避免“未知操作”导致页面不可用
        const fallback = await wx.cloud.callFunction({ name: 'statisticsManager', data: { action: 'getAdminStats', data: { timeRange: this.data.timeRange } } })
        if (!fallback.result || fallback.result.success !== true) throw new Error(res.result?.message || fallback.result?.message || '获取失败')
        const totals = { total: 0, home: 0, tools: 0, upload: 0, store: 0, admin: 0 }
        const business = { submissions: fallback.result.data?.summary?.totalRecords || 0, audits: (fallback.result.data?.summary?.pendingRecords || 0) + (fallback.result.data?.summary?.totalExchanges || 0), products: fallback.result.data?.summary?.totalProducts || 0 }
        const summary = `暂未生成访问统计，业务概览：上传 ${business.submissions}，审核 ${business.audits}，商品 ${business.products}。`
        const bars = [
          { name: '主页', count: 0, percent: 0 },
          { name: '工具页', count: 0, percent: 0 },
          { name: '积分打卡', count: 0, percent: 0 },
          { name: '积分兑换', count: 0, percent: 0 },
          { name: '管理员页', count: 0, percent: 0 }
        ]
        this.setData({ totals, business, bars, summary })
        return
      }
      const { totals, business, summary, timeRange } = res.result.data
      const max = Math.max(1, totals.home, totals.tools, totals.upload, totals.store, totals.leaderboard, totals.admin)
      const bars = [
        { name: '主页', count: totals.home, percent: Math.round(totals.home * 100 / max) },
        { name: '工具页', count: totals.tools, percent: Math.round(totals.tools * 100 / max) },
        { name: '积分打卡', count: totals.upload, percent: Math.round(totals.upload * 100 / max) },
        { name: '积分榜', count: totals.leaderboard, percent: Math.round(totals.leaderboard * 100 / max) },
        { name: '积分兑换', count: totals.store, percent: Math.round(totals.store * 100 / max) },
        { name: '管理员页', count: totals.admin, percent: Math.round(totals.admin * 100 / max) }
      ]
      this.setData({ totals, business, bars, summary, timeRange })
    } catch (e) {
      try {
        const fallback = await wx.cloud.callFunction({ name: 'statisticsManager', data: { action: 'getAdminStats', data: { timeRange: this.data.timeRange } } })
        const s = fallback.result && fallback.result.success === true ? fallback.result.data : null
        if (s) {
          const totals = { total: 0, home: 0, tools: 0, upload: 0, store: 0, admin: 0 }
          const business = { submissions: s.summary?.totalRecords || 0, audits: (s.summary?.pendingRecords || 0) + (s.summary?.totalExchanges || 0), products: s.summary?.totalProducts || 0 }
          const summary = `暂未生成访问统计，业务概览：上传 ${business.submissions}，审核 ${business.audits}，商品 ${business.products}。`
          const bars = [
            { name: '主页', count: 0, percent: 0 },
            { name: '工具页', count: 0, percent: 0 },
            { name: '积分打卡', count: 0, percent: 0 },
            { name: '积分兑换', count: 0, percent: 0 },
            { name: '管理员页', count: 0, percent: 0 }
          ]
          this.setData({ totals, business, bars, summary })
        } else {
          app.handleError(e, '加载失败')
        }
      } catch (_) { app.handleError(e, '加载失败') }
    } finally { app.hideLoading() }
  },
  switch7d() { this.setData({ timeRange: '7d' }); this.fetchAnalytics() },
  switch30d() { this.setData({ timeRange: '30d' }); this.fetchAnalytics() },
  switchAll() { this.setData({ timeRange: 'all' }); this.fetchAnalytics() }
})