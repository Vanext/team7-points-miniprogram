// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 云函数入口函数
exports.main = async (event, context) => {
  const { weight, tireWidth, ridingType, surface } = event;
  
  try {
    // 由于小程序云函数无法直接调用外部HTTP接口，这里使用本地计算逻辑
    // 实际项目中可以通过云函数的HTTP请求能力调用外部API
    const result = calculateTirePressure({ weight, tireWidth, ridingType, surface });
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('胎压计算失败:', error);
    return {
      success: false,
      error: error.message || '计算失败'
    };
  }
}

// 胎压计算逻辑（基于专业的胎压计算公式）
function calculateTirePressure({ weight, tireWidth, ridingType, surface }) {
  // 基础胎压计算（PSI）- 基于体重和轮胎宽度的专业公式
  let basePressure = 80 + (weight - 70) * 0.5;
  
  // 根据轮胎宽度调整（更精确的系数）
  const widthFactor = {
    23: 1.25,
    25: 1.15,
    28: 1.0,
    30: 0.95,
    32: 0.9,
    35: 0.85,
    38: 0.8,
    40: 0.75,
    42: 0.7,
    45: 0.65
  };
  basePressure *= (widthFactor[tireWidth] || 1.0);

  // 根据骑行类型调整
  const ridingFactor = {
    'road': 1.1,        // 公路骑行需要更高胎压
    'mountain': 0.7,    // 山地骑行需要更低胎压
    'commute': 0.9,     // 通勤骑行平衡舒适性和效率
    'touring': 0.95,    // 长途骑行稍低胎压增加舒适性
    'racing': 1.15      // 竞速骑行最高胎压减少滚动阻力
  };
  basePressure *= (ridingFactor[ridingType] || 1.0);

  // 根据路面条件调整
  const surfaceFactor = {
    'smooth': 1.05,     // 平滑路面可以更高胎压
    'normal': 1.0,      // 一般路面标准胎压
    'rough': 0.9,       // 粗糙路面降低胎压增加舒适性
    'gravel': 0.8,      // 碎石路面大幅降低胎压
    'mixed': 0.95       // 混合路面稍微降低胎压
  };
  basePressure *= (surfaceFactor[surface] || 1.0);

  // 确保胎压在合理范围内
  basePressure = Math.max(30, Math.min(120, basePressure));

  // 前后轮胎压差异（后轮通常比前轮高5-10 PSI）
  const frontPressure = Math.round(basePressure);
  const rearPressure = Math.round(basePressure + 7);

  // 转换为bar（1 PSI ≈ 0.0689 bar）
  const frontPressureBar = (frontPressure * 0.0689).toFixed(1);
  const rearPressureBar = (rearPressure * 0.0689).toFixed(1);

  // 生成专业建议
  const tips = generateProfessionalTips(ridingType, surface, tireWidth, weight);

  return {
    frontPressure,
    rearPressure,
    frontPressureBar,
    rearPressureBar,
    tips,
    calculationInfo: {
      baseWeight: weight,
      tireWidth,
      ridingType,
      surface,
      timestamp: new Date().toISOString()
    }
  };
}

// 生成专业使用建议
function generateProfessionalTips(ridingType, surface, tireWidth, weight) {
  const tips = [];
  
  // 根据骑行类型给出建议
  switch (ridingType) {
    case 'mountain':
      tips.push('山地骑行：建议在推荐胎压基础上再降低5-10 PSI以获得更好的抓地力和舒适性');
      break;
    case 'racing':
      tips.push('竞速骑行：可在推荐胎压基础上增加3-5 PSI以减少滚动阻力，但注意舒适性');
      break;
    case 'touring':
      tips.push('长途骑行：推荐胎压已考虑长时间骑行的舒适性，可根据负重情况微调');
      break;
    case 'commute':
      tips.push('通勤骑行：推荐胎压平衡了效率和舒适性，适合日常使用');
      break;
    default:
      tips.push('公路骑行：推荐胎压适合大多数公路条件，可根据个人喜好微调');
  }
  
  // 根据路面条件给出建议
  if (surface === 'rough' || surface === 'gravel') {
    tips.push('粗糙路面：已适当降低胎压，如仍感觉颠簸可再降低2-3 PSI');
  } else if (surface === 'smooth') {
    tips.push('平滑路面：可适当提高胎压以获得更好的滚动效率');
  }
  
  // 根据轮胎宽度给出建议
  if (tireWidth <= 25) {
    tips.push('窄胎使用：需要更高胎压支撑，建议每3-4天检查一次胎压');
  } else if (tireWidth >= 35) {
    tips.push('宽胎使用：可承受较低胎压，提供更好的舒适性和抓地力');
  }
  
  // 根据体重给出建议
  if (weight > 80) {
    tips.push('体重较重：建议在推荐胎压基础上增加2-3 PSI以防止轮胎变形');
  } else if (weight < 60) {
    tips.push('体重较轻：可在推荐胎压基础上降低2-3 PSI以增加舒适性');
  }
  
  // 通用建议
  tips.push('定期检查：建议每周检查胎压，温度变化会影响胎压（温度每升高10°C，胎压约增加1 PSI）');
  tips.push('安全提醒：胎压过低会增加爆胎风险，过高会影响抓地力，请在推荐范围内调整');
  
  return tips.join('；');
}