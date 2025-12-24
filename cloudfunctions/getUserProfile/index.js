const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { userId } = event
  
  if (!userId) {
    return {
      success: false,
      message: '用户ID不能为空'
    }
  }

  try {
    // 获取用户基本信息
    const userResult = await db.collection('users').where({
      _openid: userId
    }).get()

    if (userResult.data.length === 0) {
      return {
        success: false,
        message: '用户不存在'
      }
    }

    const userInfo = userResult.data[0]

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

    let normalizedUser = { ...userInfo }
    if (userInfo.isOfficialMember === true) {
      if (isExpired(userInfo.officialMemberUntil)) {
        await db.collection('users').doc(userInfo._id).update({
          data: {
            isOfficialMember: false,
            updateTime: db.serverDate()
          }
        })
        normalizedUser.isOfficialMember = false
        normalizedUser.officialMemberUntil = null
      } else if (!userInfo.officialMemberUntil) {
        const oneYearMs = 365 * 24 * 60 * 60 * 1000
        const until = new Date(Date.now() + oneYearMs)
        const since = userInfo.officialMemberSince || userInfo.joinDate || userInfo.createTime || db.serverDate()
        await db.collection('users').doc(userInfo._id).update({
          data: {
            officialMemberSince: since,
            officialMemberUntil: until,
            updateTime: db.serverDate()
          }
        })
        normalizedUser.officialMemberSince = since
        normalizedUser.officialMemberUntil = until
      }
    }

    const effectiveOfficial = normalizedUser.isOfficialMember === true && !isExpired(normalizedUser.officialMemberUntil)
    const exchangeLocked = normalizedUser.exchange_locked === true
    const isExchangeActivated = effectiveOfficial && !exchangeLocked

    // 获取用户的积分记录（参赛历史）
    // 注意：集合名称是 point_records，不是 points
    const pointsResult = await db.collection('point_records').where({
      _openid: userId,
      status: 'approved' // 只获取审核通过的记录
    }).orderBy('submitTime', 'desc').get() // 使用 submitTime 排序

    // 处理参赛历史数据
    const participationHistory = pointsResult.data.map(record => {
      const submitTime = new Date(record.submitTime)
      const year = submitTime.getFullYear()
      
      // 优先使用 description，如果没有则使用 categoryName
      const eventName = record.description || record.categoryName || '积分获得'
      const eventTypeSource = (record.categoryName || '') + ' ' + (record.description || '') + ' ' + (record.raceTypeLabel || '')
      
      return {
        id: record._id,
        eventName: eventName,
        date: `${submitTime.getMonth() + 1}月${submitTime.getDate()}日`,
        year: year,
        points: record.points,
        eventType: getEventType(eventTypeSource),
        // 如果有formData里的比赛时间，优先使用，否则模拟
        completionTime: record.formData && record.formData.finishTime ? record.formData.finishTime : generateMockTime(),
        segments: generateMockSegments(eventTypeSource) // 模拟分段成绩
      }
    })

    // 按年份统计
    const yearlyStats = {}
    participationHistory.forEach(record => {
      if (!yearlyStats[record.year]) {
        yearlyStats[record.year] = {
          count: 0,
          totalPoints: 0
        }
      }
      yearlyStats[record.year].count++
      yearlyStats[record.year].totalPoints += record.points
    })

    return {
      success: true,
      data: {
        userInfo: {
          ...normalizedUser,
          totalPoints: normalizedUser.totalPoints || 0,
          pointsCount: pointsResult.data.length,
          // 添加锁定状态信息
          exchange_locked: exchangeLocked,
          lock_reason: normalizedUser.lock_reason || null,
          locked_at: normalizedUser.locked_at || null,
          locked_by_admin_id: normalizedUser.locked_by_admin_id || null,
          // 会员相关字段回传
          isOfficialMember: effectiveOfficial,
          officialMemberSince: normalizedUser.officialMemberSince || null,
          officialMemberUntil: normalizedUser.officialMemberUntil || null,
          isExchangeActivated,
          competition_participation_count: normalizedUser.competition_participation_count || 0,
          last_competition_date: normalizedUser.last_competition_date || null
        },
        participationHistory,
        yearlyStats
      }
    }

  } catch (error) {
    console.error('获取用户档案失败:', error)
    return {
      success: false,
      message: '服务器错误，请稍后重试'
    }
  }
}

// 根据积分原因推断比赛类型
function getEventType(source) {
  if (!source) return '其他'
  
  const sourceLower = source.toLowerCase()
  if (sourceLower.includes('铁人三项') || sourceLower.includes('triathlon') || sourceLower.includes('ironman') || sourceLower.includes('标铁') || sourceLower.includes('大铁')) {
    return '铁人三项'
  } else if (sourceLower.includes('游泳') || sourceLower.includes('swim')) {
    return '游泳'
  } else if (sourceLower.includes('跑步') || sourceLower.includes('run') || sourceLower.includes('马拉松')) {
    return '跑步'
  } else if (sourceLower.includes('骑行') || sourceLower.includes('bike') || sourceLower.includes('cycling')) {
    return '骑行'
  } else if (sourceLower.includes('训练')) {
    return '日常训练'
  }
  return '其他'
}

// 生成模拟比赛时间
function generateMockTime() {
  const hours = Math.floor(Math.random() * 3) + 2 // 2-4小时
  const minutes = Math.floor(Math.random() * 60)
  const seconds = Math.floor(Math.random() * 60)
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

// 生成模拟分段成绩
function generateMockSegments(source) {
  const eventType = getEventType(source)
  
  if (eventType === '铁人三项') {
    return [
      {
        type: 'swim',
        name: '游泳 1.5km',
        time: `${Math.floor(Math.random() * 20) + 25}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`
      },
      {
        type: 'bike',
        name: '骑行 40km',
        time: `${Math.floor(Math.random() * 30) + 60}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`
      },
      {
        type: 'run',
        name: '跑步 10km',
        time: `${Math.floor(Math.random() * 20) + 40}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`
      }
    ]
  }
  
  return null
}
