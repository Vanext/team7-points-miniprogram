const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function ensureCollections() {
  // 确保必要集合存在
  const collections = ['products', 'exchange_records']
  for (const name of collections) {
    try {
      await db.collection(name).limit(1).get()
    } catch (e) {
      // do nothing, collection will be auto-created on first write
    }
  }
}

async function checkAdmin() {
  const { OPENID } = cloud.getWXContext()
  const ures = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
  if (!ures.data.length || !ures.data[0].isAdmin) {
    const err = new Error('PERMISSION_DENIED')
    err.code = 'PERMISSION_DENIED'
    throw err
  }
  return ures.data[0]
}

exports.main = async (event, context) => {
  await ensureCollections()
  const { action } = event || {}
  try {
    await checkAdmin()
  } catch (e) {
    return { success: false, code: 'PERMISSION_DENIED', message: '仅管理员可操作' }
  }

  try {
    switch (action) {
      case 'list':
        return await listProducts(event)
      case 'create':
        return await createProduct(event)
      case 'delete':
        return await deleteProduct(event)
      case 'toggleActive':
        return await toggleActive(event)
      case 'update':
        return await updateProduct(event)
      default:
        return { success: false, message: 'Unknown action' }
    }
  } catch (err) {
    console.error('adminManageProducts error:', err)
    return { success: false, message: err.message || 'Internal Error' }
  }
}

async function listProducts(event) {
  const { page = 1, pageSize = 50, includeInactive = true } = event
  const where = includeInactive ? {} : { isActive: true }
  const countRes = await db.collection('products').where(where).count()
  const res = await db.collection('products').where(where)
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get()
  return { success: true, data: res.data, total: countRes.total }
}

async function createProduct(event) {
  const { name, points, stock, image, description = '', sizesEnabled = false, sizes = [], sizeStocks = {} } = event
  // 严格校验
  if (!name || typeof name !== 'string' || name.length > 50) throw new Error('名称不合法')
  if (!Number.isInteger(points) || points <= 0 || points > 1000000) throw new Error('积分不合法')
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new Error('库存不合法')
  if (typeof description === 'string' && description.length > 140) throw new Error('描述过长')
  if (image && typeof image === 'string' && !/^(https?:\/\/|cloud:\/\/)/i.test(image)) throw new Error('图片地址不合法')

  // 处理尺码库存聚合
  let totalStock = Number.isInteger(stock) ? stock : 0
  if (sizesEnabled && sizeStocks && typeof sizeStocks === 'object') {
    const sS = {
      XS: Number.isInteger(sizeStocks.XS) ? sizeStocks.XS : 0,
      S: Number.isInteger(sizeStocks.S) ? sizeStocks.S : 0,
      M: Number.isInteger(sizeStocks.M) ? sizeStocks.M : 0,
      L: Number.isInteger(sizeStocks.L) ? sizeStocks.L : 0,
      XL: Number.isInteger(sizeStocks.XL) ? sizeStocks.XL : 0,
      '2XL': Number.isInteger(sizeStocks['2XL']) ? sizeStocks['2XL'] : 0,
      '3XL': Number.isInteger(sizeStocks['3XL']) ? sizeStocks['3XL'] : 0,
    }
    totalStock = sS.XS + sS.S + sS.M + sS.L + sS.XL + sS['2XL'] + sS['3XL']
  }

  const data = {
    name,
    points,
    stock: totalStock,
    image: image || '',
    description,
    isActive: true,
    sizesEnabled: !!sizesEnabled,
    sizes: Array.isArray(sizes) ? sizes.slice(0, 20) : [],
  sizeStocks: sizesEnabled ? {
    XS: Number.isInteger(sizeStocks.XS) ? sizeStocks.XS : 0,
    S: Number.isInteger(sizeStocks.S) ? sizeStocks.S : 0,
    M: Number.isInteger(sizeStocks.M) ? sizeStocks.M : 0,
    L: Number.isInteger(sizeStocks.L) ? sizeStocks.L : 0,
    XL: Number.isInteger(sizeStocks.XL) ? sizeStocks.XL : 0,
    '2XL': Number.isInteger(sizeStocks['2XL']) ? sizeStocks['2XL'] : 0,
    '3XL': Number.isInteger(sizeStocks['3XL']) ? sizeStocks['3XL'] : 0,
  } : {},
    createTime: new Date(),
    updateTime: new Date(),
  }
  const res = await db.collection('products').add({ data })
  return { success: true, id: res._id, data }
}

async function deleteProduct(event) {
  const { id } = event
  if (!id) throw new Error('缺少商品ID')
  await db.collection('products').doc(id).remove()
  return { success: true }
}

async function toggleActive(event) {
  const { id, isActive } = event
  if (!id || typeof isActive !== 'boolean') throw new Error('参数不合法')
  await db.collection('products').doc(id).update({ data: { isActive, updateTime: new Date() } })
  return { success: true }
}

async function updateProduct(event) {
  const { id, name, points, stock, image, description, sizesEnabled, sizes, sizeStocks } = event
  if (!id) throw new Error('缺少商品ID')
  const data = { updateTime: new Date() }
  if (typeof name !== 'undefined') {
    if (typeof name !== 'string' || !name || name.length > 50) throw new Error('名称不合法')
    data.name = name
  }
  if (typeof points !== 'undefined') {
    if (!Number.isInteger(points) || points <= 0 || points > 1000000) throw new Error('积分不合法')
    data.points = points
  }
  if (typeof stock !== 'undefined') {
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new Error('库存不合法')
    data.stock = stock
  }
  if (typeof image !== 'undefined') {
    if (typeof image !== 'string' || (image && !/^(https?:\/\/|cloud:\/\/)/i.test(image))) throw new Error('图片地址不合法')
    data.image = image
  }
  if (typeof description !== 'undefined') {
    if (typeof description !== 'string' || description.length > 140) throw new Error('描述不合法')
    data.description = description
  }
  if (typeof sizesEnabled !== 'undefined') {
    data.sizesEnabled = !!sizesEnabled
  }
  if (typeof sizes !== 'undefined') {
    if (!Array.isArray(sizes)) throw new Error('尺码不合法')
    data.sizes = sizes.slice(0, 20)
  }
  if (typeof sizeStocks !== 'undefined') {
    if (typeof sizeStocks !== 'object') throw new Error('尺码库存不合法')
    // 仅当启用尺码时，才根据尺码库存同步总库存
    if (sizesEnabled === true) {
      const sS = {
        XS: Number.isInteger(sizeStocks.XS) ? sizeStocks.XS : 0,
        S: Number.isInteger(sizeStocks.S) ? sizeStocks.S : 0,
        M: Number.isInteger(sizeStocks.M) ? sizeStocks.M : 0,
        L: Number.isInteger(sizeStocks.L) ? sizeStocks.L : 0,
        XL: Number.isInteger(sizeStocks.XL) ? sizeStocks.XL : 0,
        '2XL': Number.isInteger(sizeStocks['2XL']) ? sizeStocks['2XL'] : 0,
        '3XL': Number.isInteger(sizeStocks['3XL']) ? sizeStocks['3XL'] : 0,
      }
      data.sizeStocks = sS
      data.stock = sS.XS + sS.S + sS.M + sS.L + sS.XL + sS['2XL'] + sS['3XL']
    } else {
      // 未启用尺码时，允许手动设置总库存，不覆盖
      data.sizeStocks = {}
    }
  }
  await db.collection('products').doc(id).update({ data })
  return { success: true }
}
