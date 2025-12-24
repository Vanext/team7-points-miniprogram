// pages/tools/tools.js - 铁人工具
Page({
  data: {
    // 分页相关
    currentTab: 'tire_pressure',
    
    // 输入参数
    riderWeight: 70,
    selectedBikeType: 0,
    selectedBikeStyle: 0,
    selectedSurfaceType: 0,
    selectedWetCondition: 0,
    selectedTireWidth: 0,
    
    // 选项数据 - 轮圈类型
    bikeTypes: [
      { value: 'hooked', name: 'Hooked轮圈', description: '传统有钩轮圈，兼容性好' },
      { value: 'hookless', name: 'Hookless轮圈', description: '无钩轮圈，更轻更空气动力学' }
    ],
    
    // 车型选项
    bikeStyles: [
      { value: 'road', name: '公路车', description: '前后轮胎压不同，优化操控性' },
      { value: 'triathlon', name: '铁三车', description: '前后轮胎压相同，优化空气动力学' }
    ],
    
    surfaceTypes: [
      { value: 'smooth', name: '平整路面', description: '优质柏油路、水泥路' },
      { value: 'rough', name: '粗糙路面', description: '老旧路面、轻微颠簸路段' }
    ],
    
    wetConditions: [
      { value: 'dry', name: '干燥', description: '路面干燥，抓地力良好' },
      { value: 'wet', name: '湿滑', description: '路面潮湿，需要更好的抓地力' }
    ],
    
    tireWidths: [
      { value: 23, name: '23mm', description: '传统竞赛胎' },
      { value: 25, name: '25mm', description: '现代标准公路胎' },
      { value: 28, name: '28mm', description: '舒适性公路胎' },
      { value: 30, name: '30mm', description: '宽体舒适胎' },
      { value: 32, name: '32mm', description: '超宽公路胎' }
    ],

    // 车胎推荐数据
    tireTableHeaders: [
      { key: 'brand', label: '品牌', subLabel: '', width: '180rpx', sortable: false },
      { key: 'model', label: '型号', subLabel: '', width: '300rpx', sortable: false },
      { key: 'year', label: '年份', subLabel: '', width: '100rpx', sortable: true },
      { key: 'type', label: '类型', subLabel: '', width: '140rpx', sortable: false },
      { key: 'width', label: '胎宽', subLabel: '标称/实测(mm)', width: '200rpx', sortable: false },
      { key: 'weight', label: '重量', subLabel: '标称/实测(g)', width: '200rpx', sortable: true },
      { key: 'rollingResistance', label: '滚阻', subLabel: 'Watts', width: '140rpx', sortable: true },
      { key: 'punctureProtection', label: '防刺', subLabel: '正面(分)', width: '200rpx', sortable: true },
      { key: 'grip', label: '抓地力', subLabel: '平均(分)', width: '220rpx', sortable: true },
      { key: 'thickness', label: '胎厚', subLabel: '正面(mm)', width: '200rpx', sortable: false },
      { key: 'price', label: '价格', subLabel: '等级', width: '160rpx', sortable: true }
    ],
    tireRecommendations: [
      { brand: 'Vittoria', model: 'Corsa Pro Speed TLR 28', year: '2024', type: 'TLR', width: '28 / 28', weight: '250 / 240', rollingResistance: '6.7', punctureProtection: '25', grip: '72', thickness: '1.3', price: 'High+' },
      { brand: 'Continental', model: 'Grand Prix 5000 TT TR 28', year: '2023', type: 'TLR', width: '28 / 29', weight: '245 / 250', rollingResistance: '8.3', punctureProtection: '33', grip: '66', thickness: '1.9', price: 'High+' },
      { brand: 'Continental', model: 'Grand Prix 5000 S TR 28', year: '2023', type: 'TLR', width: '28 / 29', weight: '280 / 265', rollingResistance: '9.7', punctureProtection: '34', grip: '70', thickness: '2.1', price: 'High+' },
      { brand: 'Continental', model: 'Grand Prix 5000 S TR 25', year: '2021', type: 'TLR', width: '25 / 26', weight: '250 / 255', rollingResistance: '10.1', punctureProtection: '36', grip: '66', thickness: '2.3', price: 'High+' },
      { brand: 'Michelin', model: 'Power Cup TLR 28', year: '2023', type: 'TLR', width: '28 / 29', weight: '285 / 283', rollingResistance: '10.3', punctureProtection: '45', grip: '74', thickness: '2.5', price: 'High' },
      { brand: 'Continental', model: 'Aero 111 29', year: '2024', type: 'TLR', width: '29 / 28', weight: '285 / 272', rollingResistance: '10.5', punctureProtection: '40', grip: '84', thickness: '2.2', price: 'High+' },
      { brand: 'Pirelli', model: 'P Zero Race TLR RS SpeedCore 28', year: '2024', type: 'TLR', width: '28 / 28', weight: '290 / 294', rollingResistance: '10.5', punctureProtection: '43', grip: '80', thickness: '2.4', price: 'High+' },
      { brand: 'Specialized', model: 'S-Works Turbo RapidAir 2Bliss Ready T2/T5 26', year: '2022', type: 'TLR', width: '26 / 26', weight: '230 / 223', rollingResistance: '11.7', punctureProtection: '44', grip: '73', thickness: '1.9', price: 'High+' },
      { brand: 'Continental', model: 'Grand Prix 5000 25', year: '2018', type: 'TT', width: '25 / 26', weight: '215 / 221', rollingResistance: '12.1', punctureProtection: '49', grip: '67', thickness: '2.8', price: 'High' }
    ],
    sortField: '',
    sortOrder: 'asc', // 'asc' or 'desc'

    // 胎压数据表 - 基于轮圈类型、体重和轮胎宽度
    pressureTable: {
      hooked: {
        45: { 23: 70, 25: 65, 28: 60, 30: 55, 32: 50 },
        50: { 23: 72, 25: 67, 28: 62, 30: 57, 32: 52 },
        54: { 23: 74, 25: 69, 28: 64, 30: 59, 32: 54 },
        59: { 23: 76, 25: 71, 28: 66, 30: 61, 32: 56 },
        64: { 23: 78, 25: 73, 28: 68, 30: 63, 32: 58 },
        68: { 23: 80, 25: 75, 28: 70, 30: 65, 32: 60 },
        73: { 23: 82, 25: 77, 28: 72, 30: 67, 32: 62 },
        77: { 23: 84, 25: 79, 28: 74, 30: 69, 32: 64 },
        82: { 23: 86, 25: 81, 28: 76, 30: 71, 32: 66 },
        86: { 23: 88, 25: 83, 28: 78, 30: 73, 32: 68 },
        91: { 23: 90, 25: 85, 28: 80, 30: 75, 32: 70 },
        95: { 23: 92, 25: 87, 28: 82, 30: 77, 32: 72 },
        100: { 23: 94, 25: 89, 28: 84, 30: 79, 32: 74 },
        104: { 23: 96, 25: 91, 28: 86, 30: 81, 32: 76 },
        109: { 23: 98, 25: 93, 28: 88, 30: 83, 32: 78 },
        113: { 23: 100, 25: 95, 28: 90, 30: 85, 32: 80 }
      },
      hookless: {
        45: { 23: 60, 25: 55, 28: 50, 30: 45, 32: 40 },
        50: { 23: 62, 25: 57, 28: 52, 30: 47, 32: 42 },
        54: { 23: 64, 25: 59, 28: 54, 30: 49, 32: 44 },
        59: { 23: 66, 25: 61, 28: 56, 30: 51, 32: 46 },
        64: { 23: 68, 25: 63, 28: 58, 30: 53, 32: 48 },
        68: { 23: 70, 25: 65, 28: 60, 30: 55, 32: 50 },
        73: { 23: 72, 25: 67, 28: 62, 30: 57, 32: 52 },
        77: { 23: null, 25: 69, 28: 64, 30: 59, 32: 54 },
        82: { 23: null, 25: 71, 28: 66, 30: 61, 32: 56 },
        86: { 23: null, 25: null, 28: 68, 30: 63, 32: 58 },
        91: { 23: null, 25: null, 28: 70, 30: 65, 32: 60 },
        95: { 23: null, 25: null, 28: 72, 30: 67, 32: 62 },
        100: { 23: null, 25: null, 28: null, 30: 69, 32: 64 },
        104: { 23: null, 25: null, 28: null, 30: 71, 32: 66 },
        109: { 23: null, 25: null, 28: null, 30: null, 32: 68 },
        113: { 23: null, 25: null, 28: null, 30: null, 32: 70 }
      }
    },
    
    // 计算结果
    frontPressure: 0,
    rearPressure: 0,
    calculated: false,
    
    // UI状态
    calculating: false
  },

  onLoad: function(options) {
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: '铁人工具'
    });
  },

  // 分页切换方法
  switchTab: function(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({
      currentTab: tab
    });
  },

  // 输入处理 - 增强用户体验
  onWeightInput: function(e) {
    const weight = parseFloat(e.detail.value);
    
    // 实时验证和反馈
    if (isNaN(weight) || weight < 40) {
      wx.showToast({
        title: '体重不能低于40kg',
        icon: 'none',
        duration: 1500
      });
      return;
    }
    
    if (weight > 150) {
      wx.showToast({
        title: '体重不能超过150kg',
        icon: 'none',
        duration: 1500
      });
      return;
    }
    
    this.setData({
      riderWeight: weight,
      calculated: false
    });
    
    // 输入完成后的触觉反馈
    wx.vibrateShort({
      type: 'light'
    });
  },

  onBikeStyleChange: function(e) {
    const index = parseInt(e.detail.value);
    const selectedStyle = this.data.bikeStyles[index];
    
    this.setData({
      selectedBikeStyle: index,
      calculated: false
    });
    
    // 显示选择反馈
    wx.showToast({
      title: `已选择${selectedStyle.name}`,
      icon: 'success',
      duration: 1000
    });
    
    // 输入完成后的触觉反馈
    wx.vibrateShort({
      type: 'light'
    });
  },

  onBikeTypeChange: function(e) {
    const index = parseInt(e.detail.value);
    const selectedType = this.data.bikeTypes[index];
    
    this.setData({
      selectedBikeType: index,
      calculated: false
    });
    
    // 显示选择反馈
    wx.showToast({
      title: `已选择${selectedType.name}`,
      icon: 'success',
      duration: 1000
    });
    
    // 根据自行车类型智能推荐轮胎宽度
    this.recommendTireWidth(selectedType.value);
  },

  onSurfaceTypeChange: function(e) {
    const index = parseInt(e.detail.value);
    const selectedSurface = this.data.surfaceTypes[index];
    
    this.setData({
      selectedSurfaceType: index,
      calculated: false
    });
    
    wx.showToast({
      title: `已选择${selectedSurface.name}`,
      icon: 'success',
      duration: 1000
    });
  },

  onWetConditionChange: function(e) {
    const index = parseInt(e.detail.value);
    const selectedCondition = this.data.wetConditions[index];
    
    this.setData({
      selectedWetCondition: index,
      calculated: false
    });
    
    wx.showToast({
      title: `已选择${selectedCondition.name}`,
      icon: 'success',
      duration: 1000
    });
  },

  onTireWidthChange: function(e) {
    const index = parseInt(e.detail.value);
    const selectedWidth = this.data.tireWidths[index];
    
    this.setData({
      selectedTireWidth: index,
      calculated: false
    });
    
    wx.showToast({
      title: `已选择${selectedWidth.name}`,
      icon: 'success',
      duration: 1000
    });
  },

  // 智能推荐轮胎宽度 - 针对公路车系优化
  recommendTireWidth: function(bikeType) {
    const surfaceType = this.data.surfaceTypes[this.data.selectedSurfaceType].value;
    
    let recommendation = '';
    
    if (bikeType === 'road') {
      if (surfaceType === 'smooth') {
        recommendation = '推荐23-25mm，平衡速度与舒适性';
      } else {
        recommendation = '推荐25-28mm，提升舒适性和抓地力';
      }
    } else if (bikeType === 'triathlon') {
      if (surfaceType === 'smooth') {
        recommendation = '推荐20-23mm，追求最低滚阻';
      } else {
        recommendation = '推荐23-25mm，兼顾速度和稳定性';
      }
    }
    
    this.setData({
      tireWidthHint: recommendation
    });
  },

  // 胎压计算核心算法 - 基于真空胎数据表
  calculateTirePressure: function() {
    var riderWeight = this.data.riderWeight;
    var selectedBikeType = this.data.selectedBikeType;
    var selectedBikeStyle = this.data.selectedBikeStyle;
    var selectedSurfaceType = this.data.selectedSurfaceType;
    var selectedWetCondition = this.data.selectedWetCondition;
    var selectedTireWidth = this.data.selectedTireWidth;
    const rimType = this.data.bikeTypes[selectedBikeType].value;
    const bikeStyle = this.data.bikeStyles[selectedBikeStyle].value;
    const surfaceType = this.data.surfaceTypes[selectedSurfaceType].value;
    const wetCondition = this.data.wetConditions[selectedWetCondition].value;
    const tireWidth = this.data.tireWidths[selectedTireWidth].value;
    
    // 车辆重量修正系数
    const bikeWeight = bikeStyle === 'triathlon' ? 9.5 : 8; // 铁三车9-10kg平均9.5kg，公路车7-9kg平均8kg
    const totalWeight = riderWeight + bikeWeight;
    
    // 获取基础胎压值（基于总重量）
    const basePressure = this.getBasePressureFromTable(rimType, totalWeight, tireWidth);
    
    if (basePressure === null) {
      wx.showToast({
        title: '该组合不支持',
        icon: 'error',
        duration: 2000
      });
      return { front: 0, rear: 0 };
    }
    
    // 路面类型修正系数
    const surfaceCorrection = surfaceType === 'smooth' ? 0 : 3; // 粗糙路面增加3psi
    
    // 路面干湿修正系数 - 专业自行车逻辑
    // 湿滑路面需要降低胎压以增加接触面积，提升抓地力
    const wetCorrection = wetCondition === 'wet' ? -3 : 0; // 湿滑路面降低3psi
    
    let frontPressure, rearPressure;
    
    if (bikeStyle === 'triathlon') {
      // 铁三车：前后轮胎压相同
      const pressure = Math.round(basePressure + surfaceCorrection + wetCorrection);
      frontPressure = Math.max(pressure, 20);
      rearPressure = Math.max(pressure, 20);
    } else {
      // 公路车：前后轮压力分配 (前轮承重约40%，后轮约60%)
      frontPressure = Math.round(basePressure * 0.95 + surfaceCorrection + wetCorrection); // 前轮稍低
      rearPressure = Math.round(basePressure * 1.05 + surfaceCorrection + wetCorrection);  // 后轮稍高
      frontPressure = Math.max(frontPressure, 20); // 最低20psi
      rearPressure = Math.max(rearPressure, 20);   // 最低20psi
    }
    
    return {
      front: frontPressure,
      rear: rearPressure
    };
  },

  // 从数据表获取基础胎压
  getBasePressureFromTable: function(rimType, weight, tireWidth) {
    const table = this.data.pressureTable[rimType];
    if (!table) return null;
    
    // 找到最接近的体重档位
    const weightKeys = Object.keys(table).map(Number).sort((a, b) => a - b);
    let targetWeight = weightKeys[0];
    
    for (let i = 0; i < weightKeys.length; i++) {
      if (weight >= weightKeys[i]) {
        targetWeight = weightKeys[i];
      } else {
        break;
      }
    }
    
    // 如果体重超出表格范围，使用插值计算
    if (weight > weightKeys[weightKeys.length - 1]) {
      const maxWeight = weightKeys[weightKeys.length - 1];
      const maxPressure = table[maxWeight][tireWidth];
      if (maxPressure === null) return null;
      
      // 超重时每5kg增加2psi
      const extraWeight = weight - maxWeight;
      const extraPressure = Math.floor(extraWeight / 5) * 2;
      return maxPressure + extraPressure;
    }
    
    // 体重在表格范围内，进行线性插值
    if (weight !== targetWeight && targetWeight < weightKeys[weightKeys.length - 1]) {
      const nextWeightIndex = weightKeys.indexOf(targetWeight) + 1;
      const nextWeight = weightKeys[nextWeightIndex];
      
      const currentPressure = table[targetWeight][tireWidth];
      const nextPressure = table[nextWeight][tireWidth];
      
      if (currentPressure === null || nextPressure === null) {
        return currentPressure;
      }
      
      // 线性插值
      const ratio = (weight - targetWeight) / (nextWeight - targetWeight);
      return Math.round(currentPressure + (nextPressure - currentPressure) * ratio);
    }
    
    return table[targetWeight][tireWidth];
  },

  // 执行计算 - 增强用户体验和动画效果
  performCalculation: function() {
    if (!this.validateInputs()) {
      return;
    }

    // 开始计算动画
    this.setData({
      calculating: true
    });

    // 添加计算过程的视觉反馈
    wx.showLoading({
      title: '计算中...',
      mask: true
    });

    // 模拟计算过程（增加用户体验）
    setTimeout(() => {
      try {
        const result = this.calculateTirePressure();
        const advice = this.getPressureAdvice();

        this.setData({
          frontPressure: result.front,
          rearPressure: result.rear,
          calculated: true,
          calculating: false,
          pressureAdvice: advice
        });

        wx.hideLoading();

        // 计算完成的成功反馈
        wx.showToast({
          title: '计算完成！',
          icon: 'success',
          duration: 1500
        });

        // 触觉反馈
        wx.vibrateShort({
          type: 'medium'
        });

        // 滚动到结果区域
        wx.pageScrollTo({
          selector: '.result-section',
          duration: 500
        });

      } catch (error) {
        console.error('计算错误:', error);
        
        this.setData({
          calculating: false
        });

        wx.hideLoading();
        
        wx.showModal({
          title: '计算错误',
          content: '计算过程中出现错误，请检查输入参数后重试',
          showCancel: false
        });
      }
    }, 800); // 适当的延迟让用户感受到计算过程
  },

  // 输入验证 - 更详细的验证和提示
  validateInputs: function() {
    var riderWeight = this.data.riderWeight;
    var selectedBikeType = this.data.selectedBikeType;
    var selectedSurfaceType = this.data.selectedSurfaceType;
    var selectedTireWidth = this.data.selectedTireWidth;

    if (!riderWeight || riderWeight < 40 || riderWeight > 150) {
      wx.showModal({
        title: '输入错误',
        content: '请输入有效的体重（40-150kg）',
        showCancel: false
      });
      return false;
    }

    // 检查轮胎宽度选择（使用索引）
    if (selectedTireWidth === undefined || selectedTireWidth < 0 || selectedTireWidth >= this.data.tireWidths.length) {
      wx.showModal({
        title: '输入错误', 
        content: '请选择有效的轮胎宽度',
        showCancel: false
      });
      return false;
    }

    // 检查自行车类型选择（使用索引）
    if (selectedBikeType === undefined || selectedBikeType < 0 || selectedBikeType >= this.data.bikeTypes.length) {
      wx.showModal({
        title: '输入错误',
        content: '请选择自行车类型',
        showCancel: false
      });
      return false;
    }

    // 检查路面类型选择（使用索引）
    if (selectedSurfaceType === undefined || selectedSurfaceType < 0 || selectedSurfaceType >= this.data.surfaceTypes.length) {
      wx.showModal({
        title: '输入错误',
        content: '请选择路面类型',
        showCancel: false
      });
      return false;
    }

    return true;
  },

  // 重置计算 - 增强交互体验
  resetCalculation: function() {
    wx.showModal({
      title: '重置确认',
      content: '确定要重置所有设置吗？',
      confirmText: '重置',
      confirmColor: '#ff6b6b',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            riderWeight: 70,
            tireWidth: 25,
            bikeType: 'road',
            surfaceType: 'smooth',
            frontPressure: 0,
            rearPressure: 0,
            calculated: false,
            calculating: false,
            pressureAdvice: ''
          });

          wx.showToast({
            title: '已重置',
            icon: 'success',
            duration: 1000
          });

          // 滚动到顶部
          wx.pageScrollTo({
            scrollTop: 0,
            duration: 500
          });
        }
      }
    });
  },

  // 获取胎压建议说明 - 提供更详细和实用的建议
  getPressureAdvice: function() {
    var bikeType = this.data.bikeType;
    var surfaceType = this.data.surfaceType;
    var tireWidth = this.data.tireWidth;
    var frontPressure = this.data.frontPressure;
    var rearPressure = this.data.rearPressure;
    
    let advice = '';
    
    // 基于自行车类型的建议
    if (bikeType === 'road') {
      advice += '公路车建议：较高胎压可降低滚阻，提升速度。';
      if (frontPressure > 90) {
        advice += '当前压力适合竞赛和光滑路面。';
      } else {
        advice += '当前压力平衡了舒适性和效率。';
      }
    } else if (bikeType === 'gravel') {
      advice += '砾石车建议：适中胎压平衡抓地力和舒适性。';
      advice += '可根据路况微调±5-10 PSI。';
    } else if (bikeType === 'mtb') {
      advice += '山地车建议：较低胎压提供更好抓地力。';
      if (frontPressure < 25) {
        advice += '注意避免蛇咬爆胎，考虑无内胎设置。';
      }
    } else if (bikeType === 'cyclocross') {
      advice += '越野车建议：根据赛道条件调整压力。';
      advice += '泥地可降低5-10 PSI增加抓地力。';
    }
    
    // 基于路面类型的额外建议
    if (surfaceType === 'rough' || surfaceType === 'gravel') {
      advice += ' 粗糙路面建议降低胎压2-5 PSI提升舒适性。';
    } else if (surfaceType === 'offroad') {
      advice += ' 越野路面可进一步降低胎压增加接触面积。';
    }
    
    // 基于轮胎宽度的建议
    if (tireWidth <= 25) {
      advice += ' 窄胎需要较高压力避免爆胎和提升效率。';
    } else if (tireWidth >= 35) {
      advice += ' 宽胎可使用较低压力，提供更好的舒适性和抓地力。';
    }
    
    // 安全提醒
    advice += ' 建议定期检查胎压，骑行前确认轮胎状况良好。';
    
    return advice;
  },

  // 排序功能
  onSort: function(e) {
    const key = e.currentTarget.dataset.key;
    const header = this.data.tireTableHeaders.find(h => h.key === key);
    
    if (!header || !header.sortable) return;

    let sortOrder = 'asc';
    if (this.data.sortField === key) {
      sortOrder = this.data.sortOrder === 'asc' ? 'desc' : 'asc';
    }

    const sortedData = [...this.data.tireRecommendations].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      // 处理包含斜杠的复合数值，默认取第一个数值进行排序
      if (typeof valA === 'string' && valA.includes('/')) {
        valA = parseFloat(valA.split('/')[0]);
      } else if (key === 'price') {
        // 价格等级特殊处理
        const priceRank = { 'High+': 2, 'High': 1 };
        valA = priceRank[valA] || 0;
      } else {
        valA = parseFloat(valA);
      }
      
      if (typeof valB === 'string' && valB.includes('/')) {
        valB = parseFloat(valB.split('/')[0]);
      } else if (key === 'price') {
        const priceRank = { 'High+': 2, 'High': 1 };
        valB = priceRank[valB] || 0;
      } else {
        valB = parseFloat(valB);
      }

      // 如果转换失败（非数字），回退到字符串比较
      if (isNaN(valA) || isNaN(valB)) {
        valA = a[key];
        valB = b[key];
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    this.setData({
      tireRecommendations: sortedData,
      sortField: key,
      sortOrder: sortOrder
    });
    
    wx.showToast({
      title: `按${header.label}${sortOrder === 'asc' ? '升序' : '降序'}排列`,
      icon: 'none',
      duration: 1000
    });
  }
});
