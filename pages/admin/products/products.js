const app = getApp()

Page({
  data: {
    loading: false,
    creating: false,
    updating: false,
    showEdit: false,
    showCreateForm: false,
    editingId: '',
    products: [],
    form: { name: '', points: '', stock: '', image: '', imageUrl: '', description: '', sizesEnabled: true, sizeStocks: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 } },
    editForm: { name: '', points: '', stock: '', image: '', imageUrl: '', description: '', sizesEnabled: false, sizeStocks: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 } }
  },

  async onShow() {
    // 权限守卫：非管理员禁止进入
    const user = app.globalData.userInfo
    if (!user || !user._openid) {
      app.showToast('请先登录', 'error')
      setTimeout(() => wx.switchTab({ url: '/pages/profile/profile' }), 500)
      return
    }
    // 同步一次，拿到最新 isAdmin
    try { await app.syncUserInfoFromDB(user._openid) } catch (_) {}
    if (!app.globalData.userInfo || !app.globalData.userInfo.isAdmin) {
      app.showToast('仅管理员可访问', 'error')
      setTimeout(() => wx.navigateBack({ delta: 1 }), 500)
      return
    }
    this.onRefresh()
  },

  // 简单工具函数
  isInt(n) { return Number.isInteger(n) },
  isPositiveInt(n) { return Number.isInteger(n) && n > 0 },
  isNonNegativeInt(n) { return Number.isInteger(n) && n >= 0 },
  isValidUrl(s) { return typeof s === 'string' && /^(https?:\/\/|cloud:\/\/)/i.test(s) },

  onInputName(e){ this.setData({ 'form.name': e.detail.value.trim() }) },
  onInputPoints(e){ this.setData({ 'form.points': e.detail.value.trim() }) },
  onInputStock(e){ this.setData({ 'form.stock': e.detail.value.trim() }) },
  onInputImage(e){ this.setData({ 'form.image': e.detail.value.trim() }) },
  onInputDescription(e) { this.setData({ 'form.description': e.detail.value }) },
  onToggleSizes(e) { this.setData({ 'form.sizesEnabled': !!e.detail.value }) },
  onSizeStockInput(e){
    const size = e.currentTarget.dataset.size
    const val = Number(e.detail.value)
    const safe = Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0
    this.setData({ [`form.sizeStocks.${size}`]: safe })
    if (this.data.form.sizesEnabled) {
      const current = this.data.form.sizeStocks || {}
      const merged = { ...current, [size]: safe }
      const total = (Number(merged.XS)||0)+(Number(merged.S)||0)+(Number(merged.M)||0)+(Number(merged.L)||0)+(Number(merged.XL)||0)+(Number(merged['2XL'])||0)+(Number(merged['3XL'])||0)
      this.setData({ 'form.stock': String(total) })
    }
  },

  // 图片URL输入
  onInputImageUrl(e) { 
    this.setData({ 
      'form.imageUrl': e.detail.value,
      'form.image': e.detail.value // 同步到image字段
    }) 
  },

  // 选择图片（新增表单）
  chooseFormImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.uploadImage(tempFilePath, 'form');
      }
    });
  },

  // 删除图片（新增表单）
  removeFormImage() {
    this.setData({
      'form.image': '',
      'form.imageUrl': ''
    });
  },

  // 上传图片到云存储
  async uploadImage(filePath, formType) {
    wx.showLoading({ title: '上传中...' });
    try {
      const cloudPath = `products/${Date.now()}_${Math.random().toString(36).substr(2, 8)}${filePath.match(/\.[^\.]+?$/)[0]}`;
      const result = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });
      
      this.setData({
        [`${formType}.image`]: result.fileID,
        [`${formType}.imageUrl`]: result.fileID
      });
      
      wx.hideLoading();
      app.showToast('图片上传成功');
    } catch (error) {
      wx.hideLoading();
      console.error('上传失败', error);
      app.showToast('图片上传失败', 'error');
    }
  },

  async onRefresh(){
    this.setData({ loading: true })
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'adminManageProducts', config: { env: cloudEnv }, data: { action: 'list', includeInactive: true } })
      const result = res.result || {}
      if (!result.success) throw new Error(result.message || '加载失败')
      this.setData({ products: result.data || [] })
    } catch (e) {
      console.error(e)
      app.showToast(e.message || '加载失败', 'error')
    } finally {
      this.setData({ loading: false })
    }
  },

  onToggleCreateForm(){
    this.setData({ showCreateForm: !this.data.showCreateForm })
  },

  async onCreate(){
    if (this.data.creating) return
    const { name, points, stock, image, description } = this.data.form

    // 更严格的校验
    if (!name) return app.showToast('请填写商品名称', 'error')
    if (name.length > 50) return app.showToast('名称不应超过50个字符', 'error')

    const p = Number(points)
    const s = Number(stock)
    if (!this.isPositiveInt(p)) return app.showToast('积分需为正整数', 'error')
    if (p > 1000000) return app.showToast('积分过大，请<=1000000', 'error')
    if (!this.isNonNegativeInt(s)) return app.showToast('库存需为整数且>=0', 'error')
    if (s > 100000) return app.showToast('库存过大，请<=100000', 'error')

    if (image && !this.isValidUrl(image)) return app.showToast('图片地址需为 http(s) 或 cloud://', 'error')
    if (description && description.length > 140) return app.showToast('描述不应超过140字', 'error')

    this.setData({ creating: true })
    try {
      const payload = {
        action: 'create',
        name,
        points: p,
        stock: s,
        image,
        description
      }
      // 尺码支持
      if (this.data.form.sizesEnabled) {
        payload.sizesEnabled = true
        payload.sizes = ['XS','S','M','L','XL','2XL','3XL']
        payload.sizeStocks = {
          XS: Number(this.data.form.sizeStocks && this.data.form.sizeStocks.XS) || 0,
          S: Number(this.data.form.sizeStocks && this.data.form.sizeStocks.S) || 0,
          M: Number(this.data.form.sizeStocks && this.data.form.sizeStocks.M) || 0,
          L: Number(this.data.form.sizeStocks && this.data.form.sizeStocks.L) || 0,
          XL: Number(this.data.form.sizeStocks && this.data.form.sizeStocks.XL) || 0,
          '2XL': Number(this.data.form.sizeStocks && this.data.form.sizeStocks['2XL']) || 0,
          '3XL': Number(this.data.form.sizeStocks && this.data.form.sizeStocks['3XL']) || 0
        }
      } else {
        payload.sizesEnabled = false
        payload.sizes = []
        payload.sizeStocks = {}
      }
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'adminManageProducts', config: { env: cloudEnv }, data: payload })
      const result = res.result || {}
      if (!result.success) throw new Error(result.message || '新增失败')
      app.showToast('创建成功')
      this.setData({ 
        form: { name: '', points: '', stock: '', image: '', imageUrl: '', description: '', sizesEnabled: false, sizeStocks: { XS:0,S:0,M:0,L:0,XL:0,'2XL':0,'3XL':0 } },
        showCreateForm: false
      })
      this.onRefresh()
    } catch (e) {
      console.error(e)
      app.showToast(e.message || '创建失败', 'error')
    } finally {
      this.setData({ creating: false })
    }
  },

  async onDelete(e){
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const out = await wx.cloud.callFunction({ name: 'adminManageProducts', config: { env: cloudEnv }, data: { action: 'delete', id } })
          const result = out.result || {}
          if (!result.success) throw new Error(result.message || '删除失败')
          app.showToast('已删除')
          this.onRefresh()
        } catch (e) {
          console.error(e)
          app.showToast(e.message || '删除失败', 'error')
        }
      }
    })
  },

  async onToggleActive(e){
    const id = e.currentTarget.dataset.id
    const active = e.currentTarget.dataset.active
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const out = await wx.cloud.callFunction({ name: 'adminManageProducts', config: { env: cloudEnv }, data: { action: 'toggleActive', id, isActive: !active } })
      const result = out.result || {}
      if (!result.success) throw new Error(result.message || '操作失败')
      app.showToast(active ? '已下架' : '已上架')
      this.onRefresh()
      // 通知积分兑换页面刷新并清除缓存
      try {
        wx.removeStorageSync('store_products_cache')
        wx.removeStorageSync('store_products_cache_time')
      } catch (_) {}
      getApp().globalData.shouldRefreshStore = true
    } catch (e) {
      console.error(e)
      app.showToast(e.message || '操作失败', 'error')
    }
  },

  // 编辑弹层相关
  onOpenEdit(e){
    const item = e.currentTarget.dataset.item
    if (!item) return
    this.setData({
      showEdit: true,
      editingId: item._id,
      editForm: {
        name: item.name || '',
        points: String(item.points || ''),
        stock: String(item.stock || ''),
        image: item.image || '',
        imageUrl: item.image || '',
        description: item.description || '',
        sizesEnabled: !!item.sizesEnabled,
        sizeStocks: Object.assign({ XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 }, item.sizeStocks || {})
      }
    })
  },
  onCloseEdit(){
    this.setData({ 
      showEdit: false, 
      editingId: '',
      editForm: { name: '', points: '', stock: '', image: '', imageUrl: '', description: '', sizesEnabled: false, sizeStocks: { XS:0, S:0, M:0, L:0, XL:0, '2XL':0, '3XL':0 } }
    })
  },
  onEditName(e){ this.setData({ 'editForm.name': e.detail.value.trim() }) },
  onEditPoints(e){ this.setData({ 'editForm.points': e.detail.value.trim() }) },
  onEditStock(e){ this.setData({ 'editForm.stock': e.detail.value.trim() }) },
  onEditImage(e){ this.setData({ 'editForm.image': e.detail.value.trim() }) },
  onEditDescription(e){ this.setData({ 'editForm.description': e.detail.value }) },
  onEditToggleSizes(e){ this.setData({ 'editForm.sizesEnabled': !!e.detail.value }) },
  onEditSizeStockInput(e){
    const size = e.currentTarget.dataset.size
    const val = Number(e.detail.value)
    const safe = Number.isFinite(val) && val >= 0 ? Math.floor(val) : 0
    this.setData({ [`editForm.sizeStocks.${size}`]: safe })
    const current = this.data.editForm.sizeStocks || {}
    const merged = { ...current, [size]: safe }
    const total = (Number(merged.XS)||0)+(Number(merged.S)||0)+(Number(merged.M)||0)+(Number(merged.L)||0)+(Number(merged.XL)||0)+(Number(merged['2XL'])||0)+(Number(merged['3XL'])||0)
    this.setData({ 'editForm.stock': String(total) })
  },

  // 编辑表单图片URL输入
  onEditImageUrl(e) { 
    this.setData({ 
      'editForm.imageUrl': e.detail.value,
      'editForm.image': e.detail.value // 同步到image字段
    }) 
  },

  // 选择图片（编辑表单）
  chooseEditImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        this.uploadImage(tempFilePath, 'editForm');
      }
    });
  },

  // 删除图片（编辑表单）
  removeEditImage() {
    this.setData({
      'editForm.image': '',
      'editForm.imageUrl': ''
    });
  },

  // 尺码开关（新增/编辑）
  onToggleSizes(e) {
    this.setData({ 'form.sizesEnabled': !!e.detail.value })
  },
  onEditToggleSizes(e) {
    this.setData({ 'editForm.sizesEnabled': !!e.detail.value })
  },

  async onSubmitEdit(){
    if (this.data.updating) return
    const { name, points, stock, image, description } = this.data.editForm

    if (!name) return app.showToast('请填写商品名称', 'error')
    if (name.length > 50) return app.showToast('名称不应超过50个字符', 'error')

    const p = Number(points)
    const s = Number(stock)
    if (!this.isPositiveInt(p)) return app.showToast('积分需为正整数', 'error')
    if (p > 1000000) return app.showToast('积分过大，请<=1000000', 'error')
    if (!this.isNonNegativeInt(s)) return app.showToast('库存需为整数且>=0', 'error')
    if (s > 100000) return app.showToast('库存过大，请<=100000', 'error')

    if (image && !this.isValidUrl(image)) return app.showToast('图片地址需为 http(s) 或 cloud://', 'error')
    if (description && description.length > 140) return app.showToast('描述不应超过140字', 'error')

    this.setData({ updating: true })
    try {
      const payload = {
        action: 'update',
        id: this.data.editingId,
        name,
        points: p,
        stock: s,
        image,
        description
      }
      // 尺码支持：仅在启用尺码时发送尺码字段，避免覆盖手动库存
      if (this.data.editForm.sizesEnabled) {
        payload.sizesEnabled = true
        payload.sizes = ['XS','S','M','L','XL','2XL','3XL']
        payload.sizeStocks = {
          XS: Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks.XS) || 0,
          S: Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks.S) || 0,
          M: Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks.M) || 0,
          L: Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks.L) || 0,
          XL: Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks.XL) || 0,
          '2XL': Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks['2XL']) || 0,
          '3XL': Number(this.data.editForm.sizeStocks && this.data.editForm.sizeStocks['3XL']) || 0
        }
      } else {
        payload.sizesEnabled = false
        // 不发送 sizes/sizeStocks 字段，保留手动总库存
      }
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'adminManageProducts', config: { env: cloudEnv }, data: payload })
      const result = res.result || {}
      if (!result.success) throw new Error(result.message || '保存失败')
      app.showToast('已保存')
      this.setData({ showEdit: false })
      this.onRefresh()
    } catch (e) {
      console.error(e)
      app.showToast(e.message || '保存失败', 'error')
    } finally {
      this.setData({ updating: false })
    }
  }
})
