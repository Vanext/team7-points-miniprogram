// pages/camp/home/home.js
const app = getApp()
Page({
  data: {
    // 训练营数据
    campData: null,
    userProgress: null,
    countdown: null,
    
    // UI状态
    loading: true,
    error: null,
    currentWeek: 1,
    expandedWeeks: {}, // 记录展开的周数
    
    // 权限控制
    hasAccess: false,
    userRole: '',
    
    // 模态框状态
    showContactModal: false,
    campSubtitle: '',
    daysToTargetRace: 0,
    countdownDigits: [],
    eventLogoUrl: '/images/default-image.png',
    heroUrl: '/images/default-image.png',
    currentWeekData: null,
    weeklyHours: 0,
    weeklyMinutes: 0
  },

  onLoad: function (options) {
    const approvedHint = options && (options.approved === '1' || options.approved === 1)
    if (approvedHint) {
      this.setData({ hasAccess: true, error: null })
      this.loadCampData()
    } else {
      this.checkUserAccess()
    }
  },

  onShow: function () {
    if (this.data.hasAccess) {
      this.loadCampData()
    }
    wx.showShareMenu({ withShareTicket: true })
  },

  // 检查用户访问权限
  async checkUserAccess() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      let approved = false
      try {
        const r = await wx.cloud.callFunction({ name: 'campApplication', config: { env: cloudEnv }, data: { action: 'getMyStatus' } })
        approved = !!(r.result && r.result.status === 'approved')
      } catch (_) { approved = false }

      const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo || null
      const hasAccess = !!approved

      this.setData({
        userRole: 'user',
        hasAccess,
        loading: false,
        error: hasAccess ? null : '仅训练营申请通过后可访问'
      })
    } catch (error) {
      console.error('检查权限失败', error)
      this.setData({
        loading: false,
        error: '权限检查失败',
        hasAccess: false
      })
    }
  },

  async reloadOrLogin() {
    try {
      const u = wx.getStorageSync('userInfo')
      if (!u) {
        await app.login()
      }
      const userInfo = wx.getStorageSync('userInfo') || app.globalData.userInfo || null
      if (!userInfo) {
        this.setData({ error: '请先登录', hasAccess: false })
        return
      }
      this.setData({
        userRole: userInfo.isOfficialMember ? 'official' : 'user',
        hasAccess: userInfo.isOfficialMember === true,
        error: null
      })
      if (this.data.hasAccess) {
        await this.loadCampData()
      } else {
        this.setData({ error: '仅正式会员可访问训练营功能' })
      }
    } catch (_) {
      this.setData({ error: '登录失败，请重试' })
    }
  },

  // 加载训练营数据
  async loadCampData() {
    this.setData({ loading: true, error: null })
    
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const result = await wx.cloud.callFunction({
        name: 'getCampData',
        data: { camp_id: 'camp_hengqin_2026' },
        config: { env: cloudEnv }
      })

      if (result.result.success) {
        const { campPlan, userProgress, countdown } = result.result
        
        this.setData({
          campData: campPlan,
          userProgress: userProgress,
          countdown: countdown,
          currentWeek: userProgress.current_week,
          loading: false,
          error: null
        })

        const subtitle = (campPlan.description || '').replace('专业训练计划', '通用训练计划') || 'IRONMAN 70.3 横琴通用训练计划'
        const targetDate = campPlan.race_date ? new Date(String(campPlan.race_date).replace(/-/g, '/')) : new Date('2026-03-15T00:00:00+08:00')
        const now = new Date()
        const daysToTargetRace = Math.max(0, Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24)))
        const countdownDigits = String(daysToTargetRace).split('')
        let eventLogoUrl = campPlan.logo_url || '/images/default-image.png'
        let heroUrl = campPlan.hero_url || '/images/default-image.png'
        // 将云文件ID转换为可访问URL
        try {
          const fileIds = []
          if (eventLogoUrl && eventLogoUrl.indexOf('cloud://') === 0) fileIds.push(eventLogoUrl)
          if (heroUrl && heroUrl.indexOf('cloud://') === 0) fileIds.push(heroUrl)
          if (fileIds.length) {
            const r = await wx.cloud.getTempFileURL({ fileList: fileIds })
            (r.fileList || []).forEach(it => {
              if (it.fileID === eventLogoUrl && it.tempFileURL) eventLogoUrl = it.tempFileURL
              if (it.fileID === heroUrl && it.tempFileURL) heroUrl = it.tempFileURL
            })
          }
        } catch (_) {}
        const unlockedWeek = (userProgress && userProgress.unlocked_week) ? userProgress.unlocked_week : userProgress.current_week
        this.setData({ campSubtitle: subtitle, daysToTargetRace, countdownDigits, eventLogoUrl, heroUrl, unlockedWeek })
        this.updateCurrentWeekData()

        // 自动展开当前周
        this.setData({
          [`expandedWeeks.${userProgress.current_week}`]: true
        })
      } else {
        this.setData({
          loading: false,
          error: result.result.message || '加载失败'
        })
      }
    } catch (error) {
      console.error('加载训练营数据失败', error)
      this.setData({
        loading: false,
        error: '网络错误，请重试'
      })
    }
  },

  // 切换周数展开状态
  toggleWeek(e) {
    const week = e.currentTarget.dataset.week
    const key = `expandedWeeks.${week}`
    
    this.setData({
      [key]: !this.data.expandedWeeks[week]
    })
  },

  // 周导航
  prevWeek() {
    const min = 1
    const max = (this.data.unlockedWeek || ((this.data.campData && this.data.campData.total_weeks) || 13))
    const w = Math.max(min, this.data.currentWeek - 1)
    this.setData({ currentWeek: w })
    this.updateCurrentWeekData()
    this.setData({ [`expandedWeeks.${w}`]: true })
  },
  nextWeek() {
    const max = (this.data.unlockedWeek || ((this.data.campData && this.data.campData.total_weeks) || 13))
    const w = Math.min(max, this.data.currentWeek + 1)
    this.setData({ currentWeek: w })
    this.updateCurrentWeekData()
    this.setData({ [`expandedWeeks.${w}`]: true })
  },

  updateCurrentWeekData() {
    const weeks = (this.data.campData && this.data.campData.weeks) || []
    const w = this.data.currentWeek
    const wd = weeks.find(x => x.week_num === w) || {}
    const minutes = wd.total_planned_minutes || wd.planned_minutes || 0
    const weeklyHours = minutes ? Math.round((minutes / 60) * 10) / 10 : 0
    const raw = Array.isArray(wd.schedule) ? wd.schedule : []
    const displaySchedule = raw.map(it => {
      const t = (it && it.title) ? it.title : (it && it.activity) ? it.activity : ''
      const c = (it && it.content) ? it.content : ''
      const d = (typeof it.duration === 'number') ? it.duration : (it && it.duration) ? Number(it.duration) || 0 : 0
      const dayName = this.formatWeekday(it && it.day)
      const type = (it && it.type) || ''
      const s = String(type).toLowerCase()
      const typeLabel = s === 'swim' ? 'Swim' : s === 'bike' ? 'Bike' : s === 'run' ? 'Run' : s === 'brick' ? 'Brick' : s === 'strength' ? 'Strength' : s === 'race' ? 'Race' : ''
      const typeIcon = s === 'swim' ? '🏊\u200d♂️' : s === 'bike' ? '🚴\u200d♂️' : s === 'run' ? '🏃\u200d♂️' : s === 'brick' ? '🔁' : s === 'strength' ? '🏋️' : s === 'race' ? '🏁' : '✅'
      return { dayName, titleSafe: t, guidanceSafe: c, duration: d, type, typeLabel, typeIcon }
    })
    const isLocked = !!(this.data.unlockedWeek && w > this.data.unlockedWeek)
    this.setData({ currentWeekData: wd, weeklyHours, weeklyMinutes: minutes, displaySchedule, isLocked })
  },

  // 上传周总结
  uploadWeekSummary(e) {
    const week = e.currentTarget.dataset.week
    const weekData = this.data.campData.weeks.find(w => w.week_num === week)
    
    if (!weekData) return
    if (this.data.unlockedWeek && week > this.data.unlockedWeek) {
      wx.showToast({ title: '请先完成并审核上一周打卡', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: `/pages/camp/checkin/checkin?week=${week}&planned=${weekData.total_planned_minutes || weekData.planned_minutes || 0}&camp_id=${this.data.campData.camp_id}`
    })
  },

  navigateToCourse() {
    wx.navigateTo({ url: '/pages/camp/course/course' })
  },

  // 查看排行榜
  viewLeaderboard() {
    wx.navigateTo({
      url: '/pages/camp/leaderboard/leaderboard'
    })
  },

  // 显示联系教练模态框
  showContactCoach() {
    this.setData({ showContactModal: true })
  },

  // 隐藏联系教练模态框
  hideContactCoach() {
    this.setData({ showContactModal: false })
  },

  // 联系客服
  contactCoach() {
    this.hideContactCoach()
    
    // 跳转到消息页面或打开客服会话
    wx.navigateTo({
      url: '/pages/messages/messages'
    })
  },

  // 格式化日期
  formatDate(dateStr) {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  },

  // 格式化倒计时
  formatCountdown(days) {
    if (days <= 0) return '比赛已开始'
    if (days === 1) return '明天比赛'
    if (days < 7) return `${days}天后比赛`
    if (days < 30) return `${Math.floor(days / 7)}周后比赛`
    return `${Math.floor(days / 30)}个月后比赛`
  },

  // 获取阶段颜色
  getPhaseColor(phase) {
    const colors = {
      '基础期': '#4CAF50',
      '建立期': '#FF9800',
      '巩固期': '#2196F3',
      '调整期': '#9C27B0',
      '比赛周': '#F44336'
    }
    return colors[phase] || '#757575'
  },

  // 获取活动类型图标
  getActivityIcon(type) {
    const t = (type || '').toString().toLowerCase()
    const icons = {
      'swim': '🏊‍♂️',
      'bike': '🚴‍♂️',
      'run': '🏃‍♂️',
      'rest': '🧘‍♂️',
      'brick': '🔁',
      'strength': '🏋️',
      'race': '🏁'
    }
    return icons[t] || '✅'
  },

  formatTypeLabel(t) {
    const s = (t || '').toString().toLowerCase()
    if (s === 'swim') return 'Swim'
    if (s === 'bike') return 'Bike'
    if (s === 'run') return 'Run'
    if (s === 'brick') return 'Brick'
    if (s === 'strength') return 'Strength'
    if (s === 'race') return 'Race'
    return ''
  },

  formatWeekday(d) {
    const map = { 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六', 7: '周日' }
    return map[d] || ''
  },

  getDailyGuidance(day, phase) {
    const t = ((day && day.type) || '').toString().toLowerCase()
    const d = day && day.duration ? day.duration : 0
    const zone = {
      '基础期': { hr: 'Z2 为主，含少量Z3', if: 'IF 0.65-0.75' },
      '建立期': { hr: 'Z3-Z4 结构化为主', if: 'IF 0.75-0.85' },
      '巩固期': { hr: '维持强度，减少总量', if: 'IF 0.70-0.80' },
      '调整期': { hr: 'Z2 为主，短促Z3唤醒', if: 'IF 0.65-0.75' },
      '比赛周': { hr: '轻松维持感觉，少量配速', if: 'IF 0.60-0.70' }
    }[phase] || { hr: 'Z2-Z3', if: 'IF 0.70-0.80' }
    if (t === 'swim') {
      return `游泳：${zone.hr}，主练${Math.max(20, Math.floor(d/2))}分钟技术与配速控制；每${Math.max(300, d*6)}米抬头校正方向。`
    }
    if (t === 'bike') {
      return `骑行：${zone.if}，踏频85-95rpm；每${Math.max(20, Math.floor(d/3))}分钟补给碳水与电解质，桥面/转角提前降档。`
    }
    if (t === 'run') {
      return `跑步：${zone.hr}，前半程舒适偏快，后半程逐步加速；每${Math.max(15, Math.floor(d/4))}分钟少量补水。`
    }
    if (t === 'brick') {
      return `砖式：${zone.if}；T1/T2 过渡控制在3-5分钟，关注心率回落与起跑前2km配速节制。`
    }
    if (t === 'rest') {
      return `恢复：轻度活动与拉伸，泡沫轴/按摩${Math.min(20, Math.floor(d/2))}分钟，保证睡眠与营养。`
    }
    return `训练：遵循阶段目标（${zone.hr}/${zone.if}），控制训练量并重视恢复。`
  },

  // 下拉刷新
  async onPullDownRefresh() {
    if (this.data.hasAccess) {
      await this.loadCampData()
    }
    wx.stopPullDownRefresh()
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: 'Team 7 积分小程序｜首页',
      path: '/pages/home/home?from=camp_share',
      imageUrl: '/images/default-image.png'
    }
  }
  ,
  navigateToTrainingAssistant() {
    wx.navigateTo({ url: '/pages/training-assistant/training-assistant' })
  }
})
