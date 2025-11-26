const app = getApp()
const imageUtils = require('../../utils/imageUtils.js')

Page({
  data: {
    userId: '',
    userInfo: null,
    participationHistory: [],
    loading: true,
    error: null,
    isFollowing: false,
    totalParticipations: 0,
    totalPoints: 0,
    currentYear: new Date().getFullYear(),
    yearlyStats: {}
  },

  onLoad(options) {
    const { userId, nickName } = options;
    if (!userId) {
      wx.showToast({
        title: '参数错误',
        icon: 'error'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
      return;
    }

    this.setData({
      userId: userId,
      userInfo: {
        nickName: decodeURIComponent(nickName || '未知用户')
      }
    });

    this.loadUserProfile();
  },

  // 加载用户详情数据
  async loadUserProfile() {
    try {
      this.setData({ loading: true, error: null });

      // 调用云函数获取用户详细信息和参赛历史
      const result = await wx.cloud.callFunction({
        name: 'getUserProfile',
        data: {
          userId: this.data.userId
        }
      });

      if (result.result.success) {
        const { userInfo, participationHistory, yearlyStats } = result.result.data;
        
        // 处理用户头像URL以确保跨设备显示
        let processedUserInfo = userInfo
        if (userInfo && userInfo.avatarUrl) {
          processedUserInfo = {
            ...userInfo,
            avatarUrl: await imageUtils.processAvatarUrl(userInfo.avatarUrl)
          }
        }
        
        this.setData({
          userInfo: processedUserInfo,
          participationHistory: participationHistory || [],
          yearlyStats: yearlyStats || {},
          totalParticipations: participationHistory ? participationHistory.length : 0,
          totalPoints: userInfo.totalPoints || 0,
          loading: false
        });

        // 检查是否已关注该用户
        this.checkFollowStatus();
      } else {
        throw new Error(result.result.message || '获取用户信息失败');
      }
    } catch (error) {
      console.error('加载用户详情失败:', error);
      this.setData({
        error: '加载失败，请稍后重试',
        loading: false
      });
    }
  },

  // 检查关注状态
  async checkFollowStatus() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'checkFollowStatus',
        data: {
          targetUserId: this.data.userId
        }
      });

      if (result.result.success) {
        this.setData({
          isFollowing: result.result.isFollowing
        });
      }
    } catch (error) {
      console.error('检查关注状态失败:', error);
    }
  },

  // 切换关注状态
  async toggleFollow() {
    try {
      const action = this.data.isFollowing ? 'unfollow' : 'follow';
      
      const result = await wx.cloud.callFunction({
        name: 'toggleFollow',
        data: {
          targetUserId: this.data.userId,
          action: action
        }
      });

      if (result.result.success) {
        this.setData({
          isFollowing: !this.data.isFollowing
        });
        
        wx.showToast({
          title: this.data.isFollowing ? '已关注' : '已取消关注',
          icon: 'success'
        });
      } else {
        throw new Error(result.result.message);
      }
    } catch (error) {
      console.error('关注操作失败:', error);
      wx.showToast({
        title: '操作失败',
        icon: 'error'
      });
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadUserProfile().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 重试加载
  retryLoad() {
    this.loadUserProfile();
  },

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    // 假设时间格式为 HH:MM:SS 或类似格式
    return timeStr;
  },

  // 获取比赛类型标签样式
  getEventTypeClass(eventType) {
    const typeMap = {
      '铁人三项': 'triathlon',
      '游泳': 'swimming',
      '跑步': 'running',
      '骑行': 'cycling',
      '其他': 'other'
    };
    return typeMap[eventType] || 'other';
  },

  // 分享页面
  onShareAppMessage() {
    return {
      title: `${this.data.userInfo.nickName}的运动档案`,
      path: `/pages/athlete-profile/athlete-profile?userId=${this.data.userId}&nickName=${encodeURIComponent(this.data.userInfo.nickName)}`
    };
  }
});