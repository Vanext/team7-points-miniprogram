// 云函数：管理会员兑换锁定状态
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
  const { action, data = {} } = event || {}

  try {
    // 准备相关集合（包含积分记录集合）
    await ensureCollections(['exchange_lock_logs', 'competition_records', 'point_records'])

    // 自动解锁检查允许非管理员调用（例如由积分提交流程触发）
    if (action === 'checkAndAutoUnlock') {
      const { userId } = data
      if (!userId) throw new Error('缺少用户ID')
      
      // 获取用户当前锁定状态
      const userRes = await db.collection('users').doc(userId).get()
      const user = userRes.data
      
      if (!user || !user.exchange_locked) {
        return { success: true, unlocked: false, reason: '用户未锁定或不存在' }
      }

      // 获取当前年份
      const now = new Date()
      const currentYear = now.getFullYear()
      const yearStart = new Date(currentYear, 0, 1)
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999)
      
      console.log(`检查用户 ${userId} 在 ${currentYear} 年的比赛参与情况，时间范围：${yearStart.toISOString()} - ${yearEnd.toISOString()}`)
      
      let hasTriathlonCompetitionThisYear = false
      // 当年缴费与正式会员校验（兼容数字/字符串年份）
      const isOfficialMember = user.isOfficialMember === true
      const paidYearsRaw = Array.isArray(user.membershipPaidYears) ? user.membershipPaidYears : []
      const paidYearsNormalized = paidYearsRaw
        .map(y => (typeof y === 'string' ? parseInt(y, 10) : y))
        .filter(y => Number.isFinite(y))
      const hasPaidThisYear = paidYearsNormalized.includes(currentYear) || paidYearsRaw.includes(String(currentYear))

      console.log('Membership debug', {
        isOfficialMember,
        membershipPaidYears: user.membershipPaidYears,
        paidYearsNormalized,
        hasPaidThisYear,
        currentYear
      })
      
      // 改为检查 point_records 集合，匹配当年、通过审核的铁人三项相关记录
      const pointsRes = await db.collection('point_records')
        .where({
          _openid: user._openid,
          submitTime: db.command.gte(yearStart).and(db.command.lte(yearEnd)),
          status: 'approved',
          points: db.command.gt(0),
          $or: [
            { categoryName: db.RegExp({ regexp: '大铁', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '70\\.3', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '铁人三项', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '标铁', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '标准铁人三项', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '半程标铁', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '奥运距离', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '奥运', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '标准距离', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '标距', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: '青少年短距离', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'ironman', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'triathlon', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'olympic', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'od', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'standard triathlon', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'sprint', options: 'i' }) },
            { categoryName: db.RegExp({ regexp: 'youth', options: 'i' }) },
            // 额外根据 raceTypeLabel 识别铁三（前端下拉框名称）
            { raceTypeLabel: db.RegExp({ regexp: '大铁', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '70\\.3', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '铁人三项', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '标铁', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '标准铁人三项', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '半程标铁', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '奥运距离', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '奥运', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '标准距离', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '标距', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: '青少年短距离', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'ironman', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'triathlon', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'olympic', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'od', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'standard triathlon', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'sprint', options: 'i' }) },
            { raceTypeLabel: db.RegExp({ regexp: 'youth', options: 'i' }) },
            // 直接根据记录中的比赛类型值匹配
            { raceType: db.command.in(['ironman', 'half_ironman', 'standard', 'half_standard', 'youth_sprint']) }
          ]
        })
        .get()
      
      console.log(`在 point_records 中找到 ${pointsRes.data.length} 条铁人三项相关积分记录`)
      if (pointsRes.data.length > 0) {
        const matches = pointsRes.data.map(r => ({
          categoryName: r.categoryName,
          raceTypeLabel: r.raceTypeLabel,
          raceType: r.raceType,
          description: r.description,
          submitTime: r.submitTime,
          points: r.points
        }))
        console.log('Triathlon points records debug:', matches)
      }
      
      if (pointsRes.data.length > 0) {
        hasTriathlonCompetitionThisYear = true
        const competitionDetails = pointsRes.data.map(record => ({
          categoryName: record.categoryName,
          points: record.points,
          submitTime: record.submitTime,
          description: record.description || ''
        }))
        console.log('铁人三项比赛详情：', competitionDetails)
      }
      
      // 备用：检查 competition_records 集合
      if (!hasTriathlonCompetitionThisYear) {
        const competitionQuery = await db.collection('competition_records')
          .where({
            userId: userId,
            competitionDate: db.command.gte(yearStart).and(db.command.lte(yearEnd)),
            status: 'completed',
            $or: [
              { competitionType: db.RegExp({ regexp: '铁人三项', options: 'i' }) },
              { competitionType: db.RegExp({ regexp: 'ironman', options: 'i' }) },
              { competitionType: db.RegExp({ regexp: 'triathlon', options: 'i' }) }
            ]
          })
          .get()
        
        if (competitionQuery.data.length > 0) {
          hasTriathlonCompetitionThisYear = true
          console.log(`在 competition_records 中找到 ${competitionQuery.data.length} 条铁人三项比赛记录`)
        }
      }
 
      if (hasTriathlonCompetitionThisYear && isOfficialMember && hasPaidThisYear) {
        await db.collection('users').doc(userId).update({
          data: {
            exchange_locked: false,
            lock_reason: '',
            locked_at: null,
            locked_by_admin_id: '',
            auto_unlock_date: null,
            last_competition_date: db.serverDate(),
            competition_participation_count: db.command.inc(1)
          }
        })
        
        await db.collection('exchange_lock_logs').add({
          data: {
            user_id: userId,
            action: 'unlock',
            reason: `用户参加${currentYear}年铁人三项比赛，自动解锁`,
            performed_by_admin_id: 'system',
            created_at: db.serverDate(),
            competition_year: currentYear
          }
        })
        
        console.log(`用户 ${userId} 已自动解锁：参加了${currentYear}年铁人三项比赛`)
        return { success: true, unlocked: true, reason: `正式会员且当年缴费并参加${currentYear}年铁人三项，自动解锁` }
      }

      const reason = !isOfficialMember
        ? '非正式会员，无法自动解锁'
        : (!hasPaidThisYear
          ? `当年未缴费，无法自动解锁`
          : `用户未参加${currentYear}年铁人三项比赛`)
      console.log(`用户 ${userId} 自动解锁失败：${reason}`)
      return { success: true, unlocked: false, reason }
    }

    // 其他操作需要管理员权限
    const adminUser = await assertAdmin(OPENID)

    if (action === 'lockUser') {
      const { userId, reason = '', autoUnlockAfterCompetition = true } = data
      if (!userId) throw new Error('缺少用户ID')
      
      // 获取用户信息
      const userRes = await db.collection('users').doc(userId).get()
      if (!userRes.data) throw new Error('用户不存在')
      
      const user = userRes.data
      
      // 如果用户已经被锁定，直接返回
      if (user.exchange_locked) {
        return { success: true, message: '用户已被锁定', data: { alreadyLocked: true } }
      }
      
      // 更新用户锁定状态
      const updateData = {
        exchange_locked: true,
        lock_reason: reason,
        locked_at: db.serverDate(),
        locked_by_admin_id: adminUser._id
      }
      
      if (autoUnlockAfterCompetition) {
        // 设置自动解锁条件（参与比赛后解锁）
        updateData.auto_unlock_date = null // 将在参与比赛时自动解锁
      }
      
      await db.collection('users').doc(userId).update({ data: updateData })
      
      // 记录锁定日志
      await db.collection('exchange_lock_logs').add({
        data: {
          user_id: userId,
          action: 'lock',
          reason: reason,
          performed_by_admin_id: adminUser._id,
          auto_unlock_after_competition: autoUnlockAfterCompetition,
          created_at: db.serverDate()
        }
      })
      
      return { 
        success: true, 
        message: '用户兑换权限已锁定',
        data: { 
          userId, 
          locked: true, 
          reason,
          autoUnlockAfterCompetition 
        }
      }
    }

    if (action === 'unlockUser') {
      const { userId, reason = '' } = data
      if (!userId) throw new Error('缺少用户ID')
      
      // 获取用户信息
      const userRes = await db.collection('users').doc(userId).get()
      if (!userRes.data) throw new Error('用户不存在')
      
      const user = userRes.data
      
      // 如果用户未被锁定，直接返回
      if (!user.exchange_locked) {
        return { success: true, message: '用户未被锁定', data: { alreadyUnlocked: true } }
      }
      
      // 更新用户解锁状态
      await db.collection('users').doc(userId).update({
        data: {
          exchange_locked: false,
          lock_reason: '',
          locked_at: null,
          locked_by_admin_id: '',
          auto_unlock_date: null
        }
      })
      
      // 记录解锁日志
      await db.collection('exchange_lock_logs').add({
        data: {
          user_id: userId,
          action: 'unlock',
          reason: reason,
          performed_by_admin_id: adminUser._id,
          created_at: db.serverDate()
        }
      })
      
      return { 
        success: true, 
        message: '用户兑换权限已解锁',
        data: { userId, unlocked: true, reason }
      }
    }

    if (action === 'getLockStatus') {
      const { userId } = data
      if (!userId) throw new Error('缺少用户ID')
      
      // 获取用户锁定状态
      const userRes = await db.collection('users').doc(userId).get()
      if (!userRes.data) throw new Error('用户不存在')
      
      const user = userRes.data
      
      return {
        success: true,
        data: {
          exchange_locked: user.exchange_locked || false,
          lock_reason: user.lock_reason || '',
          locked_at: user.locked_at,
          locked_by_admin_id: user.locked_by_admin_id || '',
          competition_participation_count: user.competition_participation_count || 0,
          last_competition_date: user.last_competition_date
        }
      }
    }

    if (action === 'getLockLogs') {
      const { userId, limit = 50, skip = 0 } = data
      if (!userId) throw new Error('缺少用户ID')
      
      const logs = await db.collection('exchange_lock_logs')
        .where({ user_id: userId })
        .orderBy('created_at', 'desc')
        .skip(skip)
        .limit(limit)
        .get()
      
      // 获取管理员信息
      const adminIds = [...new Set(logs.data.map(log => log.performed_by_admin_id).filter(Boolean))]
      const adminMap = {}
      
      if (adminIds.length > 0) {
        const adminRes = await db.collection('users')
          .where({ _id: db.command.in(adminIds) })
          .get()
        
        adminRes.data.forEach(admin => {
          adminMap[admin._id] = admin.nickName || '管理员'
        })
      }
      
      const logsWithAdminNames = logs.data.map(log => ({
        ...log,
        admin_name: adminMap[log.performed_by_admin_id] || '管理员'
      }))
      
      return {
        success: true,
        data: logsWithAdminNames
      }
    }

    // 原 checkAndAutoUnlock 分支已提升并允许非管理员调用

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('manageExchangeLock failed:', err)
    return { success: false, message: err.message || '操作失败' }
  }
}