// 云函数：管理员管理成员（鉴权 + 查询 + 权限调整 + 积分调整）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function ensureCollections(names = []) {
  for (const name of names) {
    try { await db.createCollection(name) } catch (e) { /* ignore if exists */ }
  }
}

async function assertAdmin(openId) {
  const res = await db.collection('users').where({ _openid: openId }).limit(1).get()
  const u = (res && res.data && res.data[0]) || null
  if (!u || u.isAdmin !== true) {
    throw new Error('无管理员权限')
  }
  return u
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {}, query = {} } = event || {}

  try {
    await ensureCollections(['point_records'])
    const adminUser = await assertAdmin(OPENID)

    if (action === 'list') {
      const { keyword = '', limit = 50, skip = 0 } = query
      const coll = db.collection('users')
      // 基于关键字在昵称或 openid 上做模糊匹配（小程序端可进一步筛选）
      let where = {}
      if (keyword && keyword.trim()) {
        const k = keyword.trim()
        where = db.command.or([
          { nickName: db.RegExp({ regexp: k, options: 'i' }) },
          { _openid: db.RegExp({ regexp: k, options: 'i' }) }
        ])
      }
      const res = await coll.where(where).orderBy('updateTime', 'desc').skip(skip).limit(limit).get()
      return { success: true, data: res.data }
    }

    // 新增：设置会员状态与缴费年度
    if (action === 'setMembership') {
      const { id, isOfficialMember, paidYear } = data
      if (!id) throw new Error('缺少用户ID')

      // 获取用户信息
      const userDoc = await db.collection('users').doc(id).get()
      if (!userDoc.data) throw new Error('用户不存在')
      const u = userDoc.data

      const updateData = { updateTime: db.serverDate() }
      if (typeof isOfficialMember === 'boolean') {
        updateData.isOfficialMember = isOfficialMember
      }
      if (typeof paidYear === 'number' && paidYear > 2000) {
        const years = Array.isArray(u.membershipPaidYears) ? u.membershipPaidYears.slice() : []
        if (!years.includes(paidYear)) years.push(paidYear)
        updateData.membershipPaidYears = years
      }

      await db.collection('users').doc(id).update({ data: updateData })
      return { success: true }
    }

    if (action === 'setAdmin') {
      const { id, isAdmin } = data
      if (!id || typeof isAdmin !== 'boolean') throw new Error('参数错误')
      await db.collection('users').doc(id).update({ data: { isAdmin, updateTime: db.serverDate() } })
      return { success: true }
    }

    if (action === 'updatePoints') {
      const { id, delta = 0, reason = '' } = data
      if (!id) throw new Error('缺少用户ID')
      const userDoc = await db.collection('users').doc(id).get()
      if (!userDoc.data) throw new Error('用户不存在')
      const u = userDoc.data
      const current = Number(u.totalPoints || 0)
      let d = Number(delta)
      if (!Number.isFinite(d) || d === 0) throw new Error('调整值必须为非零数字')

      // 支持负积分，但限制最低为-8000分
      let newPoints = current + d
      let applied = d
      
      // 检查是否超出最低积分限制
      if (newPoints < -8000) {
        applied = -8000 - current
        newPoints = -8000
      }

      // 事务：更新积分 + 记录积分调整
      await db.runTransaction(async (transaction) => {
        await transaction.collection('users').doc(id).update({
          data: { totalPoints: newPoints, updateTime: db.serverDate() }
        })
        const record = {
          _openid: u._openid,
          type: 'adjust',
          points: applied,
          description: `管理员调整积分：${applied > 0 ? '+' : ''}${applied}${reason ? ('（' + reason + '）') : ''}`,
          relatedId: id,
          submitTime: db.serverDate(),
          status: 'approved',
          adminOpenid: OPENID
        }
        await transaction.collection('point_records').add({ data: record })
      })

      return { success: true, data: { newPoints, applied } }
    }

    if (action === 'setPoints') {
      const { id, openid, points } = data
      if (!id && !openid) throw new Error('缺少用户标识')
      // 支持负积分，但限制最低为-8000分
      if (typeof points !== 'number' || points < -8000) throw new Error('积分值不能低于-8000分')
      
      let userDoc
      if (id) {
        userDoc = await db.collection('users').doc(id).get()
      } else {
        const res = await db.collection('users').where({ _openid: openid }).limit(1).get()
        if (res.data.length === 0) throw new Error('用户不存在')
        userDoc = { data: res.data[0] }
      }
      
      if (!userDoc.data) throw new Error('用户不存在')
      const u = userDoc.data
      const current = Number(u.totalPoints || 0)
      const newPoints = Number(points)
      const delta = newPoints - current

      // 事务：更新积分 + 记录积分调整
      await db.runTransaction(async (transaction) => {
        const docId = id || u._id
        await transaction.collection('users').doc(docId).update({
          data: { totalPoints: newPoints, updateTime: db.serverDate() }
        })
        const record = {
          _openid: u._openid,
          type: 'adjust',
          points: delta,
          description: `管理员设置积分：从${current}设置为${newPoints}`,
          relatedId: docId,
          submitTime: db.serverDate(),
          status: 'approved',
          adminOpenid: OPENID
        }
        await transaction.collection('point_records').add({ data: record })
      })

      return { success: true, data: { newPoints, delta, oldPoints: current } }
    }

    if (action === 'exportData') {
      // 获取所有用户数据用于导出
      const usersRes = await db.collection('users').get()
      const users = usersRes.data || []
      
      // 获取每个用户的积分记录统计
      const exportData = []
      
      for (const user of users) {
        // 统计用户积分获得次数
        const pointsRecordsRes = await db.collection('point_records')
          .where({
            _openid: user._openid,
            status: 'approved',
            points: db.command.gt(0)
          })
          .count()
        
        const pointsCount = pointsRecordsRes.total || 0
        
        exportData.push({
          _id: user._id,
          _openid: user._openid,
          openid: user.openid,
          nickName: user.nickName,
          totalPoints: user.totalPoints || 0,
          isActivated: user.isActivated || false,
          isAdmin: user.isAdmin || false,
          createTime: user.createTime,
          lastActiveTime: user.lastActiveTime || user.updateTime,
          pointsCount: pointsCount,
          // 添加锁定状态信息
          exchange_locked: user.exchange_locked || false,
          lock_reason: user.lock_reason || null,
          locked_at: user.locked_at || null,
          locked_by_admin_id: user.locked_by_admin_id || null,
          competition_participation_count: user.competition_participation_count || 0,
          last_competition_date: user.last_competition_date || null
        })
      }
      
      return { success: true, data: exportData }
    }

    if (action === 'getLockStatus') {
      const { id } = data
      if (!id) throw new Error('缺少用户ID')
      
      const userDoc = await db.collection('users').doc(id).get()
      if (!userDoc.data) throw new Error('用户不存在')
      
      const user = userDoc.data
      return { 
        success: true, 
        data: {
          exchange_locked: user.exchange_locked || false,
          lock_reason: user.lock_reason || null,
          locked_at: user.locked_at || null,
          locked_by_admin_id: user.locked_by_admin_id || null,
          competition_participation_count: user.competition_participation_count || 0,
          last_competition_date: user.last_competition_date || null
        }
      }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('adminManageMembers failed', err)
    return { success: false, message: err.message || '操作失败' }
  }
}