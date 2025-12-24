const app = getApp()
const imageUtils = require('../../utils/imageUtils.js')

const CACHE_VERSION = 1
const PRODUCTS_CACHE_KEY = `store_products_cache_v${CACHE_VERSION}`
const PRODUCTS_CACHE_TTL_MS = 3 * 60 * 1000

function readCache(key, ttlMs) {
  try {
    const v = wx.getStorageSync(key)
    if (!v || typeof v !== 'object') return null
    const ts = v.ts
    if (!ts || (Date.now() - ts) > ttlMs) return null
    return v.data || null
  } catch (_) {
    return null
  }
}

function writeCache(key, data) {
  try {
    wx.setStorageSync(key, { ts: Date.now(), data })
  } catch (_) {}
}

Page({
  data: {
    products: [],
    loading: true
  },

  onLoad() {
    this.loadProducts()
  },

  async loadProducts() {
    if (this._inflightPromise) return this._inflightPromise
    try {
      this.setData({ loading: true })

      const cached = readCache(PRODUCTS_CACHE_KEY, PRODUCTS_CACHE_TTL_MS)
      if (cached && Array.isArray(cached) && cached.length) {
        const list = await this.normalizeProducts(cached)
        this.setData({ products: list, loading: false })
        return
      }

      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      this._inflightPromise = wx.cloud.callFunction({
        name: 'getProducts',
        config: { env: cloudEnv },
        data: { limit: 20, offset: 0 }
      })
      const res = await this._inflightPromise

      if (res.result && res.result.success && res.result.data && res.result.data.length > 0) {
        writeCache(PRODUCTS_CACHE_KEY, res.result.data)
        const list = await this.normalizeProducts(res.result.data)
        this.setData({ products: list, loading: false })
      } else {
        const db = wx.cloud.database({ env: cloudEnv })
        const _ = db.command
        const r2 = await db.collection('products')
          .field({
            _id: true,
            name: true,
            image: true,
            images: true,
            points: true,
            stock: true,
            isActive: true,
            createTime: true,
            sizesEnabled: true,
            sizes: true,
            sizeStocks: true,
            description: true
          })
          .where({ isActive: true, stock: _.gt(0) })
          .orderBy('createTime', 'desc')
          .limit(20)
          .get()
        writeCache(PRODUCTS_CACHE_KEY, r2.data || [])
        const list = await this.normalizeProducts(r2.data || [])
        this.setData({ products: list, loading: false })
      }
    } catch (err) {
      console.error('加载商品失败', err)
      this.setData({ loading: false })
      // 如果云函数调用失败，保留空列表或显示错误
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this._inflightPromise = null
    }
  },

  async normalizeProducts(products) {
    const list = Array.isArray(products) ? products.slice(0, 50) : []
    const normalized = []
    for (const p of list) {
      const rawImages = Array.isArray(p && p.images) ? p.images.filter(Boolean).slice(0, 7) : []
      const rawImage = typeof (p && p.image) === 'string' ? p.image : ''
      const images = rawImages.length ? rawImages : (rawImage ? [rawImage] : [])
      const first = images[0] || ''
      let displayImage = first
      try {
        displayImage = await imageUtils.processImageUrl(first, '/images/default-image.png')
      } catch (_) {
        displayImage = first || '/images/default-image.png'
      }
      normalized.push({ ...p, images, image: displayImage })
    }
    return normalized
  },

  viewProduct(e) {
    const id = e.currentTarget.dataset.id
    // 跳转到详情页
    wx.navigateTo({ url: `/pages/store-detail/store-detail?id=${id}` })
  }
})
