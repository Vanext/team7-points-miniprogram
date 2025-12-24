const app = getApp()

Page({
  data: {
    isAdmin: false,
    loading: false,
    list: [],
    categoryOptions: ['会员T恤', '铁三服', '泳帽', '渔夫帽', '跟屁虫'],
    genderOptions: ['男', '女'],
    sizeOptions: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
    genderSizeOptions: [],
    activeTab: 'all', // all, orderedNotShipped, shipped
    groups: [],
    collapsedCategories: {},
    // Custom category modal state
    showCustomModal: false,
    customCategoryName: '',
    editingItemId: null
  },

  onLoad() {
    this.setData({ genderSizeOptions: this.buildGenderSizeOptions() })
    this.checkAdmin()
  },

  onShow() {
    if (this.data.isAdmin) {
      this.loadList()
    }
  },

  onPullDownRefresh() {
    this.loadList().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async checkAdmin() {
    const user = app.globalData.userInfo
    let inDevtools = false
    try {
      const info = wx.getSystemInfoSync()
      inDevtools = info && info.platform === 'devtools'
    } catch (e) {}
    
    if (!user || user.isAdmin !== true) {
      if (inDevtools) {
        // Devtools bypass for visualization
        const hasList = (this.data.list && this.data.list.length > 0)
        const demoList = hasList ? this.data.list : [
          { _id: 'demo1', name: '张三', mobile: '13800138000', category: '会员T恤', gender: '男', size: 'L', ordered: false, shipped: false, address: '北京市朝阳区...' },
          { _id: 'demo2', name: '李四', mobile: '', category: '铁三服', gender: '女', size: 'M', ordered: true, shipped: false, address: '上海市浦东新区...' },
          { _id: 'demo3', name: '王五', mobile: '13912345678', category: '跑步短裤', gender: '男', size: 'XL', ordered: true, shipped: true, address: '深圳市南山区...' },
          { _id: 'demo4', name: '赵六', mobile: '', category: '会员外套', gender: '女', size: 'S', ordered: false, shipped: false, address: '广州市天河区...' },
          { _id: 'demo5', name: '孙七', mobile: '18688888888', category: '会员T恤', gender: '男', size: 'M', ordered: true, shipped: false, address: '杭州市西湖区...' }
        ]
        this.setData({ isAdmin: true, list: demoList })
        this.updateGroups()
        return
      }
      this.setData({ isAdmin: false })
      return
    }
    this.setData({ isAdmin: true })
    await this.loadList()
  },

  async loadList() {
    if (!this.data.isAdmin) return
    try {
      this.setData({ loading: true })
      const cloudEnv = app.globalData.cloudEnv
      const { result } = await wx.cloud.callFunction({
        name: 'adminManageApparel',
        config: { env: cloudEnv },
        data: {
          action: 'list',
          query: { limit: 200, skip: 0 }
        }
      })
      if (!result || !result.success) {
        throw new Error((result && result.message) || '加载失败')
      }
      const list = (result.data || []).map(item => ({
        ...(() => {
          let gender = item.gender || ''
          let size = item.size || ''
          if (!gender && typeof size === 'string') {
            const m = size.match(/^([男女])[- ]?(.*)$/)
            if (m) {
              gender = m[1]
              size = m[2] || ''
            }
          }
          return { gender, size: String(size || '').trim().toUpperCase() }
        })(),
        _id: item._id || '',
        name: item.name || item.recipientName || '',
        mobile: item.mobile || '',
        category: item.category || '',
        ordered: !!item.ordered,
        shipped: !!item.shipped,
        address: item.address || '',
        remark: item.remark || ''
      }))
      this.setData({ list, loading: false })
      this.updateGroups()
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    }
  },

  updateGroups() {
    const list = this.data.list || []
    const activeTab = this.data.activeTab || 'all'

    // 1. Update Category Options dynamically
    // Start with presets
    const presets = ['会员T恤', '铁三服', '泳帽', '渔夫帽', '跟屁虫']
    const usedCategories = new Set(presets)
    
    // Add any categories found in existing data
    list.forEach(it => {
      if (it.category && it.category.trim()) {
        usedCategories.add(it.category.trim())
      }
    })
    
    // Convert to array and add "自定义" at the end
    const allCats = Array.from(usedCategories)
    allCats.push('自定义')
    this.setData({ categoryOptions: allCats })

    // 2. Filter list for display
    let filtered = list
    if (activeTab === 'orderedNotShipped') {
      filtered = list.filter(it => it.ordered && !it.shipped)
    } else if (activeTab === 'shipped') {
      filtered = list.filter(it => it.shipped)
    }
    // 'all' includes everything

    const map = {}
    for (const it of filtered) {
      const cat = (it.category && it.category.trim()) ? it.category.trim() : '未分类'
      if (!map[cat]) map[cat] = []
      map[cat].push(it)
    }
    
    const keys = Object.keys(map).sort()
    const groups = keys.map(cat => ({ category: cat, items: map[cat] }))
    this.setData({ groups })
  },

  async addItem() {
    try {
      // Create a temporary local item
      const newItem = {
        _id: 'TEMP_' + Date.now(),
        name: '',
        mobile: '',
        category: '',
        gender: '',
        size: '',
        ordered: false,
        shipped: false,
        address: '',
        remark: ''
      }
      
      const list = [newItem, ...this.data.list]
      this.setData({ list })
      
      // Ensure '未分类' is visible since new item has empty category
      const collapsed = this.data.collapsedCategories || {}
      if (collapsed['未分类']) {
        this.setData({ ['collapsedCategories.未分类']: false })
      }
      
      this.updateGroups()
      
      wx.showToast({ title: '已添加，请填写', icon: 'none' })
    } catch (err) {
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  },

  // --- Helper to find index by ID ---
  findIndexById(id) {
    if (!id) return -1
    return this.data.list.findIndex(item => item._id === id)
  },

  // --- ID-based Handlers ---

  onNameBlurById(e) {
    const id = e.currentTarget.dataset.id
    const value = (e.detail.value || '').trim()
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { name: value })
  },

  onMobileBlurById(e) {
    const id = e.currentTarget.dataset.id
    const value = (e.detail.value || '').trim()
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { mobile: value })
  },

  onCategoryBlurById(e) {
    const id = e.currentTarget.dataset.id
    const value = (e.detail.value || '').trim()
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { category: value })
  },

  onAddressBlurById(e) {
    const id = e.currentTarget.dataset.id
    const value = (e.detail.value || '').trim()
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { address: value })
  },

  onRemarkInputById(e) {
    const id = e.currentTarget.dataset.id
    const value = (e.detail.value || '')
    const index = this.findIndexById(id)
    if (index === -1) return
    this.data.list[index].remark = value
  },

  onRemarkBlurById(e) {
    const id = e.currentTarget.dataset.id
    const value = (e.detail.value || '').trim()
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { remark: value })
  },

  onGenderSizePickById(e) {
    const id = e.currentTarget.dataset.id
    const optionIndex = Number(e.detail.value)
    const text = this.data.genderSizeOptions[optionIndex] || ''
    let gender = ''
    let size = ''
    const m = text.match(/^([男女])[- ]?(.*)$/)
    if (m) {
      gender = m[1]
      size = (m[2] || '').trim().toUpperCase()
    } else {
      size = String(text || '').trim().toUpperCase()
    }
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { gender, size })
  },

  onCategoryPickById(e) {
    const id = e.currentTarget.dataset.id
    const optionIndex = Number(e.detail.value)
    const category = this.data.categoryOptions[optionIndex] || ''
    
    if (category === '自定义') {
      // Open custom category modal
      this.setData({
        showCustomModal: true,
        customCategoryName: '',
        editingItemId: id
      })
      return
    }

    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { category })
  },

  // --- Custom Category Modal Handlers ---
  
  onCustomCategoryInput(e) {
    this.setData({ customCategoryName: e.detail.value })
  },

  closeCustomModal() {
    this.setData({
      showCustomModal: false,
      customCategoryName: '',
      editingItemId: null
    })
  },

  confirmCustomCategory() {
    const newCat = (this.data.customCategoryName || '').trim()
    const id = this.data.editingItemId
    
    if (!newCat) {
      wx.showToast({ title: '请输入类别名称', icon: 'none' })
      return
    }

    if (id) {
      const index = this.findIndexById(id)
      if (index !== -1) {
        this.saveRow(index, { category: newCat })
      }
    }

    this.closeCustomModal()
  },

  onToggleOrderedById(e) {
    const id = e.currentTarget.dataset.id
    const val = e.currentTarget.dataset.val // boolean
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { ordered: val })
  },

  onToggleShippedById(e) {
    const id = e.currentTarget.dataset.id
    const val = e.currentTarget.dataset.val // boolean
    const index = this.findIndexById(id)
    if (index !== -1) this.saveRow(index, { shipped: val })
  },

  onSaveRowById(e) {
    const id = e.currentTarget.dataset.id
    const index = this.findIndexById(id)
    if (index !== -1) {
      // Just re-save current state to ensure consistency or trigger feedback
      const item = this.data.list[index]
      this.saveRow(index, {
        name: item.name,
        mobile: item.mobile,
        category: item.category,
        gender: item.gender,
        size: item.size,
        ordered: item.ordered,
        shipped: item.shipped,
        address: item.address,
        remark: item.remark
      })
    }
  },

  removeById(e) {
    const id = e.currentTarget.dataset.id
    const index = this.findIndexById(id)
    if (index !== -1) this.remove(index)
  },

  // --- Core Operations ---

  async saveRow(index, patch) {
    const list = this.data.list.slice()
    if (index < 0 || index >= list.length) return

    const item = { ...list[index], ...patch }
    // Optimistic update
    list[index] = item
    this.setData({ list })
    // Re-render groups to show changes immediately (e.g. category change moves item)
    // If category changed, ensure target group is expanded
    if (patch.category) {
      const cat = patch.category.trim() || '未分类'
      this.setData({ [`collapsedCategories.${cat}`]: false })
    }
    this.updateGroups()

    try {
      const cloudEnv = app.globalData.cloudEnv

      if (String(item._id).startsWith('TEMP_')) {
        // Create new item
        wx.showLoading({ title: '创建中...', mask: true })
        const { result } = await wx.cloud.callFunction({
          name: 'adminManageApparel',
          config: { env: cloudEnv },
          data: {
            action: 'create',
            data: {
              name: item.name,
              category: item.category,
              gender: item.gender,
              size: item.size,
              mobile: item.mobile,
              address: item.address,
              remark: item.remark,
              ordered: item.ordered,
              shipped: item.shipped
            }
          }
        })
        wx.hideLoading()
        if (!result || !result.success || !result.data || !result.data.id) {
          throw new Error((result && result.message) || '创建失败')
        }
        
        // Update with real ID
        const realId = result.data.id
        const newList = this.data.list.slice()
        // Find index again as it might have changed or list reordered? 
        // We use index passed in, but list content might have changed if concurrency?
        // Safest to find by temp ID
        const currentIdx = newList.findIndex(it => it._id === item._id)
        if (currentIdx !== -1) {
          newList[currentIdx]._id = realId
          this.setData({ list: newList })
          this.updateGroups() // Refresh IDs in groups
        }
        
        wx.showToast({ title: '已创建', icon: 'success', duration: 800 })
      } else {
        // Update existing
        wx.showLoading({ title: '保存中...', mask: true })
        const { result } = await wx.cloud.callFunction({
          name: 'adminManageApparel',
          config: { env: cloudEnv },
          data: {
            action: 'update',
            data: {
              id: item._id,
              ...patch
            }
          }
        })
        wx.hideLoading()
        if (!result || !result.success) {
          throw new Error((result && result.message) || '保存失败')
        }
        wx.showToast({ title: '已保存', icon: 'success', duration: 800 })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      // Consider reverting optimistic update if critical
    }
  },

  async remove(index) {
    const list = this.data.list.slice()
    if (index < 0 || index >= list.length) return
    const item = list[index]

    const confirmRes = await wx.showModal({
      title: '删除确认',
      content: '确定删除该条目？'
    })
    if (!confirmRes.confirm) return

    try {
      if (!String(item._id).startsWith('TEMP_')) {
        wx.showLoading({ title: '删除中...' })
        const cloudEnv = app.globalData.cloudEnv
        const { result } = await wx.cloud.callFunction({
          name: 'adminManageApparel',
          config: { env: cloudEnv },
          data: {
            action: 'delete',
            data: { id: item._id }
          }
        })
        wx.hideLoading()
        if (!result || !result.success) {
          throw new Error((result && result.message) || '删除失败')
        }
      }
      
      list.splice(index, 1)
      this.setData({ list })
      this.updateGroups()
      
      wx.showToast({ title: '已删除', icon: 'success', duration: 800 })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '删除失败', icon: 'none' })
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab || 'all'
    if (tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    this.updateGroups()
  },

  toggleCategory(e) {
    const category = e.currentTarget.dataset.category
    if (!category) return
    const collapsed = this.data.collapsedCategories || {}
    const next = !collapsed[category]
    this.setData({ [`collapsedCategories.${category}`]: next })
  },

  async exportCsv() {
    try {
      wx.showLoading({ title: '生成中...' })
      const rows = this.data.list || []
      const headers = ['姓名', '手机号', '服装类别', '尺码', '是否已下单', '是否已发货', '地址', '备注']
      const toText = v => (v === undefined || v === null) ? '' : String(v).replace(/\r?\n/g, ' ')
      const lines = [headers.join(',')]
      for (const r of rows) {
        const sizeText = (r.gender && r.size) ? `${r.gender}-${r.size}` : (r.size || '')
        const cols = [
          toText(r.name),
          toText(r.mobile),
          toText(r.category),
          toText(sizeText),
          r.ordered ? '已下单' : '未下单',
          r.shipped ? '已发货' : '未发货',
          toText(r.address),
          toText(r.remark)
        ]
        const esc = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        lines.push(cols.map(esc).join(','))
      }
      const csv = '\ufeff' + lines.join('\n')
      const fs = wx.getFileSystemManager()
      const ts = Date.now()
      const dateText = new Date(ts).toISOString().slice(0, 10)
      const fileName = `服装发放_${dateText}_${ts}.csv`
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

      await new Promise((resolve, reject) => {
        fs.writeFile({
          filePath,
          data: csv,
          encoding: 'utf8',
          success: resolve,
          fail: reject
        })
      })

      wx.hideLoading()
      wx.openDocument({
        filePath,
        fileType: 'csv',
        showMenu: true,
        fail: async () => {
          try {
            await wx.setClipboardData({ data: csv })
            wx.showToast({ title: '已生成CSV并复制', icon: 'success' })
          } catch (_) {
            wx.showToast({ title: '已生成CSV文件', icon: 'success' })
          }
        }
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message || '生成失败', icon: 'none' })
    }
  },

  buildGenderSizeOptions() {
    const genders = this.data.genderOptions || []
    const sizes = this.data.sizeOptions || []
    const list = []
    for (const g of genders) {
      for (const s of sizes) {
        list.push(`${g}${s}`)
      }
    }
    return list
  }
})
