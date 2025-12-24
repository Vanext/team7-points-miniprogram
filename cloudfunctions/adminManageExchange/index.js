// 云函数：管理员处理兑换（鉴权 + 查询 + 更新状态）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertAdmin(openId) {
  const res = await db.collection('users').where({ _openid: openId }).limit(1).get()
  const u = (res && res.data && res.data[0]) || null
  if (!u || u.isAdmin !== true) {
    throw new Error('无管理员权限')
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  try {
    const { action, data = {}, query = {} } = event || {}

    // 用户自助取消：无需管理员权限
    if (action === 'userCancel') {
      const coll = db.collection('exchange_records')
      const { id } = data
      if (!id) throw new Error('缺少记录ID')
      const recordRes = await coll.doc(id).get()
      const record = recordRes.data
      if (!record) throw new Error('记录不存在')
      if (record._openid !== OPENID) throw new Error('无权限取消他人兑换')
      if (record.status !== 'pending') throw new Error('仅待处理申请可取消')
      const points = record.pointsSpent || 0
      const qty = record.quantity || 1
      const productId = record.productId
      const userOpenid = record._openid
      await db.runTransaction(async (t) => {
        const userRes = await t.collection('users').where({ _openid: userOpenid }).limit(1).get()
        const user = userRes.data && userRes.data[0]
        if (!user) throw new Error('用户不存在')
        const productRes = await t.collection('products').doc(productId).get()
        const prod = productRes.data
        if (!prod) throw new Error('商品不存在')
        await t.collection('users').doc(user._id).update({ data: { totalPoints: db.command.inc(points), updateTime: db.serverDate() } })
        if (record.selectedSize && record.selectedSize.trim() !== '') {
          const sizeStocks = Object.assign({}, prod.sizeStocks || {})
          const sel = record.selectedSize
          const cur = Number(sizeStocks[sel]) || 0
          sizeStocks[sel] = cur + qty
          await t.collection('products').doc(productId).update({ data: { sizeStocks, stock: db.command.inc(qty), updateTime: db.serverDate() } })
        } else {
          await t.collection('products').doc(productId).update({ data: { stock: db.command.inc(qty), updateTime: db.serverDate() } })
        }
        await t.collection('exchange_records').doc(id).update({ data: { status: 'cancelled', updateTime: db.serverDate(), cancelTime: db.serverDate(), msgIsRead: false, msgReadTime: null } })
        await t.collection('point_records').add({ data: { _openid: userOpenid, type: 'refund', points: points, description: `取消兑换返还积分：${record.productName} x${qty}`, relatedId: id, submitTime: db.serverDate(), status: 'approved' } })
      })
      return { success: true }
    }

    await assertAdmin(OPENID)

    const coll = db.collection('exchange_records')

    if (action === 'list') {
      const { status = 'pending', limit = 50, skip = 0 } = query
      const where = status === 'all' ? {} : { status }
      const res = await coll.where(where).orderBy('updateTime', 'desc').skip(skip).limit(limit).get()
      
      // 关联用户信息，获取用户昵称
      const exchangeRecords = res.data || []
      const enrichedRecords = await Promise.all(exchangeRecords.map(async (record) => {
        try {
          // 如果记录中已经有userNickName且不为空，直接使用
          if (record.userNickName && record.userNickName.trim() !== '') {
            return record
          }
          
          // 根据_openid查询用户信息
          const userRes = await db.collection('users').where({ _openid: record._openid }).limit(1).get()
          const user = userRes.data && userRes.data[0]
          
          // 获取用户昵称，优先使用nickName，如果为空则使用_openid的后8位作为显示名
          let displayName = null
          if (user && user.nickName && user.nickName.trim() !== '') {
            displayName = user.nickName
          } else if (record._openid) {
            // 使用_openid的后8位作为显示名
            displayName = '用户' + record._openid.slice(-8)
          }
          
          return {
            ...record,
            userNickName: displayName,
            userAvatarUrl: user ? user.avatarUrl : null
          }
        } catch (error) {
          console.error('获取用户信息失败:', error)
          // 如果获取用户信息失败，使用_openid的后8位作为显示名
          const fallbackName = record._openid ? '用户' + record._openid.slice(-8) : '未知用户'
          return {
            ...record,
            userNickName: fallbackName,
            userAvatarUrl: null
          }
        }
      }))
      
      return { success: true, data: enrichedRecords }
    }

    if (action === 'ship') {
      const { id, company = '', trackingNumber = '' } = data
      if (!id) throw new Error('缺少记录ID')
      
      await coll.doc(id).update({ data: { status: 'shipped', 'logistics.company': company, 'logistics.trackingNumber': trackingNumber, shipTime: db.serverDate(), updateTime: db.serverDate(), msgIsRead: false, msgReadTime: null } })
      
      return { success: true }
    }

    if (action === 'complete') {
      const { id } = data
      if (!id) throw new Error('缺少记录ID')
      
      await coll.doc(id).update({ data: { status: 'completed', finishTime: db.serverDate(), updateTime: db.serverDate(), msgIsRead: false, msgReadTime: null } })
      
      return { success: true }
    }

    if (action === 'confirm') { // 当面兑换确认
      const { id } = data
      if (!id) throw new Error('缺少记录ID')
      
      await coll.doc(id).update({ data: { status: 'completed', finishTime: db.serverDate(), updateTime: db.serverDate(), msgIsRead: false, msgReadTime: null } })
      
      return { success: true }
    }

    if (action === 'cancel') {
      const { id } = data
      if (!id) throw new Error('缺少记录ID')
      // 读取记录
      const recordRes = await coll.doc(id).get()
      const record = recordRes.data
      if (!record) throw new Error('记录不存在')
      if (record.status !== 'pending') throw new Error('仅待处理申请可取消')
      const points = record.pointsSpent || 0
      const qty = record.quantity || 1
      const productId = record.productId
      const userOpenid = record._openid
      // 查用户与商品
      const userRes = await db.collection('users').where({ _openid: userOpenid }).limit(1).get()
      const user = userRes.data && userRes.data[0]
      if (!user) throw new Error('用户不存在')
      const productRes = await db.collection('products').doc(productId).get()
      if (!productRes.data) throw new Error('商品不存在')
      // 事务退款与回滚库存
      await db.runTransaction(async (t) => {
        await t.collection('users').doc(user._id).update({ data: { totalPoints: db.command.inc(points), updateTime: db.serverDate() } })
        // 回滚库存（支持尺码）
        if (record.selectedSize && record.selectedSize.trim() !== '') {
          const prodGet = await t.collection('products').doc(productId).get()
          const prod = prodGet.data || {}
          const sizeStocks = Object.assign({}, prod.sizeStocks || {})
          const sel = record.selectedSize
          const cur = Number(sizeStocks[sel]) || 0
          sizeStocks[sel] = cur + qty
          await t.collection('products').doc(productId).update({ data: { sizeStocks, stock: db.command.inc(qty), updateTime: db.serverDate() } })
        } else {
          await t.collection('products').doc(productId).update({ data: { stock: db.command.inc(qty), updateTime: db.serverDate() } })
        }
        await t.collection('exchange_records').doc(id).update({ data: { status: 'cancelled', updateTime: db.serverDate(), cancelTime: db.serverDate(), msgIsRead: false, msgReadTime: null } })
        // 增加积分返还记录
        await t.collection('point_records').add({ data: { _openid: userOpenid, type: 'refund', points: points, description: `取消兑换返还积分：${record.productName} x${qty}`, relatedId: id, submitTime: db.serverDate(), status: 'approved' } })
      })
      return { success: true }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('adminManageExchange failed', err)
    return { success: false, message: err.message || '操作失败' }
  }
}
