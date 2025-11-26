// 测试兑换锁定功能
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

async function testExchangeLock() {
  console.log('=== 开始测试兑换锁定功能 ===')
  
  try {
    // 测试1: 管理员锁定用户兑换权限
    console.log('\n1. 测试管理员锁定用户兑换权限...')
    const lockResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'lockUser',
        data: {
          userId: 'test_user_123',
          reason: '测试锁定'
        }
      }
    })
    console.log('锁定结果:', lockResult.result)
    
    // 测试2: 检查锁定状态
    console.log('\n2. 测试检查锁定状态...')
    const statusResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'getLockStatus',
        data: {
          userId: 'test_user_123'
        }
      }
    })
    console.log('锁定状态:', statusResult.result)
    
    // 测试3: 尝试兑换商品（应该失败）
    console.log('\n3. 测试被锁定用户尝试兑换商品...')
    try {
      const exchangeResult = await cloud.callFunction({
        name: 'exchangeProduct',
        data: {
          productId: 'test_product_456',
          quantity: 1,
          recipient: {
            method: 'mail',
            name: '测试用户',
            phone: '13800138000',
            address: '测试地址'
          }
        }
      })
      console.log('兑换结果:', exchangeResult.result)
    } catch (error) {
      console.log('兑换失败（预期）:', error.message)
    }
    
    // 测试4: 创建比赛参与记录
    console.log('\n4. 测试创建比赛参与记录...')
    const currentYear = new Date().getFullYear()
    const competitionResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'recordCompetition',
        data: {
          userId: 'test_user_123',
          competitionId: 'test_competition_789',
          year: currentYear
        }
      }
    })
    console.log('比赛记录结果:', competitionResult.result)
    
    // 测试5: 检查自动解锁
    console.log('\n5. 测试自动解锁功能...')
    const autoUnlockResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'checkAndAutoUnlock',
        data: {
          userId: 'test_user_123'
        }
      }
    })
    console.log('自动解锁结果:', autoUnlockResult.result)
    
    // 测试6: 再次检查锁定状态（应该已解锁）
    console.log('\n6. 再次检查锁定状态...')
    const finalStatusResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'getLockStatus',
        data: {
          userId: 'test_user_123'
        }
      }
    })
    console.log('最终锁定状态:', finalStatusResult.result)
    
    // 测试7: 管理员手动解锁
    console.log('\n7. 测试管理员手动解锁...')
    const unlockResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'unlockUser',
        data: {
          userId: 'test_user_123',
          reason: '测试解锁'
        }
      }
    })
    console.log('解锁结果:', unlockResult.result)
    
    // 测试8: 查看锁定日志
    console.log('\n8. 测试查看锁定日志...')
    const logsResult = await cloud.callFunction({
      name: 'manageExchangeLock',
      data: {
        action: 'getLockLogs',
        data: {
          userId: 'test_user_123'
        }
      }
    })
    console.log('锁定日志:', logsResult.result)
    
    console.log('\n=== 测试完成 ===')
    
  } catch (error) {
    console.error('测试失败:', error)
  }
}

// 运行测试
testExchangeLock()