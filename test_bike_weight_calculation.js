// 测试加入车辆重量后的胎压计算
// 模拟tools.js中的相关函数

// 模拟压力表数据
const pressureTable = {
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
  }
};

// 模拟getBasePressureFromTable函数
function getBasePressureFromTable(rimType, weight, tireWidth) {
  const table = pressureTable[rimType];
  if (!table) return null;
  
  const weightKeys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let targetWeight = weightKeys[0];
  
  for (let i = 0; i < weightKeys.length; i++) {
    if (weight >= weightKeys[i]) {
      targetWeight = weightKeys[i];
    } else {
      break;
    }
  }
  
  if (weight > weightKeys[weightKeys.length - 1]) {
    const maxWeight = weightKeys[weightKeys.length - 1];
    const maxPressure = table[maxWeight][tireWidth];
    if (maxPressure === null) return null;
    
    const extraWeight = weight - maxWeight;
    const extraPressure = Math.floor(extraWeight / 5) * 2;
    return maxPressure + extraPressure;
  }
  
  if (weight !== targetWeight && targetWeight < weightKeys[weightKeys.length - 1]) {
    const nextWeightIndex = weightKeys.indexOf(targetWeight) + 1;
    const nextWeight = weightKeys[nextWeightIndex];
    
    const currentPressure = table[targetWeight][tireWidth];
    const nextPressure = table[nextWeight][tireWidth];
    
    if (currentPressure === null || nextPressure === null) {
      return currentPressure;
    }
    
    const ratio = (weight - targetWeight) / (nextWeight - targetWeight);
    return Math.round(currentPressure + (nextPressure - currentPressure) * ratio);
  }
  
  return table[targetWeight][tireWidth];
}

// 修改后的计算函数（加入车辆重量）
function calculateTirePressureWithBikeWeight(riderWeight, bikeStyle, surfaceType, tireWidth, rimType = 'hooked') {
  // 车辆重量修正系数
  const bikeWeight = bikeStyle === 'triathlon' ? 9.5 : 8; // 铁三车9-10kg平均9.5kg，公路车7-9kg平均8kg
  const totalWeight = riderWeight + bikeWeight;
  
  console.log(`骑手重量: ${riderWeight}kg, 车辆重量: ${bikeWeight}kg, 总重量: ${totalWeight}kg`);
  
  // 获取基础胎压值（基于总重量）
  const basePressure = getBasePressureFromTable(rimType, totalWeight, tireWidth);
  
  if (basePressure === null) {
    return { front: 0, rear: 0, error: '该组合不支持' };
  }
  
  console.log(`基础胎压: ${basePressure}psi`);
  
  // 路面类型修正系数
  const surfaceCorrection = surfaceType === 'smooth' ? 0 : 3; // 粗糙路面增加3psi
  
  let frontPressure, rearPressure;
  
  if (bikeStyle === 'triathlon') {
    // 铁三车：前后轮胎压相同
    const pressure = Math.round(basePressure + surfaceCorrection);
    frontPressure = Math.max(pressure, 20);
    rearPressure = Math.max(pressure, 20);
  } else {
    // 公路车：前后轮压力分配 (前轮承重约40%，后轮约60%)
    frontPressure = Math.round(basePressure * 0.95 + surfaceCorrection); // 前轮稍低
    rearPressure = Math.round(basePressure * 1.05 + surfaceCorrection);  // 后轮稍高
    frontPressure = Math.max(frontPressure, 20); // 最低20psi
    rearPressure = Math.max(rearPressure, 20);   // 最低20psi
  }
  
  return {
    front: frontPressure,
    rear: rearPressure
  };
}

// 原始计算函数（不加车辆重量）
function calculateTirePressureOriginal(riderWeight, bikeStyle, surfaceType, tireWidth, rimType = 'hooked') {
  const basePressure = getBasePressureFromTable(rimType, riderWeight, tireWidth);
  
  if (basePressure === null) {
    return { front: 0, rear: 0, error: '该组合不支持' };
  }
  
  const surfaceCorrection = surfaceType === 'smooth' ? 0 : 3;
  
  let frontPressure, rearPressure;
  
  if (bikeStyle === 'triathlon') {
    const pressure = Math.round(basePressure + surfaceCorrection);
    frontPressure = Math.max(pressure, 20);
    rearPressure = Math.max(pressure, 20);
  } else {
    frontPressure = Math.round(basePressure * 0.95 + surfaceCorrection);
    rearPressure = Math.round(basePressure * 1.05 + surfaceCorrection);
    frontPressure = Math.max(frontPressure, 20);
    rearPressure = Math.max(rearPressure, 20);
  }
  
  return {
    front: frontPressure,
    rear: rearPressure
  };
}

// 测试用例
const testCases = [
  {
    name: '70kg骑手 + 公路车 + 25mm胎 + 光滑路面',
    riderWeight: 70,
    bikeStyle: 'road',
    surfaceType: 'smooth',
    tireWidth: 25
  },
  {
    name: '70kg骑手 + 铁三车 + 25mm胎 + 光滑路面',
    riderWeight: 70,
    bikeStyle: 'triathlon',
    surfaceType: 'smooth',
    tireWidth: 25
  },
  {
    name: '60kg骑手 + 公路车 + 28mm胎 + 粗糙路面',
    riderWeight: 60,
    bikeStyle: 'road',
    surfaceType: 'rough',
    tireWidth: 28
  },
  {
    name: '80kg骑手 + 铁三车 + 23mm胎 + 光滑路面',
    riderWeight: 80,
    bikeStyle: 'triathlon',
    surfaceType: 'smooth',
    tireWidth: 23
  }
];

console.log('=== 车辆重量对胎压计算影响测试 ===\n');

testCases.forEach((testCase, index) => {
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log('--- 原始计算（仅骑手重量）---');
  const originalResult = calculateTirePressureOriginal(
    testCase.riderWeight, 
    testCase.bikeStyle, 
    testCase.surfaceType, 
    testCase.tireWidth
  );
  console.log(`结果: 前轮${originalResult.front}psi, 后轮${originalResult.rear}psi`);
  
  console.log('--- 新计算（骑手+车辆重量）---');
  const newResult = calculateTirePressureWithBikeWeight(
    testCase.riderWeight, 
    testCase.bikeStyle, 
    testCase.surfaceType, 
    testCase.tireWidth
  );
  console.log(`结果: 前轮${newResult.front}psi, 后轮${newResult.rear}psi`);
  
  const frontDiff = newResult.front - originalResult.front;
  const rearDiff = newResult.rear - originalResult.rear;
  console.log(`差异: 前轮${frontDiff > 0 ? '+' : ''}${frontDiff}psi, 后轮${rearDiff > 0 ? '+' : ''}${rearDiff}psi`);
  console.log('');
});

console.log('=== 总结 ===');
console.log('加入车辆重量后，胎压普遍增加，这更符合实际情况：');
console.log('- 公路车增加约8kg重量');
console.log('- 铁三车增加约9.5kg重量');
console.log('- 总重量增加导致需要更高胎压来支撑');