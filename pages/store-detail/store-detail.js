// pages/store-detail/store-detail.js
const app = getApp();
const imageUtils = require('../../utils/imageUtils.js')
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
    const db = wx.cloud.database({
      env: cloudEnv
    });

Page({
  data: {
    productId: '',
    product: null,
    productImages: [],
    productExtraImages: [],
    userInfo: null,
    canExchange: false,
    exchangeBtnText: '立即兑换',
    loading: true,
    showForm: false,
    // 收件信息表单
    deliveryMethod: 'mail', // mail | in_person
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    remark: '',
    selectedSize: ''
  },

  onLoad(options) {
    const id = (options && options.id) || '';
    if (id) {
      this.setData({ productId: id });
      this.loadProductDetail(id);
    }
    this.setData({ userInfo: app.globalData.userInfo });
  },

  onShow() {
    // 同步最新用户信息（如积分变动）
    this.setData({ userInfo: app.globalData.userInfo });
    this.updateExchangeState();
  },

  async loadProductDetail(id) {
    this.setData({ loading: true });
    try {
      // 优先使用直接数据库查询，避免云函数分页限制
      let product = null;
      try {
        const res = await db.collection('products').doc(id).get();
        product = res.data;
      } catch (dbErr) {
        console.warn('DB直接查询失败，尝试云函数列表查找', dbErr);
        // 回退方案：尝试从列表中查找
        const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
        const res = await wx.cloud.callFunction({ 
          name: 'getProducts',
          config: {
            env: cloudEnv
          }
        });
        const list = (res.result && res.result.data) || [];
        product = list.find(p => p._id === id);
      }

      if (!product) throw new Error('商品不存在或已下架');
      
      try {
        const rawImages = Array.isArray(product.images) ? product.images.filter(Boolean).slice(0, 7) : []
        const rawImage = typeof product.image === 'string' ? product.image : ''
        const images = rawImages.length ? rawImages : (rawImage ? [rawImage] : [])
        const processedImages = (await imageUtils.processImageUrls(images, '/images/default-image.png')).filter(u => u && u.trim() !== '')
        const displayImages = processedImages.length ? processedImages : (images.length ? images : ['/images/default-image.png'])
        product = { ...product, images: images, image: displayImages[0] }
        this.setData({ productImages: displayImages, productExtraImages: displayImages.slice(1) })
      } catch (_) {}
      
      this.setData({ product });
      wx.setNavigationBarTitle({ title: product.name || '商品详情' });
      this.updateExchangeState();
    } catch (e) {
      console.error('加载商品详情失败', e);
      app.showToast(e.message || '加载失败', 'error');
    } finally {
      this.setData({ loading: false });
    }
  },

  updateExchangeState() {
    const product = this.data.product;
    const userInfo = this.data.userInfo;
    if (!product || !userInfo) {
      this.setData({ canExchange: false, exchangeBtnText: userInfo ? '立即兑换' : '请先登录' });
      return;
    }
    const userPoints = userInfo.totalPoints || 0;
    if (product.stock <= 0) {
      this.setData({ canExchange: false, exchangeBtnText: '库存不足' });
      return;
    }
    // 负积分用户无法兑换
    if (userPoints < 0) {
      this.setData({ canExchange: false, exchangeBtnText: '负积分无法兑换' });
      return;
    }
    // 会员资格校验（前端提示）
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
    const isOfficialMember = userInfo.isOfficialMember === true;
    if (!isOfficialMember) {
      this.setData({ canExchange: false, exchangeBtnText: '仅正式会员可兑换' });
      return;
    }
    const untilTs = toTs(userInfo.officialMemberUntil)
    if (untilTs > 0 && untilTs <= Date.now()) {
      this.setData({ canExchange: false, exchangeBtnText: '会员已到期' });
      return;
    }
    // 检查兑换权限是否被锁定
    if (userInfo.exchange_locked === true) {
      this.setData({ canExchange: false, exchangeBtnText: '未激活：需一次铁三打卡通过或管理员解锁' });
      return;
    }
    if (userPoints < product.points) {
      this.setData({ canExchange: false, exchangeBtnText: '积分不足' });
      return;
    }
    
    this.setData({ canExchange: true, exchangeBtnText: '立即兑换' });
  },

  onExchange() {
    if (!this.data.canExchange) {
      if (!this.data.userInfo) {
        wx.showToast({ title: '请先登录', icon: 'none' });
        wx.switchTab({ url: '/pages/profile/profile' });
        return;
      }
      const tip = this.data.exchangeBtnText || '暂不可兑换';
      wx.showToast({ title: tip, icon: 'none' });
      return;
    }
    
    // 显示兑换表单
    this.setData({ showForm: true });
  },
  
  closeForm() {
    this.setData({ showForm: false });
  },
  
  onMethodChange(e) {
    this.setData({ deliveryMethod: e.detail.value });
  },
  onDeliveryChange(e) {
    this.onMethodChange(e);
  },
  
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },
  onInputChange(e) {
    this.onInput(e);
  },

  selectSize(e) {
    const size = e.currentTarget.dataset.size;
    const product = this.data.product;
    if (product.sizeStocks && product.sizeStocks[size] <= 0) {
      wx.showToast({ title: '该尺码暂时缺货', icon: 'none' });
      return;
    }
    this.setData({ selectedSize: size });
  },
  onSizeChange(e) {
    const size = e.detail && e.detail.value;
    const product = this.data.product;
    if (!size) return;
    if (product && product.sizeStocks && product.sizeStocks[size] <= 0) {
      wx.showToast({ title: '该尺码暂时缺货', icon: 'none' });
      return;
    }
    this.setData({ selectedSize: size });
  },
  
  async submitExchange() {
    const { product, deliveryMethod, receiverName, receiverPhone, receiverAddress, remark, selectedSize } = this.data;
    
    // 校验
    if (product.sizesEnabled && !selectedSize) {
      wx.showToast({ title: '请选择尺码', icon: 'none' });
      return;
    }
    
    if (deliveryMethod === 'mail') {
      if (!receiverName || !receiverPhone || !receiverAddress) {
        wx.showToast({ title: '请填写完整收货信息', icon: 'none' });
        return;
      }
    } else {
      if (!receiverName) {
        wx.showToast({ title: '请填写联系人', icon: 'none' });
        return;
      }
      // 当面交易手机号选填：如填写则需为有效手机号
      if (receiverPhone && !/^1\d{10}$/.test(receiverPhone)) {
        wx.showToast({ title: '请输入有效手机号或留空', icon: 'none' });
        return;
      }
    }
    
    this.setData({ loading: true });
    app.showLoading('提交中...');
    
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8';
      const res = await wx.cloud.callFunction({
        name: 'exchangeProduct',
        config: {
          env: cloudEnv
        },
        data: {
          productId: product._id,
          quantity: 1,
          recipient: {
            method: deliveryMethod,
            name: receiverName,
            phone: receiverPhone,
            address: deliveryMethod === 'mail' ? receiverAddress : '',
            remark
          },
          selectedSize: selectedSize
        }
      });
      
      if (res.result && res.result.success) {
        app.showToast(res.result.message || '兑换成功');
        this.setData({ showForm: false });
        // 刷新页面数据
        this.loadProductDetail(product._id);
        // 更新全局用户积分
        if (app.globalData.userInfo) {
          app.globalData.userInfo.totalPoints -= product.points;
        }
      } else {
        const msg = (res.result && res.result.message) || '兑换失败';
        throw new Error(msg);
      }
    } catch (err) {
      console.error('兑换失败', err);
      app.showToast(err.message || '兑换失败', 'error');
    } finally {
      this.setData({ loading: false });
      app.hideLoading();
    }
  }
});
