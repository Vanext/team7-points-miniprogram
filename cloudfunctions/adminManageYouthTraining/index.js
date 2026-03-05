const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertAdmin(openid) {
  const r = await db.collection('users').where({ _openid: openid }).limit(1).get()
  const u = (r && r.data && r.data[0]) || null
  if (!u || !u.isAdmin) throw new Error('无管理员权限')
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, limit = 100, skip = 0 } = event
  
  try {
    await assertAdmin(OPENID)

    if (action === 'list') {
      const res = await db.collection('youth_training_applications')
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(limit)
        .get()
      
      const totalRes = await db.collection('youth_training_applications').count()
      
      // Format dates for display
      const list = res.data.map(item => ({
        ...item,
        createTime: item.createTime ? new Date(item.createTime).toLocaleString() : '',
        days: Array.isArray(item.days) ? item.days.join(', ') : item.days
      }))

      return {
        success: true,
        data: list,
        total: totalRes.total
      }
    }

    if (action === 'export') {
      // Get all data for export
      // For simplicity, we might need to loop if > 1000, but let's assume < 1000 for now or use multiple gets
      // Or just get top 1000
      const countRes = await db.collection('youth_training_applications').count()
      const total = countRes.total
      const MAX_LIMIT = 1000
      const batchTimes = Math.ceil(total / MAX_LIMIT)
      const tasks = []
      
      for (let i = 0; i < batchTimes; i++) {
        const promise = db.collection('youth_training_applications')
          .orderBy('createTime', 'desc')
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .get()
        tasks.push(promise)
      }
      
      const results = await Promise.all(tasks)
      const allData = results.reduce((acc, cur) => acc.concat(cur.data), [])
      
      // Generate CSV
      const header = ['姓名', '性别', '年龄', '身高', '是否带保险', '参加日期', '联系人', '联系电话', '提交时间']
      const rows = allData.map(item => [
        item.name || '',
        item.gender || '',
        item.age || '',
        item.height || '',
        item.hasInsurance || '',
        `"${(Array.isArray(item.days) ? item.days.join('; ') : item.days || '').replace(/"/g, '""')}"`,
        item.contactPerson || '',
        `\t${item.contactPhone || ''}`, // Prevent scientific notation
        item.createTime ? new Date(item.createTime).toLocaleString() : ''
      ])
      
      const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n')
      const buffer = Buffer.from('\ufeff' + csvContent, 'utf8') // Add BOM for Excel
      
      const cloudPath = `exports/youth_training_${Date.now()}.csv`
      const uploadRes = await cloud.uploadFile({
        cloudPath,
        fileContent: buffer
      })
      
      const fileRes = await cloud.getTempFileURL({
        fileList: [uploadRes.fileID]
      })
      
      return {
        success: true,
        url: fileRes.fileList[0].tempFileURL
      }
    }

    if (action === 'delete') {
      const { id } = event
      if (!id) return { success: false, message: 'Missing ID' }
      
      await db.collection('youth_training_applications').doc(id).remove()
      
      return { success: true }
    }

    return { success: false, message: 'Unknown action' }

  } catch (err) {
    return { success: false, message: err.message }
  }
}
