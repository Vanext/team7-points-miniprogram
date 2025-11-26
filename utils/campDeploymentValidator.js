// 训练营云函数部署验证工具
// 在小程序中运行此代码来验证云函数是否正确部署

const campFunctions = [
  'getCampData',
  'getCampLeaderboard', 
  'initCampData',
  'submitPoints'
];

// 验证云函数部署状态
async function validateCampFunctions() {
  console.log('开始验证训练营云函数部署状态...');
  
  const results = {};
  
  for (const functionName of campFunctions) {
    try {
      console.log(`正在测试 ${functionName}...`);
      
      let testData = {};
      if (functionName === 'getCampData') {
        testData = { camp_id: 'camp_hengqin_2026' };
      } else if (functionName === 'getCampLeaderboard') {
        testData = { camp_id: 'camp_hengqin_2026' };
      } else if (functionName === 'initCampData') {
        testData = { action: 'init_camp_data' };
      } else if (functionName === 'submitPoints') {
        // 只测试函数是否存在，不实际提交数据
        testData = { test: true };
      }
      
      const result = await wx.cloud.callFunction({
        name: functionName,
        data: testData
      });
      
      results[functionName] = {
        success: true,
        result: result.result
      };
      
      console.log(`${functionName} ✅ 部署成功`);
      
    } catch (error) {
      results[functionName] = {
        success: false,
        error: error.message || error.errMsg || '未知错误'
      };
      
      console.error(`${functionName} ❌ 部署失败:`, error);
    }
  }
  
  // 显示验证结果
  console.log('\n=== 验证结果汇总 ===');
  let allSuccess = true;
  
  for (const [funcName, result] of Object.entries(results)) {
    const status = result.success ? '✅' : '❌';
    console.log(`${funcName}: ${status} ${result.success ? '成功' : '失败'}`);
    if (!result.success) {
      allSuccess = false;
      console.log(`  错误信息: ${result.error}`);
    }
  }
  
  if (allSuccess) {
    console.log('\n🎉 所有训练营云函数部署成功！');
    wx.showToast({
      title: '云函数验证成功',
      icon: 'success',
      duration: 2000
    });
  } else {
    console.log('\n⚠️  部分云函数部署失败，请检查部署指南');
    wx.showModal({
      title: '云函数验证失败',
      content: '部分云函数未正确部署，请查看部署指南重新部署',
      showCancel: false
    });
  }
  
  return results;
}

// 初始化训练营数据
async function initCampData() {
  try {
    console.log('正在初始化训练营数据...');
    const result = await wx.cloud.callFunction({
      name: 'initCampData',
      data: {
        action: 'init_camp_data'
      }
    });
    
    if (result.result.success) {
      console.log('✅ 训练营数据初始化成功');
      wx.showToast({
        title: '训练营数据初始化成功',
        icon: 'success'
      });
    } else {
      console.warn('⚠️ 训练营数据初始化失败:', result.result.message);
      wx.showToast({
        title: result.result.message || '初始化失败',
        icon: 'none'
      });
    }
    
    return result.result;
  } catch (error) {
    console.error('❌ 初始化训练营数据失败:', error);
    wx.showToast({
      title: '初始化失败',
      icon: 'error'
    });
    return { success: false, error: error.message };
  }
}

// 测试训练营功能
async function testCampFeatures() {
  console.log('开始测试训练营功能...');
  
  try {
    // 1. 获取训练营数据
    console.log('1. 测试获取训练营数据...');
    const campData = await wx.cloud.callFunction({
      name: 'getCampData',
      data: {
        camp_id: 'camp_hengqin_2026'
      }
    });
    
    if (campData.result.success) {
      console.log('✅ 训练营数据获取成功');
      console.log('训练营名称:', campData.result.campPlan.name);
      console.log('总周数:', campData.result.campPlan.total_weeks);
    } else {
      console.warn('⚠️ 训练营数据获取失败:', campData.result.message);
    }
    
    // 2. 获取排行榜
    console.log('2. 测试获取排行榜...');
    const leaderboard = await wx.cloud.callFunction({
      name: 'getCampLeaderboard',
      data: {
        camp_id: 'camp_hengqin_2026'
      }
    });
    
    if (leaderboard.result.success) {
      console.log('✅ 排行榜获取成功');
      console.log('排行榜人数:', leaderboard.result.leaderboard.length);
    } else {
      console.warn('⚠️ 排行榜获取失败:', leaderboard.result.message);
    }
    
    wx.showToast({
      title: '训练营功能测试完成',
      icon: 'success'
    });
    
  } catch (error) {
    console.error('❌ 训练营功能测试失败:', error);
    wx.showToast({
      title: '测试失败',
      icon: 'error'
    });
  }
}

// 导出函数供页面使用
module.exports = {
  validateCampFunctions,
  initCampData,
  testCampFeatures
};
