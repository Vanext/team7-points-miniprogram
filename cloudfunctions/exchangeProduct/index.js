// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const CODE_VERSION = '2025-12-21-activation'

// 确保需要的集合已存在
async function ensureCollections(names = []) {
  for (const name of names) {
    try {
      // 若集合已存在会抛错，忽略即可
      await db.createCollection(name)
    } catch (e) {
      // -501007: collection already exists（不同环境错误码可能不同，这里统一忽略）
    }
  }
}

/**
 * 积分兑换商品
 */
exports.main = async (event, context) => {
  const { productId, quantity = 1, recipient = {}, selectedSize = '' } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 事务前确保记录集合存在，避免 -502005 错误
    await ensureCollections(['exchange_records', 'point_records'])

    const result = await db.runTransaction(async (transaction) => {
      // 1. 获取用户积分信息（按 _openid 查询）
      const userRes = await transaction.collection('users').where({ _openid: openid }).get()
      if (!userRes.data || userRes.data.length === 0) {
        throw new Error('用户信息不存在')
      }
      const user = userRes.data[0]
      const userPoints = user.totalPoints || 0
      const isOfficialMember = user.isOfficialMember === true
      const until = user.officialMemberUntil
      const untilTs = (() => {
        if (!until) return 0
        if (until instanceof Date) return until.getTime()
        if (typeof until === 'number') return until
        if (typeof until === 'string') {
          const t = new Date(until).getTime()
          return Number.isFinite(t) ? t : 0
        }
        if (until && typeof until === 'object') {
          if (until.$date) {
            const t = new Date(until.$date).getTime()
            return Number.isFinite(t) ? t : 0
          }
          if (until.time) {
            const t = new Date(until.time).getTime()
            return Number.isFinite(t) ? t : 0
          }
        }
        return 0
      })()

      // 2. 获取商品信息
      const productRes = await transaction.collection('products').doc(productId).get()
      if (!productRes.data) {
        throw new Error('商品不存在')
      }
      const product = productRes.data

      // 检查商品是否可兑换
      if (!product.isActive) {
        throw new Error('商品已下架')
      }
      if (product.stock < quantity) {
        throw new Error('商品库存不足')
      }

      const totalPoints = (product.points || 0) * quantity

      // 检查用户积分是否足够，负积分用户无法兑换
      if (userPoints < 0) {
        throw new Error('负积分状态下无法兑换商品')
      }
      if (userPoints < totalPoints) {
        throw new Error('积分不足，无法兑换')
      }

      if (isOfficialMember && untilTs > 0 && untilTs <= Date.now()) {
        await transaction.collection('users').doc(user._id).update({
          data: { isOfficialMember: false, updateTime: db.serverDate() }
        })
        throw new Error('正式会员已到期，请联系管理员续期')
      }

      if (!isOfficialMember) {
        throw new Error('仅俱乐部正式会员可参与积分兑换')
      }

      // 检查用户是否被锁定兑换权限
      if (user.exchange_locked === true) {
        // 尝试自动解锁用户
        try {
          const unlockResult = await cloud.callFunction({
            name: 'manageExchangeLock',
            data: {
              action: 'checkAndAutoUnlock',
              data: { userId: user._id }
            }
          })
          
          // 如果自动解锁失败，仍然阻止兑换
          if (!unlockResult.result.success || !unlockResult.result.unlocked) {
            throw new Error('您的兑换权限已被锁定，请联系管理员或参加比赛后自动解锁')
          }
          
          // 自动解锁成功，更新本地用户状态
          user.exchange_locked = false
        } catch (unlockError) {
          console.error('自动解锁检查失败:', unlockError)
          throw new Error('您的兑换权限已被锁定，请联系管理员或参加比赛后自动解锁')
        }
      }

      if (user.exchange_locked === true) {
        throw new Error('未激活：完成一次铁人三项打卡审核通过，或联系管理员解锁')
      }

      // 收件信息校验
      const method = recipient.method || 'mail'
      const name = (recipient.name || '').trim()
      const phone = (recipient.phone || '').trim()
      const address = (recipient.address || '').trim()
      const remark = (recipient.remark || '').trim()
      if (!name) throw new Error('请填写收件人姓名')
      if (method === 'mail') {
        if (!/^1\d{10}$/.test(phone)) throw new Error('请填写有效的手机号')
        if (!address) throw new Error('邮寄方式需填写详细地址')
      } else {
        if (phone && !/^1\d{10}$/.test(phone)) throw new Error('请填写有效的手机号或留空')
      }

      // 3. 扣减用户积分 totalPoints 字段
      await transaction.collection('users').doc(user._id).update({
        data: {
          totalPoints: db.command.inc(-totalPoints),
          updateTime: db.serverDate()
        }
      })

      // 4. 减少商品库存（支持尺码）
      if (product.sizesEnabled === true) {
        const selSize = (event.selectedSize || '').trim()
        if (!selSize) throw new Error('请选择尺码')
        const currentSizeStock = (product.sizeStocks && product.sizeStocks[selSize]) || 0
        if (currentSizeStock < quantity) throw new Error('所选尺码库存不足')
        // 更新尺码库存与总库存
        const newSizeStocks = Object.assign({}, product.sizeStocks)
        newSizeStocks[selSize] = currentSizeStock - quantity
        await transaction.collection('products').doc(productId).update({
          data: {
            sizeStocks: newSizeStocks,
            stock: db.command.inc(-quantity),
            updateTime: db.serverDate()
          }
        })
      } else {
        await transaction.collection('products').doc(productId).update({
          data: {
            stock: db.command.inc(-quantity),
            updateTime: db.serverDate()
          }
        })
      }

      // 5. 创建兑换记录（exchange_records 集合）
      const exchangeRecord = {
        _openid: openid,
        userNickName: user.nickName || '',
        userAvatarUrl: user.avatarUrl || '',
        productId,
        productName: product.name,
        productImage: product.image,
        quantity,
        pointsSpent: totalPoints,
        unitPoints: product.points,
        status: 'pending', // 待处理
        recipient: { method, name, phone, address, remark },
        selectedSize: selectedSize,
        logistics: { company: '', trackingNumber: '' },
        shipTime: null,
        finishTime: null,
        exchange_time: db.serverDate(),
        updateTime: db.serverDate()
      }
      const addRes = await transaction.collection('exchange_records').add({ data: exchangeRecord })

      // 6. 记录积分使用记录（point_records 集合，与提交一致）
      const pointRecord = {
        _openid: openid,
        type: 'exchange', // exchange: 兑换, earn: 获得
        points: -totalPoints,
        description: `兑换商品：${product.name} x${quantity}`,
        relatedId: productId,
        submitTime: db.serverDate(),
        status: 'approved' // 直接标记为已通过（消费）
      }
      await transaction.collection('point_records').add({ data: pointRecord })

      return {
        exchangeId: addRes._id,
        pointsUsed: totalPoints,
        remainingPoints: userPoints - totalPoints,
        productName: product.name,
        quantity
      }
    })

    return {
      success: true,
      data: result,
      codeVersion: CODE_VERSION,
      message: '兑换申请已提交'
    }
  } catch (error) {
    console.error('积分兑换失败', error)
    return {
      success: false,
      codeVersion: CODE_VERSION,
      message: error.message || '兑换失败，请稍后重试',
      error: error
    }
  }
}
