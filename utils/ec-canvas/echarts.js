// ECharts 简化版本 - 用于微信小程序
// 这是一个简化的 ECharts 实现，用于演示目的
// 在实际项目中，您需要使用完整的 ec-canvas 组件

const echarts = {
  init: function(canvas, theme, opts) {
    // 创建一个模拟的图表实例
    const chart = {
      canvas: canvas,
      width: opts.width,
      height: opts.height,
      dpr: opts.devicePixelRatio,
      option: null,
      
      setOption: function(option) {
        this.option = option
        this.render()
      },
      
      render: function() {
        if (!this.canvas || !this.option) return
        
        const ctx = this.canvas.getContext('2d')
        ctx.clearRect(0, 0, this.width, this.height)
        
        // 简单的渲染逻辑
        if (this.option.series) {
          this.option.series.forEach(series => {
            if (series.type === 'line') {
              this.renderLine(ctx, series, this.option)
            } else if (series.type === 'pie') {
              this.renderPie(ctx, series, this.option)
            } else if (series.type === 'bar') {
              this.renderBar(ctx, series, this.option)
            }
          })
        }
      },
      
      renderLine: function(ctx, series, option) {
        const data = series.data || []
        const xAxis = option.xAxis || {}
        const yAxis = option.yAxis || {}
        const grid = option.grid || { left: '10%', right: '10%', top: '15%', bottom: '15%' }
        
        // 计算绘图区域
        const leftMargin = this.width * 0.1
        const rightMargin = this.width * 0.1
        const topMargin = this.height * 0.15
        const bottomMargin = this.height * 0.15
        
        const plotWidth = this.width - leftMargin - rightMargin
        const plotHeight = this.height - topMargin - bottomMargin
        
        if (data.length === 0) return
        
        // 计算数据范围
        const maxValue = Math.max(...data)
        const minValue = Math.min(...data)
        const valueRange = maxValue - minValue || 1
        
        // 绘制网格线
        ctx.strokeStyle = '#f0f0f0'
        ctx.lineWidth = 1
        for (let i = 0; i <= 5; i++) {
          const y = topMargin + (plotHeight / 5) * i
          ctx.beginPath()
          ctx.moveTo(leftMargin, y)
          ctx.lineTo(leftMargin + plotWidth, y)
          ctx.stroke()
        }
        
        // 绘制折线
        ctx.strokeStyle = series.color || (option.color && option.color[0]) || '#007aff'
        ctx.lineWidth = (series.lineStyle && series.lineStyle.width) || 2
        ctx.beginPath()
        
        data.forEach((value, index) => {
          const x = leftMargin + (plotWidth / (data.length - 1)) * index
          const y = topMargin + plotHeight - ((value - minValue) / valueRange) * plotHeight
          
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        
        ctx.stroke()
        
        // 绘制数据点
        if (series.symbol) {
          ctx.fillStyle = series.color || (option.color && option.color[0]) || '#007aff'
          data.forEach((value, index) => {
            const x = leftMargin + (plotWidth / (data.length - 1)) * index
            const y = topMargin + plotHeight - ((value - minValue) / valueRange) * plotHeight
            
            ctx.beginPath()
            ctx.arc(x, y, series.symbolSize || 3, 0, 2 * Math.PI)
            ctx.fill()
          })
        }
        
        // 绘制面积
        if (series.areaStyle) {
          ctx.fillStyle = series.color || (option.color && option.color[0]) || '#007aff'
          ctx.globalAlpha = series.areaStyle.opacity || 0.1
          ctx.beginPath()
          
          // 绘制面积路径
          data.forEach((value, index) => {
            const x = leftMargin + (plotWidth / (data.length - 1)) * index
            const y = topMargin + plotHeight - ((value - minValue) / valueRange) * plotHeight
            
            if (index === 0) {
              ctx.moveTo(x, topMargin + plotHeight)
              ctx.lineTo(x, y)
            } else {
              ctx.lineTo(x, y)
            }
          })
          
          ctx.lineTo(leftMargin + plotWidth, topMargin + plotHeight)
          ctx.closePath()
          ctx.fill()
          ctx.globalAlpha = 1
        }
      },
      
      renderPie: function(ctx, series, option) {
        const data = series.data || []
        const center = series.center || ['50%', '50%']
        const radius = series.radius || ['0%', '70%']
        const colors = option.color || ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ff2d92']
        
        if (data.length === 0) return
        
        // 计算中心点和半径
        const centerX = this.width * (parseFloat(center[0]) / 100)
        const centerY = this.height * (parseFloat(center[1]) / 100)
        const innerRadius = Math.min(this.width, this.height) * (parseFloat(radius[0]) / 100) / 2
        const outerRadius = Math.min(this.width, this.height) * (parseFloat(radius[1]) / 100) / 2
        
        // 计算总值
        const total = data.reduce((sum, item) => sum + item.value, 0)
        
        // 绘制饼图
        let currentAngle = -Math.PI / 2 // 从顶部开始
        
        data.forEach((item, index) => {
          const angle = (item.value / total) * 2 * Math.PI
          const color = colors[index % colors.length]
          
          // 绘制扇形
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.arc(centerX, centerY, outerRadius, currentAngle, currentAngle + angle)
          if (innerRadius > 0) {
            ctx.arc(centerX, centerY, innerRadius, currentAngle + angle, currentAngle, true)
          } else {
            ctx.lineTo(centerX, centerY)
          }
          ctx.closePath()
          ctx.fill()
          
          // 绘制标签
          if (series.label !== false) {
            const labelAngle = currentAngle + angle / 2
            const labelRadius = outerRadius + 20
            const labelX = centerX + Math.cos(labelAngle) * labelRadius
            const labelY = centerY + Math.sin(labelAngle) * labelRadius
            
            ctx.fillStyle = '#333'
            ctx.font = '12px Arial'
            ctx.textAlign = 'center'
            ctx.fillText(item.name, labelX, labelY)
          }
          
          currentAngle += angle
        })
      },
      
      renderBar: function(ctx, series, option) {
        const data = series.data || []
        const xAxis = option.xAxis || {}
        const yAxis = option.yAxis || {}
        const grid = option.grid || { left: '10%', right: '10%', top: '15%', bottom: '15%' }
        
        // 计算绘图区域
        const leftMargin = this.width * 0.1
        const rightMargin = this.width * 0.1
        const topMargin = this.height * 0.15
        const bottomMargin = this.height * 0.15
        
        const plotWidth = this.width - leftMargin - rightMargin
        const plotHeight = this.height - topMargin - bottomMargin
        
        if (data.length === 0) return
        
        // 计算数据范围
        const maxValue = Math.max(...data)
        const minValue = Math.min(0, Math.min(...data))
        const valueRange = maxValue - minValue || 1
        
        // 绘制柱状图
        const barWidth = plotWidth / data.length * 0.6
        const barSpacing = plotWidth / data.length * 0.4
        
        ctx.fillStyle = series.color || (option.color && option.color[0]) || '#007aff'
        
        data.forEach((value, index) => {
          const x = leftMargin + (plotWidth / data.length) * index + barSpacing / 2
          const barHeight = Math.abs(value - minValue) / valueRange * plotHeight
          const y = topMargin + plotHeight - barHeight
          
          ctx.fillRect(x, y, barWidth, barHeight)
        })
      }
    }
    
    return chart
  }
}

module.exports = echarts