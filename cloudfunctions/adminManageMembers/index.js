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
  const roles = (u && (u.roles || [])) || []
  const role = u && (u.role || '')
  const flags = [u && u.isAdmin === true, u && u.admin === true, u && u.isSuperAdmin === true, Array.isArray(roles) && roles.includes('admin'), role === 'admin']
  const isAdmin = flags.some(Boolean)
  if (!u || !isAdmin) {
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

    const nowTs = Date.now()
    const toTs = (v) => {
      if (!v) return 0
      if (v instanceof Date) return v.getTime()
      if (typeof v === 'number') return v
      if (typeof v === 'string') {
        const t = new Date(v).getTime()
        return Number.isFinite(t) ? t : 0
      }
      if (v && typeof v === 'object') {
        if (v.$date) {
          const t = new Date(v.$date).getTime()
          return Number.isFinite(t) ? t : 0
        }
        if (v.time) {
          const t = new Date(v.time).getTime()
          return Number.isFinite(t) ? t : 0
        }
      }
      return 0
    }
    const isExpired = (until) => {
      const ts = toTs(until)
      return ts > 0 && ts <= nowTs
    }

    if (action === 'list') {
      const { keyword = '', limit = 50, skip = 0, sortField = 'totalPoints', sortOrder = 'desc' } = query
      const coll = db.collection('users')
      // 基于关键字在昵称或 openid 上做模糊匹配
      let where = {}
      if (keyword && keyword.trim()) {
        const k = keyword.trim()
        where = db.command.or([
          { nickName: db.RegExp({ regexp: k, options: 'i' }) },
          { _openid: db.RegExp({ regexp: k, options: 'i' }) }
        ])
      }
      
      // 构建排序
      // 默认按积分倒序，如果积分相同按更新时间倒序
      let queryRef = coll.where(where)
      
      if (sortField === 'nickName') {
         // 按昵称排序
         queryRef = queryRef.orderBy('nickName', sortOrder).orderBy('updateTime', 'desc')
      } else {
         // 默认按积分
         queryRef = queryRef.orderBy('totalPoints', sortOrder).orderBy('updateTime', 'desc')
      }
      
      const res = await queryRef.skip(skip).limit(limit).get()
      const list = res.data || []

      const expiredIds = list
        .filter(u => u && u.isOfficialMember === true && isExpired(u.officialMemberUntil))
        .map(u => u._id)
        .filter(Boolean)
      if (expiredIds.length) {
        await Promise.all(expiredIds.map(id => db.collection('users').doc(id).update({
          data: {
            isOfficialMember: false,
            updateTime: db.serverDate()
          }
        })))
      }

      const missingUntilUsers = list
        .filter(u => u && u.isOfficialMember === true && !u.officialMemberUntil && !isExpired(u.officialMemberUntil))
        .filter(u => u && u._id)

      if (missingUntilUsers.length) {
        const oneYearMs = 365 * 24 * 60 * 60 * 1000
        const untilDate = new Date(Date.now() + oneYearMs)
        await Promise.all(missingUntilUsers.map(u => db.collection('users').doc(u._id).update({
          data: {
            officialMemberSince: u.officialMemberSince || u.joinDate || u.createTime || db.serverDate(),
            officialMemberUntil: untilDate,
            updateTime: db.serverDate()
          }
        })))
      }

      const normalized = list.map(u => {
        const effectiveOfficial = u && u.isOfficialMember === true && !isExpired(u.officialMemberUntil)
        const activated = effectiveOfficial && u.exchange_locked !== true
        return {
          ...u,
          isOfficialMember: !!effectiveOfficial,
          isExchangeActivated: !!activated
        }
      })

      return { success: true, data: normalized }
    }

    if (action === 'normalizeMembership') {
      const { limit = 200 } = query
      const batchLimit = Math.max(1, Math.min(500, Number(limit) || 200))
      const coll = db.collection('users')

      let updated = 0
      let expired = 0
      let processed = 0

      const res = await coll.where({ isOfficialMember: true }).orderBy('updateTime', 'desc').limit(batchLimit).get()
      const users = res.data || []

      const oneYearMs = 365 * 24 * 60 * 60 * 1000
      const untilDate = new Date(Date.now() + oneYearMs)

      await Promise.all(users.map(async (u) => {
        if (!u || !u._id) return
        processed += 1
        if (isExpired(u.officialMemberUntil)) {
          expired += 1
          await db.collection('users').doc(u._id).update({
            data: {
              isOfficialMember: false,
              updateTime: db.serverDate()
            }
          })
          return
        }

        if (!u.officialMemberUntil) {
          updated += 1
          await db.collection('users').doc(u._id).update({
            data: {
              officialMemberSince: u.officialMemberSince || u.joinDate || u.createTime || db.serverDate(),
              officialMemberUntil: untilDate,
              updateTime: db.serverDate()
            }
          })
        }
      }))

      return { success: true, data: { processed, updated, expired } }
    }

    // 设置会员状态（管理员手动标记正式会员，有效期 1 年）
    if (action === 'setMembership') {
      const { id, isOfficialMember, officialMemberUntil } = data
      if (!id) throw new Error('缺少用户ID')

      // 获取用户信息
      const userDoc = await db.collection('users').doc(id).get()
      if (!userDoc.data) throw new Error('用户不存在')
      const u = userDoc.data

      const updateData = { updateTime: db.serverDate() }
      if (typeof isOfficialMember === 'boolean') {
        if (isOfficialMember) {
          let until
          if (officialMemberUntil) {
            if (typeof officialMemberUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(officialMemberUntil)) {
              until = new Date(`${officialMemberUntil}T23:59:59.999+08:00`)
            } else {
              until = new Date(officialMemberUntil)
            }
            if (!Number.isFinite(until.getTime())) throw new Error('到期日期格式不正确')
            if (until.getTime() <= nowTs) throw new Error('到期日期需晚于今天')
          } else {
            const oneYearMs = 365 * 24 * 60 * 60 * 1000
            until = new Date(Date.now() + oneYearMs)
          }
          updateData.isOfficialMember = true
          updateData.officialMemberSince = u.officialMemberSince || db.serverDate()
          updateData.officialMemberUntil = until
          updateData.officialMemberSetBy = adminUser._id
          if (u.exchange_locked !== false) {
            updateData.exchange_locked = true
          }
          await db.collection('users').doc(id).update({ data: updateData })
          return { success: true, data: { isOfficialMember: true, officialMemberUntil: until, exchange_locked: updateData.exchange_locked } }
        }

        updateData.isOfficialMember = false
        updateData.officialMemberSince = null
        updateData.officialMemberUntil = null
        updateData.officialMemberSetBy = ''
        await db.collection('users').doc(id).update({ data: updateData })
        return { success: true, data: { isOfficialMember: false } }
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

    if (action === 'setExchangeLock') {
      const { id, lock } = data
      if (!id || typeof lock !== 'boolean') throw new Error('参数错误')

      const userDoc = await db.collection('users').doc(id).get()
      const u = userDoc && userDoc.data
      if (!u) throw new Error('用户不存在')

      if (u.isOfficialMember === true && isExpired(u.officialMemberUntil)) {
        await db.collection('users').doc(id).update({ data: { isOfficialMember: false, updateTime: db.serverDate() } })
        throw new Error('正式会员已到期，请先重新设为正式会员')
      }

      if (!lock && u.isOfficialMember !== true) {
        throw new Error('需先设为正式会员才可解锁兑换权限')
      }
      
      const updateData = {
        exchange_locked: lock,
        updateTime: db.serverDate()
      }
      
      if (lock) {
        updateData.locked_at = db.serverDate()
        updateData.locked_by_admin_id = OPENID
      } else {
        updateData.locked_at = null
        updateData.locked_by_admin_id = null
      }

      await db.collection('users').doc(id).update({ 
        data: updateData
      })
      return { success: true, data: { exchange_locked: lock } }
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
      const { skip = 0, limit = 200 } = query
      const usersColl = db.collection('users')
      const usersRes = await usersColl.orderBy('updateTime', 'desc').skip(skip).limit(Math.max(1, Math.min(500, limit))).get()
      const users = usersRes.data || []

      const openids = users.map(u => u._openid).filter(Boolean)
      let countMap = {}
      if (openids.length) {
        try {
          const _ = db.command
          const $ = db.command.aggregate
          const aggregateRes = await db.collection('point_records')
            .aggregate()
            .match({ status: 'approved', points: _.gt(0), _openid: _.in(openids) })
            .group({ _id: '$_openid', pointsCount: $.sum(1) })
            .end()
          const list = (aggregateRes && aggregateRes.list) || []
          for (const it of list) { countMap[it._id] = it.pointsCount || 0 }
        } catch (e) {
          countMap = {}
        }
      }

      const exportData = users.map(user => ({
        _id: user._id,
        _openid: user._openid,
        openid: user.openid,
        nickName: user.nickName,
        totalPoints: user.totalPoints || 0,
        isActivated: user.isActivated || false,
        isAdmin: user.isAdmin || false,
        createTime: user.createTime,
        lastActiveTime: user.lastActiveTime || user.updateTime,
        pointsCount: countMap[user._openid] || 0,
        exchange_locked: user.exchange_locked || false,
        lock_reason: user.lock_reason || null,
        locked_at: user.locked_at || null,
        locked_by_admin_id: user.locked_by_admin_id || null,
        competition_participation_count: user.competition_participation_count || 0,
        last_competition_date: user.last_competition_date || null
      }))

      const nextSkip = skip + users.length
      const hasMore = users.length === Math.max(1, Math.min(500, limit))
      return { success: true, data: exportData, nextSkip, hasMore }
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
