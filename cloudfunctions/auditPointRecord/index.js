// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 审核积分记录
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    // 检查管理员权限
    const adminCheck = await db.collection('users').where({
      _openid: openid,
      isAdmin: true
    }).get()
    
    if (adminCheck.data.length === 0) {
      return {
        success: false,
        message: '权限不足'
      }
    }
    
    // 获取参数
    const { recordId, status, reason = '' } = event
    if (!recordId || !status) {
      return {
        success: false,
        message: '参数错误'
      }
    }
    
    // 检查状态是否有效
    if (status !== 'approved' && status !== 'rejected') {
      return {
        success: false,
        message: '状态参数无效'
      }
    }
    
    // 获取记录信息
    const recordResult = await db.collection('point_records').doc(recordId).get()
    if (!recordResult.data) {
      return {
        success: false,
        message: '记录不存在'
      }
    }
    
    const record = recordResult.data
    
    // 检查记录状态 - 支持半自动审核模式下的状态变更
    const validTransitions = {
      'pending': ['approved', 'rejected'],
      'approved': ['rejected'], // 已通过的可以被取消（拒绝）
      'rejected': ['approved']  // 已拒绝的可以重新通过
    }
    
    if (!validTransitions[record.status] || !validTransitions[record.status].includes(status)) {
      return {
        success: false,
        message: '无效的状态转换'
      }
    }
    
    // 更新记录状态
    const updateData = {
      status,
      auditTime: db.serverDate(),
      auditorId: openid,
      msgIsRead: false,
      msgReadTime: null
    }
    
    // 如果是拒绝，添加拒绝原因
    if (status === 'rejected') {
      updateData.rejectReason = reason
    }
    
    // 处理积分变更逻辑
    if (status === 'approved' && record.status !== 'approved') {
      // 从其他状态变为通过：增加积分
      await db.collection('users').where({
        _openid: record._openid
      }).update({
        data: {
          totalPoints: db.command.inc(record.points)
        }
      })

      // 维护训练统计字段（周/月累计时长）
      try {
        const isTraining = ['training', 'camp'].includes(record.category) || 
                          ['training', 'camp'].includes(record.categoryId) || 
                          (record.formData && ['training', 'camp'].includes(record.formData.category))
        
        if (isTraining) {
          // 计算训练时长（小时）
          let hours = 0
          if (typeof record.selectedHours === 'number' && record.selectedHours > 0) {
            hours = record.selectedHours
          } else if (typeof record.actual_minutes === 'number' && record.actual_minutes > 0) {
            hours = Math.round((record.actual_minutes / 60) * 100) / 100
          } else {
            hours = Math.round((record.points / 2) * 100) / 100
          }

          // 取记录日期（优先表单日期，其次提交时间）
          let d = null
          if (record.date) {
            d = new Date(record.date.replace(/-/g, '/'))
          }
          if (!d || isNaN(d.getTime())) {
            d = record.submitTime ? new Date(record.submitTime) : new Date()
          }

          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          // 简化周次：年内第几周（周一为一周起点）
          const weekKey = (() => {
            const t = new Date(d.getTime())
            const day = (t.getDay() + 6) % 7
            t.setDate(t.getDate() - day + 3)
            const firstThursday = new Date(t.getFullYear(), 0, 4)
            const diff = t - firstThursday
            const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000))
            return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`
          })()

          // 更新用户 trainingStats
          const userRes = await db.collection('users').where({ _openid: record._openid }).limit(1).get()
          if (userRes.data && userRes.data[0]) {
            const u = userRes.data[0]
            const stats = u.trainingStats || { totalHours: 0, byMonth: {}, byWeek: {} }
            stats.totalHours = (stats.totalHours || 0) + hours
            stats.byMonth = stats.byMonth || {}
            stats.byWeek = stats.byWeek || {}
            stats.byMonth[monthKey] = (stats.byMonth[monthKey] || 0) + hours
            stats.byWeek[weekKey] = (stats.byWeek[weekKey] || 0) + hours

            await db.collection('users').doc(u._id).update({ data: { trainingStats: stats } })
          }
        }
      } catch (statsErr) {
        console.error('维护训练统计字段失败', statsErr)
      }
      
      // 审核通过后触发自动解锁检查（当年铁人三项参赛满足条件时自动解锁）
      try {
        // 兼容旧记录缺少 userId 的情况，使用 _openid 回查用户 _id
        let targetUserId = record.userId
        if (!targetUserId) {
          const userRes = await db.collection('users').where({ _openid: record._openid }).get()
          targetUserId = userRes.data && userRes.data[0] ? userRes.data[0]._id : ''
        }
        
        if (targetUserId) {
          const unlockRes = await cloud.callFunction({
            name: 'manageExchangeLock',
            data: {
              action: 'checkAndAutoUnlock',
              data: { userId: targetUserId }
            }
          })
          console.log('Auto unlock check after approval', {
            recordId,
            userId: targetUserId,
            unlockResult: unlockRes && unlockRes.result ? unlockRes.result : null
          })
        } else {
          console.warn('Auto unlock skipped: userId not found', { recordId, openid: record._openid })
        }
      } catch (unlockError) {
        console.error('Auto unlock check failed after approval', unlockError)
        // 不影响审核主流程
      }
    } else if (status === 'rejected' && record.status === 'approved') {
      // 从通过变为拒绝：扣除积分（取消已通过的积分）
      await db.collection('users').where({
        _openid: record._openid
      }).update({
        data: {
          totalPoints: db.command.inc(-record.points)
        }
      })

      // 回滚训练统计字段
      try {
        const isTraining = ['training', 'camp'].includes(record.category) || 
                          ['training', 'camp'].includes(record.categoryId) || 
                          (record.formData && ['training', 'camp'].includes(record.formData.category))
        
        if (isTraining) {
          let hours = 0
          if (typeof record.selectedHours === 'number' && record.selectedHours > 0) {
            hours = record.selectedHours
          } else if (typeof record.actual_minutes === 'number' && record.actual_minutes > 0) {
            hours = Math.round((record.actual_minutes / 60) * 100) / 100
          } else {
            hours = Math.round((record.points / 2) * 100) / 100
          }

          let d = null
          if (record.date) {
            d = new Date(record.date.replace(/-/g, '/'))
          }
          if (!d || isNaN(d.getTime())) {
            d = record.submitTime ? new Date(record.submitTime) : new Date()
          }
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          const weekKey = (() => {
            const t = new Date(d.getTime())
            const day = (t.getDay() + 6) % 7
            t.setDate(t.getDate() - day + 3)
            const firstThursday = new Date(t.getFullYear(), 0, 4)
            const diff = t - firstThursday
            const week = 1 + Math.round(diff / (7 * 24 * 3600 * 1000))
            return `${t.getFullYear()}-W${String(week).padStart(2, '0')}`
          })()

          const userRes = await db.collection('users').where({ _openid: record._openid }).limit(1).get()
          if (userRes.data && userRes.data[0]) {
            const u = userRes.data[0]
            const stats = u.trainingStats || { totalHours: 0, byMonth: {}, byWeek: {} }
            stats.totalHours = Math.max(0, (stats.totalHours || 0) - hours)
            stats.byMonth = stats.byMonth || {}
            stats.byWeek = stats.byWeek || {}
            stats.byMonth[monthKey] = Math.max(0, (stats.byMonth[monthKey] || 0) - hours)
            stats.byWeek[weekKey] = Math.max(0, (stats.byWeek[weekKey] || 0) - hours)

            await db.collection('users').doc(u._id).update({ data: { trainingStats: stats } })
          }
        }
      } catch (statsErr) {
        console.error('回滚训练统计字段失败', statsErr)
      }
    }
    
    // 更新记录
    await db.collection('point_records').doc(recordId).update({
      data: updateData
    })
    
    return {
      success: true,
      message: status === 'approved' ? '审核通过成功' : '审核拒绝成功'
    }
    
  } catch (error) {
    console.error('审核积分记录失败', error)
    return {
      success: false,
      message: '审核失败',
      error: error
    }
  }
}
