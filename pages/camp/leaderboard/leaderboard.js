// pages/camp/leaderboard/leaderboard.js
Page({
  data: {
    loading: true,
    error: '',
    hasAccess: false,
    activeTab: 'camp', // 默认显示训练营排行榜
    campInfo: null,
    leaderboard: [],
    currentUserRank: null,
    trainingLeaderboard: [],
    currentTrainingUserRank: null
  },

  onLoad(options) {
    this.loadLeaderboard();
  },

  async loadLeaderboard() {
    this.setData({ loading: true, error: '' });
    
    try {
      // 直接获取训练营排行榜数据（云函数内已做会员权限校验）
      const result = await wx.cloud.callFunction({
        name: 'getCampLeaderboard',
        data: {
          camp_id: 'camp_hengqin_2026',
          limit: 50
        }
      });
      
      if (result.result && result.result.success) {
        const { campInfo, leaderboard, currentUserRank } = result.result.data;
        this.setData({
          loading: false,
          hasAccess: true,
          campInfo,
          leaderboard,
          currentUserRank
        });
        // 同时加载训练时长排行榜数据
        this.loadTrainingLeaderboard();
      } else {
        // 非正式会员或其他错误
        this.setData({
          loading: false,
          hasAccess: false,
          error: (result.result && result.result.message) || '获取排行榜数据失败，请稍后重试'
        });
      }
    } catch (err) {
      console.error('获取训练营排行榜失败:', err);
      this.setData({
        loading: false,
        error: '获取排行榜数据失败，请稍后重试'
      });
    }
  },

  // 加载训练时长排行榜
  async loadTrainingLeaderboard() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'getTrainingLeaderboard'
      });
      
      if (result.result.success) {
        const { leaderboard, currentUserRank } = result.result.data;
        
        this.setData({
          trainingLeaderboard: leaderboard,
          currentTrainingUserRank: currentUserRank
        });
      }
    } catch (err) {
      console.error('获取训练时长排行榜失败:', err);
      // 不显示错误，因为这是次要功能
    }
  },

  // 切换Tab
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // 格式化排名显示
  formatRank(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return rank;
  },

  // 获取排名颜色样式
  getRankColor(rank) {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#666';
  },

  // 获取排名样式类
  getRankStyle(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  },

  // 获取训练营徽章图标
  getBadgeIcon(weeksCompleted, totalWeeks) {
    const completionRate = weeksCompleted / totalWeeks;
    if (completionRate >= 0.8) return '🏆';
    if (completionRate >= 0.5) return '⭐';
    return '💪';
  },

  // 获取训练时长徽章图标
  getTrainingBadgeIcon(hours) {
    if (hours >= 100) return '🏅';
    if (hours >= 50) return '🏆';
    if (hours >= 20) return '⭐';
    return '💪';
  },

  // 格式化完成率
  formatCompletionRate(rate) {
    return Math.round(rate);
  },

  // 重新加载
  onRetry() {
    this.loadLeaderboard();
  },
  
  // 下拉刷新
  async onPullDownRefresh() {
    if (this.data.hasAccess) {
      await this.loadLeaderboard();
    }
    wx.stopPullDownRefresh();
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: `IRONMAN 70.3 训练营排行榜 - ${this.data.campInfo?.name || '专业训练计划'}`,
      path: '/pages/camp/leaderboard/leaderboard',
      imageUrl: '/images/leaderboard-hero.jpg'
    };
  }
})
