// 个人统计页面
const echarts = require('../../../utils/ec-canvas/echarts')
const imageUtils = require('../../../utils/imageUtils.js')

Page({
  data: {
    loading: true,
    timeRange: '30d',
    timeRanges: [
      { value: '7d', label: '近7天' },
      { value: '30d', label: '近30天' },
      { value: '90d', label: '近90天' },
      { value: '1y', label: '近1年' }
    ],
    currentTimeRangeLabel: '近30天',
    user: {},
    summary: {},
    pointsTrend: [],
    activityTypes: {},
    exchangeStats: {},
    
    // 图表配置
    trendChart: {
      onInit: null
    },
    activityChart: {
      onInit: null
    }
  },

  onLoad() {
    this.initCharts()
    this.loadStatistics()
  },

  onShow() {
    // 页面显示时刷新数据
    this.loadStatistics()
  },

  // 初始化图表
  initCharts() {
    this.setData({
      'trendChart.onInit': this.initTrendChart.bind(this),
      'activityChart.onInit': this.initActivityChart.bind(this)
    })
  },

  // 初始化积分趋势图表
  initTrendChart(canvas, width, height, dpr) {
    const chart = echarts.init(canvas, null, {
      width: width,
      height: height,
      devicePixelRatio: dpr
    })
    canvas.setChart(chart)
    this.trendChartInstance = chart
    return chart
  },

  // 初始化活动类型图表
  initActivityChart(canvas, width, height, dpr) {
    const chart = echarts.init(canvas, null, {
      width: width,
      height: height,
      devicePixelRatio: dpr
    })
    canvas.setChart(chart)
    this.activityChartInstance = chart
    return chart
  },

  // 切换时间范围
  onTimeRangeChange(e) {
    const timeRange = e.currentTarget.dataset.range
    const selectedRange = this.data.timeRanges.find(item => item.value === timeRange)
    const currentTimeRangeLabel = selectedRange ? selectedRange.label : '近30天'
    this.setData({ 
      timeRange,
      currentTimeRangeLabel
    })
    this.loadStatistics()
  },

  // 加载统计数据
  loadStatistics: function() {
    var self = this;
    self.setData({ loading: true });

    // 获取个人统计数据
    wx.cloud.callFunction({
      name: 'statisticsManager',
      data: {
        action: 'getPersonalStats',
        data: { timeRange: self.data.timeRange }
      }
    }).then(async function(statsRes) {
      if (!statsRes.result.success) {
        throw new Error(statsRes.result.message || '加载失败');
      }

      var user = statsRes.result.data.user;
      var summary = statsRes.result.data.summary;
      var pointsTrend = statsRes.result.data.pointsTrend;
      var activityTypes = statsRes.result.data.activityTypes;

      // 处理用户头像URL以确保跨设备显示
      if (user && user.avatarUrl) {
        user.avatarUrl = await imageUtils.processAvatarUrl(user.avatarUrl);
      }

      // 获取兑换统计
      return wx.cloud.callFunction({
        name: 'statisticsManager',
        data: {
          action: 'getExchangeStats',
          data: { timeRange: self.data.timeRange }
        }
      }).then(function(exchangeRes) {
        var exchangeStats = exchangeRes.result.success ? exchangeRes.result.data : {};

        // 更新当前时间范围标签
        var selectedRange = self.data.timeRanges.find(function(item) {
          return item.value === self.data.timeRange;
        });
        var currentTimeRangeLabel = selectedRange ? selectedRange.label : '近30天';

        self.setData({
          user: user,
          summary: summary,
          pointsTrend: pointsTrend,
          activityTypes: activityTypes,
          exchangeStats: exchangeStats,
          currentTimeRangeLabel: currentTimeRangeLabel,
          loading: false
        });

        // 更新图表
        self.updateTrendChart(pointsTrend);
        self.updateActivityChart(activityTypes);
      });
    }).catch(function(error) {
      console.error('加载统计数据失败', error);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      self.setData({ loading: false });
    });
  },

  // 更新积分趋势图表
  updateTrendChart(trendData) {
    if (!this.trendChartInstance || !trendData.length) return

    const dates = trendData.map(item => {
      const date = new Date(item.date)
      return `${date.getMonth() + 1}/${date.getDate()}`
    })
    const points = trendData.map(item => item.points)

    const option = {
      color: ['#007aff'],
      grid: {
        left: '10%',
        right: '10%',
        top: '15%',
        bottom: '15%'
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        axisLabel: {
          color: '#666',
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        axisLine: {
          lineStyle: {
            color: '#ccc'
          }
        },
        axisLabel: {
          color: '#666',
          fontSize: 10
        },
        splitLine: {
          lineStyle: {
            color: '#f0f0f0'
          }
        }
      },
      series: [{
        data: points,
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 2
        },
        areaStyle: {
          opacity: 0.1
        }
      }]
    }

    this.trendChartInstance.setOption(option)
  },

  // 更新活动类型图表
  updateActivityChart(activityData) {
    if (!this.activityChartInstance || !Object.keys(activityData).length) return

    const data = Object.entries(activityData).map(([name, points]) => ({
      name,
      value: points
    }))

    const option = {
      color: ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ff2d92'],
      series: [{
        type: 'pie',
        radius: ['30%', '70%'],
        center: ['50%', '50%'],
        data: data,
        label: {
          fontSize: 10,
          color: '#333'
        },
        labelLine: {
          length: 10,
          length2: 5
        }
      }]
    }

    this.activityChartInstance.setOption(option)
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadStatistics().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 跳转到积分详情
  goToPointDetail() {
    wx.navigateTo({
      url: '/pages/point-detail/point-detail'
    })
  },

  // 跳转到兑换历史
  goToExchangeHistory() {
    wx.navigateTo({
      url: '/pages/exchange-history/exchange-history'
    })
  },

  // 格式化数字
  formatNumber(num) {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + 'w'
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k'
    }
    return num.toString()
  },

  // 获取活动类型图标
  getActivityIcon(type) {
    const icons = {
      '学习': '📚',
      '运动': '🏃',
      '志愿': '🤝',
      '创新': '💡',
      '社交': '👥',
      '其他': '⭐'
    }
    return icons[type] || '⭐'
  },

  // 获取兑换状态文本
  getExchangeStatusText(status) {
    const statusMap = {
      'pending': '待处理',
      'shipped': '已发货',
      'completed': '已完成',
      'cancelled': '已取消'
    }
    return statusMap[status] || status
  }
})