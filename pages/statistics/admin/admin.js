// 管理员统计页面
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
    summary: {},
    activityStats: {},
    productStats: {},
    topUsers: [],
    dailyTrend: [],
    memberStats: [],
    
    // 图表配置
    trendChart: {
      onInit: null
    },
    activityChart: {
      onInit: null
    },
    productChart: {
      onInit: null
    }
  },

  onLoad() {
    this.checkAdminPermission()
  },

  onShow() {
    // 页面显示时刷新数据
    if (this.data.hasPermission) {
      this.loadStatistics()
    }
  },

  // 检查管理员权限
  checkAdminPermission: function() {
    var self = this;
    wx.cloud.callFunction({
      name: 'getUserInfo'
    }).then(function(userRes) {
      if (userRes.result.success && userRes.result.data.isAdmin) {
        self.setData({ hasPermission: true });
        self.initCharts();
        self.loadStatistics();
      } else {
        wx.showModal({
          title: '权限不足',
          content: '您没有访问管理员统计的权限',
          showCancel: false,
          success: function() {
            wx.navigateBack();
          }
        });
      }
    }).catch(function(error) {
      console.error('检查权限失败', error);
      wx.showToast({
        title: '权限检查失败',
        icon: 'none'
      });
      wx.navigateBack();
    });
  },

  // 初始化图表
  initCharts() {
    this.setData({
      'trendChart.onInit': this.initTrendChart.bind(this),
      'activityChart.onInit': this.initActivityChart.bind(this),
      'productChart.onInit': this.initProductChart.bind(this)
    })
  },

  // 初始化趋势图表
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

  // 初始化商品统计图表
  initProductChart(canvas, width, height, dpr) {
    const chart = echarts.init(canvas, null, {
      width: width,
      height: height,
      devicePixelRatio: dpr
    })
    canvas.setChart(chart)
    this.productChartInstance = chart
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
  async loadStatistics() {
    this.setData({ loading: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'statisticsManager',
        data: {
          action: 'getAdminStats',
          data: {
            timeRange: this.data.timeRange
          }
        }
      })

      if (res.result && res.result.success) {
        let data = res.result.data
        
        // 处理用户头像URL
        if (data.topUsers && Array.isArray(data.topUsers)) {
          data.topUsers = await imageUtils.processUsersAvatars(data.topUsers)
        }
        
        if (data.teamMembers && Array.isArray(data.teamMembers)) {
          data.teamMembers = await imageUtils.processUsersAvatars(data.teamMembers)
        }
        
        this.setData({
          summary: data.summary || {},
          topUsers: data.topUsers || [],
          teamMembers: data.teamMembers || [],
          activityStats: data.activityStats || {},
          exchangeStats: data.exchangeStats || {}
        })
        
        // 更新图表
        this.updateCharts()
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 更新趋势图表
  updateTrendChart(trendData) {
    if (!this.trendChartInstance || !trendData.length) return

    const dates = trendData.map(item => {
      const date = new Date(item.date)
      return `${date.getMonth() + 1}/${date.getDate()}`
    })
    const issued = trendData.map(item => item.issued)
    const spent = trendData.map(item => item.spent)

    const option = {
      color: ['#007aff', '#ff9500'],
      legend: {
        data: ['积分发放', '积分消费'],
        bottom: 0,
        textStyle: {
          fontSize: 10
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        top: '10%',
        bottom: '20%'
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
      series: [
        {
          name: '积分发放',
          data: issued,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            width: 2
          }
        },
        {
          name: '积分消费',
          data: spent,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            width: 2
          }
        }
      ]
    }

    this.trendChartInstance.setOption(option)
  },

  // 更新活动类型图表
  updateActivityChart(activityData) {
    if (!this.activityChartInstance || !Object.keys(activityData).length) return

    const data = Object.entries(activityData).map(([name, stats]) => ({
      name,
      value: stats.points
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

  // 更新商品统计图表
  updateProductChart(productData) {
    if (!this.productChartInstance || !Object.keys(productData).length) return

    const data = Object.entries(productData)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .map(([productId, stats]) => stats.count)

    const categories = Object.entries(productData)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .map(([productId, stats]) => `商品${productId.slice(-4)}`)

    const option = {
      color: ['#007aff'],
      grid: {
        left: '15%',
        right: '10%',
        top: '10%',
        bottom: '10%'
      },
      xAxis: {
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
      yAxis: {
        type: 'category',
        data: categories,
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
      series: [{
        data: data,
        type: 'bar',
        barWidth: '60%'
      }]
    }

    this.productChartInstance.setOption(option)
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadStatistics().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 跳转到成员管理
  goToMemberManagement() {
    wx.navigateTo({
      url: '/pages/admin/members/members'
    })
  },

  // 跳转到积分审核
  goToAudit() {
    wx.navigateTo({
      url: '/pages/admin/audit/audit'
    })
  },

  // 跳转到兑换管理
  goToExchangeManagement() {
    wx.navigateTo({
      url: '/pages/admin/exchange/exchange'
    })
  },
  
  // 跳转到队服发放管理
  goToApparelManagement() {
    wx.navigateTo({
      url: '/pages/admin/apparel/apparel'
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

  // 计算活跃率
  getActiveRate() {
    if (!this.data.summary.totalUsers) return 0
    return Math.round((this.data.summary.activeUsers / this.data.summary.totalUsers) * 100)
  }
})
