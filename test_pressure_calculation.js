// 胎压计算测试脚本 - 收敛版本（仅公路车系）
// 测试收敛后的算法准确性

// 模拟计算函数（从tools.js复制并改进）
function calculateTirePressure(riderWeight, bikeType, surfaceType, tireWidth) {
  // 公路车系基础压力计算 - 基于科学研究和实际测试数据
  // 使用更精确的公式，考虑轮胎接触面积和负载分布
  const baseWeightFactor = riderWeight * 0.9; // 体重基础系数
  const widthFactor = Math.max(0, (30 - tireWidth) * 3.2); // 轮胎宽度影响
  let basePressure = baseWeightFactor + widthFactor + 30; // 基础压力
  
  // 自行车类型调整系数 - 针对公路车系优化
  const bikeTypeFactors = {
    'road': 1.0,        // 公路车标准，平衡速度和舒适性
    'triathlon': 1.05   // 铁三车略高，追求最低滚阻
  };
  
  // 路面类型调整系数 - 简化为两种路面
  const surfaceFactors = {
    'smooth': 1.0,      // 光滑路面，可用较高压力
    'rough': 0.94       // 粗糙路面，降低压力提升舒适性
  };
  
  // 应用调整系数
  basePressure *= bikeTypeFactors[bikeType] || 1.0;
  basePressure *= surfaceFactors[surfaceType] || 1.0;
  
  // 前后轮压力分配 - 公路车系专用
  // 考虑骑行姿态：公路车前倾较多，铁三车更加前倾
  const frontRatio = bikeType === 'triathlon' ? 0.88 : 0.90;
  const rearRatio = bikeType === 'triathlon' ? 1.12 : 1.10;
  
  let frontPressure = Math.round(basePressure * frontRatio);
  let rearPressure = Math.round(basePressure * rearRatio);
  
  // 压力范围限制 - 基于20-35mm轮胎规格
  const minPressure = Math.max(60, tireWidth * 1.8); // 最低安全压力
  const maxPressure = Math.min(140, tireWidth * 4.5); // 最高安全压力
  
  // 应用压力限制
  frontPressure = Math.max(minPressure, Math.min(maxPressure, frontPressure));
  rearPressure = Math.max(minPressure, Math.min(maxPressure, rearPressure));
  
  return {
    front: frontPressure,
    rear: rearPressure
  };
}

// 测试用例 - 专门针对公路车系
const testCases = [
  {
    name: '公路车 - 轻量骑手 - 光滑路面',
    input: { riderWeight: 60, bikeType: 'road', surfaceType: 'smooth', tireWidth: 25 },
    expected: { front: { min: 85, max: 95 }, rear: { min: 95, max: 105 } }
  },
  {
    name: '公路车 - 重量骑手 - 光滑路面',
    input: { riderWeight: 80, bikeType: 'road', surfaceType: 'smooth', tireWidth: 25 },
    expected: { front: { min: 100, max: 110 }, rear: { min: 115, max: 125 } }
  },
  {
    name: '公路车 - 粗糙路面 - 宽胎',
    input: { riderWeight: 70, bikeType: 'road', surfaceType: 'rough', tireWidth: 32 },
    expected: { front: { min: 75, max: 85 }, rear: { min: 85, max: 95 } }
  },
  {
    name: '铁三车 - 标准骑手 - 光滑路面',
    input: { riderWeight: 70, bikeType: 'triathlon', surfaceType: 'smooth', tireWidth: 23 },
    expected: { front: { min: 95, max: 105 }, rear: { min: 115, max: 125 } }
  },
  {
    name: '铁三车 - 窄胎 - 光滑路面',
    input: { riderWeight: 65, bikeType: 'triathlon', surfaceType: 'smooth', tireWidth: 20 },
    expected: { front: { min: 100, max: 115 }, rear: { min: 120, max: 135 } }
  },
  {
    name: '公路车 - 宽胎 - 粗糙路面',
    input: { riderWeight: 75, bikeType: 'road', surfaceType: 'rough', tireWidth: 35 },
    expected: { front: { min: 70, max: 80 }, rear: { min: 80, max: 90 } }
  }
];

// 边界值测试
const boundaryTests = [
  {
    name: '最小体重 + 最窄胎',
    input: { riderWeight: 40, bikeType: 'road', surfaceType: 'smooth', tireWidth: 20 },
    shouldBeReasonable: true
  },
  {
    name: '最大体重 + 最宽胎',
    input: { riderWeight: 120, bikeType: 'triathlon', surfaceType: 'rough', tireWidth: 35 },
    shouldBeReasonable: true
  }
];

// 运行测试
console.log('=== 公路车系胎压计算算法测试 ===\n');

let passedTests = 0;
let totalTests = testCases.length;

testCases.forEach((testCase, index) => {
  const result = calculateTirePressure(
    testCase.input.riderWeight,
    testCase.input.bikeType,
    testCase.input.surfaceType,
    testCase.input.tireWidth
  );
  
  const frontInRange = result.front >= testCase.expected.front.min && result.front <= testCase.expected.front.max;
  const rearInRange = result.rear >= testCase.expected.rear.min && result.rear <= testCase.expected.rear.max;
  const passed = frontInRange && rearInRange;
  
  console.log(`测试 ${index + 1}: ${testCase.name}`);
  console.log(`输入: 体重${testCase.input.riderWeight}kg, ${testCase.input.bikeType}, ${testCase.input.surfaceType}, ${testCase.input.tireWidth}mm`);
  console.log(`结果: 前轮${result.front}psi, 后轮${result.rear}psi`);
  console.log(`期望: 前轮${testCase.expected.front.min}-${testCase.expected.front.max}psi, 后轮${testCase.expected.rear.min}-${testCase.expected.rear.max}psi`);
  console.log(`状态: ${passed ? '✅ 通过' : '❌ 失败'}\n`);
  
  if (passed) passedTests++;
});

// 边界值测试
console.log('=== 边界值测试 ===\n');
boundaryTests.forEach((test, index) => {
  const result = calculateTirePressure(
    test.input.riderWeight,
    test.input.bikeType,
    test.input.surfaceType,
    test.input.tireWidth
  );
  
  const isReasonable = result.front >= 60 && result.front <= 140 && 
                      result.rear >= 60 && result.rear <= 140 &&
                      result.rear >= result.front;
  
  console.log(`边界测试 ${index + 1}: ${test.name}`);
  console.log(`输入: 体重${test.input.riderWeight}kg, ${test.input.bikeType}, ${test.input.surfaceType}, ${test.input.tireWidth}mm`);
  console.log(`结果: 前轮${result.front}psi, 后轮${result.rear}psi`);
  console.log(`状态: ${isReasonable ? '✅ 合理' : '❌ 不合理'}\n`);
});

console.log(`=== 测试总结 ===`);
console.log(`通过测试: ${passedTests}/${totalTests}`);
console.log(`成功率: ${(passedTests/totalTests*100).toFixed(1)}%`);

if (passedTests === totalTests) {
  console.log('🎉 所有测试通过！算法收敛成功。');
} else {
  console.log('⚠️  部分测试未通过，建议检查算法参数。');
}