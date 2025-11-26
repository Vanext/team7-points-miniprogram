// pages/athlete-records/athlete-records.js
const app = getApp()

Page({
  data: {
    userInfo: null,
    loading: true,
    error: null,
    records: [],
    totalPoints: 0,
    totalRaces: 0,
    yearlyStats: {},
    selectedYear: new Date().getFullYear(),
    availableYears: []
  },

  onLoad(options) {
    const { openid, nickName } = options;
    if (openid) {
      this.setData({
        userInfo: {
          openid: openid,
          nickName: decodeURIComponent(nickName || '未知用户')
        }
      });
      this.loadAthleteRecords();
    } else {
      this.setData({
        error: '用户信息不完整',
        loading: false
      });
    }
  },

  // 加载运动员记录
  loadAthleteRecords() {
    this.setData({ loading: true, error: null });

    // 模拟数据 - 实际项目中应该调用云函数获取真实数据
    const mockRecords = this.generateMockRecords();
    
    setTimeout(() => {
      this.processRecordsData(mockRecords);
      this.setData({ loading: false });
    }, 1000);
  },

  // 生成模拟记录数据
  generateMockRecords() {
    const races = [
      {
        id: 1,
        name: '2025年中国·威海超级铁人三项系列赛',
        date: '2025-09-27',
        type: '超级铁三赛',
        time: '05:57:41',
        points: 101.28,
        year: 2025,
        category: 'triathlon'
      },
      {
        id: 2,
        name: '2025常熟尚湖铁人三项赛',
        date: '2025-06-15',
        type: '标铁(51.5km)',
        time: '02:02:32',
        points: 101.11,
        year: 2025,
        category: 'triathlon'
      },
      {
        id: 3,
        name: '2025长三角国际铁人三项赛',
        date: '2025-05-18',
        type: '标铁(51.5km)',
        time: '02:02:53',
        points: 100.52,
        year: 2025,
        category: 'triathlon'
      },
      {
        id: 4,
        name: '2024 Challenge Xiamen 厦门铁人三项公开赛',
        date: '2024-11-10',
        type: '半程大铁(113km)',
        time: '04:18:48',
        points: 100.52,
        year: 2024,
        category: 'triathlon'
      },
      {
        id: 5,
        name: '2024千岛湖大铁铁人三项赛',
        date: '2024-10-27',
        type: '半程大铁(113km)',
        time: '04:23:00',
        points: 101.11,
        year: 2024,
        category: 'triathlon'
      },
      {
        id: 6,
        name: '2024上海湾区铁人三项赛',
        date: '2024-10-20',
        type: '标铁(51.5km)',
        time: '01:56:26',
        points: 98.55,
        year: 2024,
        category: 'triathlon'
      }
    ];

    return races;
  },

  // 处理记录数据
  processRecordsData(records) {
    // 计算总统计
    const totalPoints = records.reduce((sum, record) => sum + record.points, 0);
    const totalRaces = records.length;

    // 按年份分组
    const yearlyStats = {};
    const availableYears = [];

    records.forEach(record => {
      const year = record.year;
      if (!yearlyStats[year]) {
        yearlyStats[year] = {
          races: [],
          totalPoints: 0,
          totalRaces: 0
        };
        availableYears.push(year);
      }
      yearlyStats[year].races.push(record);
      yearlyStats[year].totalPoints += record.points;
      yearlyStats[year].totalRaces += 1;
    });

    // 按年份排序（最新的在前）
    availableYears.sort((a, b) => b - a);

    this.setData({
      records: records,
      totalPoints: totalPoints.toFixed(2),
      totalRaces: totalRaces,
      yearlyStats: yearlyStats,
      availableYears: availableYears,
      selectedYear: availableYears[0] || new Date().getFullYear()
    });
  },

  // 切换年份
  onYearChange(e) {
    const year = parseInt(e.detail.value);
    this.setData({ selectedYear: year });
  },

  // 获取当前年份的记录
  getCurrentYearRecords() {
    const { yearlyStats, selectedYear } = this.data;
    return yearlyStats[selectedYear] || { races: [], totalPoints: 0, totalRaces: 0 };
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadAthleteRecords();
    setTimeout(() => {
      wx.stopPullDownRefresh();
    }, 1500);
  },

  // 返回上一页
  onBack() {
    wx.navigateBack();
  },

  // 分享记录
  onShareRecord() {
    const { userInfo, totalPoints, totalRaces } = this.data;
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 页面分享
  onShareAppMessage() {
    const { userInfo, totalPoints, totalRaces } = this.data;
    return {
      title: `${userInfo.nickName}的铁三战绩：${totalRaces}场比赛，总积分${totalPoints}`,
      path: `/pages/athlete-records/athlete-records?openid=${userInfo.openid}&nickName=${encodeURIComponent(userInfo.nickName)}`,
      imageUrl: '/images/share-athlete-records.png'
    };
  }
});