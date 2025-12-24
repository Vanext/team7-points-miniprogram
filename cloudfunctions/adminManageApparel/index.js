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

async function ensureCollections() {
  try { await db.createCollection('apparel_distributions') } catch (e) {}
}

function nowServerDate() {
  return db.serverDate()
}

function sanitizeText(s, maxLen = 200) {
  if (!s || typeof s !== 'string') return ''
  return s.slice(0, maxLen)
}

function parseGenderSizeFields(inputGender, inputSize, inputSizeText) {
  let gender = (typeof inputGender === 'string') ? inputGender : ''
  let size = (typeof inputSize === 'string') ? inputSize : ''
  const sizeText = (typeof inputSizeText === 'string') ? inputSizeText : ''

  if ((!gender || !size) && sizeText) {
    const m = sizeText.match(/^([男女])[- ]?(.*)$/)
    if (m) {
      gender = gender || m[1]
      size = size || (m[2] || '')
    }
  }

  if (!gender && typeof size === 'string') {
    const m = size.match(/^([男女])[- ]?(.*)$/)
    if (m) {
      gender = m[1]
      size = m[2] || ''
    }
  }

  return { gender: String(gender || '').trim(), size: String(size || '').trim().toUpperCase() }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {}, query = {} } = event || {}
  try {
    await assertAdmin(OPENID)
    await ensureCollections()
    const coll = db.collection('apparel_distributions')

    if (action === 'create') {
      const parsed = parseGenderSizeFields(data.gender, data.size, data.sizeText)
      const doc = {
        name: sanitizeText(data.name, 50),
        category: sanitizeText(data.category, 50),
        gender: sanitizeText(parsed.gender, 10),
        size: sanitizeText(parsed.size, 20),
        mobile: sanitizeText(data.mobile, 20),
        ordered: !!data.ordered,
        shipped: !!data.shipped,
        address: sanitizeText(data.address, 200),
        remark: sanitizeText(data.remark, 200),
        createdAt: nowServerDate(),
        updatedAt: nowServerDate(),
        createdBy: OPENID,
        updatedBy: OPENID
      }
      const res = await coll.add({ data: doc })
      return { success: true, data: { id: res._id } }
    }

    if (action === 'list') {
      const { limit = 200, skip = 0 } = query
      const res = await coll.orderBy('createdAt', 'desc').skip(skip).limit(limit).get()
      const dataList = (res.data || []).map(doc => ({
        _id: doc._id,
        name: doc.name || doc.recipientName || '',
        category: doc.category || '',
        gender: doc.gender || '',
        size: doc.size || '',
        mobile: doc.mobile || '',
        ordered: typeof doc.ordered === 'boolean' ? doc.ordered : false,
        shipped: typeof doc.shipped === 'boolean' ? doc.shipped : false,
        address: doc.address || '',
        remark: doc.remark || ''
      }))
      return { success: true, data: dataList }
    }

    if (action === 'update') {
      const { id } = data
      if (!id) throw new Error('缺少ID')
      const patch = {
        updatedAt: nowServerDate(),
        updatedBy: OPENID
      }
      if (Object.prototype.hasOwnProperty.call(data, 'name')) {
        patch.name = sanitizeText(data.name, 50)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'category')) {
        patch.category = sanitizeText(data.category, 50)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'gender')) {
        patch.gender = sanitizeText(data.gender, 10)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'size')) {
        patch.size = sanitizeText(data.size, 20)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'sizeText')) {
        const parsed = parseGenderSizeFields(patch.gender, patch.size, data.sizeText)
        patch.gender = sanitizeText(parsed.gender, 10)
        patch.size = sanitizeText(parsed.size, 20)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'mobile')) {
        patch.mobile = sanitizeText(data.mobile, 20)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'ordered')) {
        patch.ordered = !!data.ordered
      }
      if (Object.prototype.hasOwnProperty.call(data, 'shipped')) {
        patch.shipped = !!data.shipped
      }
      if (Object.prototype.hasOwnProperty.call(data, 'address')) {
        patch.address = sanitizeText(data.address, 200)
      }
      if (Object.prototype.hasOwnProperty.call(data, 'remark')) {
        patch.remark = sanitizeText(data.remark, 200)
      }
      await coll.doc(id).update({ data: patch })
      return { success: true }
    }

    if (action === 'markShipped') {
      const { id, deliveryMethod = 'express' } = data
      if (!id) throw new Error('缺少ID')
      await coll.doc(id).update({
        data: {
          status: 'shipped',
          deliveryMethod,
          shippedAt: nowServerDate(),
          updatedAt: nowServerDate(),
          updatedBy: OPENID
        }
      })
      const rec = await coll.doc(id).get()
      const targetOpenid = rec && rec.data && rec.data.recipientOpenid
      if (targetOpenid) {
        try {
          const sizeText = (rec.data.gender && rec.data.size) ? `${rec.data.gender}-${rec.data.size}` : (rec.data.size || '')
          await cloud.callFunction({
            name: 'messageManager',
            data: {
              action: 'create',
              data: {
                targetOpenid,
                type: 'system',
                title: '队服已发货/发放',
                content: `尺码 ${sizeText}，方式 ${rec.data.deliveryMethod || ''}`,
                relatedId: id
              }
            }
          })
        } catch (_) {}
      }
      return { success: true }
    }

    if (action === 'markDelivered') {
      const { id } = data
      if (!id) throw new Error('缺少ID')
      await coll.doc(id).update({
        data: {
          status: 'delivered',
          deliveredAt: nowServerDate(),
          updatedAt: nowServerDate(),
          updatedBy: OPENID
        }
      })
      const rec = await coll.doc(id).get()
      const targetOpenid = rec && rec.data && rec.data.recipientOpenid
      if (targetOpenid) {
        try {
          const sizeText = (rec.data.gender && rec.data.size) ? `${rec.data.gender}-${rec.data.size}` : (rec.data.size || '')
          await cloud.callFunction({
            name: 'messageManager',
            data: {
              action: 'create',
              data: {
                targetOpenid,
                type: 'system',
                title: '队服已签收',
                content: `尺码 ${sizeText}`,
                relatedId: id
              }
            }
          })
        } catch (_) {}
      }
      return { success: true }
    }

    if (action === 'setException') {
      const { id, notes = '' } = data
      if (!id) throw new Error('缺少ID')
      await coll.doc(id).update({
        data: {
          status: 'exception',
          notes: sanitizeText(notes, 300),
          updatedAt: nowServerDate(),
          updatedBy: OPENID
        }
      })
      const rec = await coll.doc(id).get()
      const targetOpenid = rec && rec.data && rec.data.recipientOpenid
      if (targetOpenid) {
        try {
          await cloud.callFunction({
            name: 'messageManager',
            data: {
              action: 'create',
              data: {
                targetOpenid,
                type: 'system',
                title: '队服发放异常',
                content: rec.data.notes || '请联系管理员处理',
                relatedId: id
              }
            }
          })
        } catch (_) {}
      }
      return { success: true }
    }

    if (action === 'delete') {
      const { id } = data
      if (!id) throw new Error('缺少ID')
      await coll.doc(id).remove()
      return { success: true }
    }

    if (action === 'count') {
      const { status } = query
      const where = {}
      if (status) where.status = status
      const res = await coll.where(where).count()
      return { success: true, data: { total: res.total } }
    }

    return { success: false, message: '未知操作' }
  } catch (err) {
    console.error('adminManageApparel failed', err)
    return { success: false, message: err.message || '操作失败' }
  }
}
