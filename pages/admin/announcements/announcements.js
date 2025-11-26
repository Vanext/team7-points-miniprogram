// pages/admin/announcements/announcements.js
const app = getApp();

Page({
  data: {
    title: '',
    content: '',
    isActive: true,
    types: ['通知', '预告', '活动','训练'],
    typeIndex: 0,
    list: [],
    showCreateForm: false,
    homeSelectedIds: [],
    editModal: {
      show: false,
      id: '',
      title: '',
      content: '',
      isActive: true,
      typeIndex: 0
    }
  },

  onLoad() {
    this.fetchList();
  },

  onShow() {
    this.fetchList();
  },

  onInputTitle(e) {
    this.setData({ title: e.detail.value });
  },
  onInputContent(e) {
    this.setData({ content: e.detail.value });
  },
  onTypeChange(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ typeIndex: idx });
  },
  onActiveChange(e) {
    this.setData({ isActive: !!e.detail.value });
  },

  async fetchList() {
    try {
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'adminManageAnnouncements', config: { env: cloudEnv }, data: { action: 'list', query: { limit: 50 } } });
      const list = (res.result && res.result.data) || [];
      const mapped = list.map(x => ({
        ...x,
        updateTimeText: app.formatTime(x.updateTime || x.createTime || new Date())
      }));
      const preSelected = mapped.filter(x => x.showOnHome === true).map(x => x._id)
      this.setData({ list: mapped, homeSelectedIds: preSelected });
    } catch (e) {
      console.error('获取公告列表失败', e);
      app.showToast('获取列表失败', 'error');
    }
  },

  onCreate: function() {
    var self = this;
    var title = self.data.title;
    var content = self.data.content;
    var isActive = self.data.isActive;
    var types = self.data.types;
    var typeIndex = self.data.typeIndex;
    if (!title || !content) {
      app.showToast('请填写标题和内容', 'error');
      return;
    }
    app.showLoading('发布中...');
    const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
    wx.cloud.callFunction({
      name: 'adminManageAnnouncements',
      config: { env: cloudEnv },
      data: { action: 'create', data: { title: title, content: content, isActive: isActive, type: types[typeIndex] } }
    }).then(function(res) {
      if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message);
      app.hideLoading();
      app.showToast('发布成功');
      self.setData({ title: '', content: '', isActive: true, typeIndex: 0 });
      self.fetchList();
      // 通知首页刷新公告
      self.notifyHomePageRefresh();
    }).catch(function(e) {
      app.hideLoading();
      console.error('发布失败', e);
      app.showToast(e.message || '发布失败', 'error');
    });
  },

  async onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除该公告吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          app.showLoading('删除中...');
          const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
          const res = await wx.cloud.callFunction({ name: 'adminManageAnnouncements', config: { env: cloudEnv }, data: { action: 'delete', data: { id } } });
          if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message);
          app.showToast('删除成功');
          this.fetchList();
          // 通知首页刷新公告
          this.notifyHomePageRefresh();
        } catch (e) {
          console.error('删除失败', e);
          app.showToast(e.message || '删除失败', 'error');
        } finally {
          app.hideLoading();
        }
      }
    });
  },

  async onEdit(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(x => x._id === id);
    if (!item) return;
    
    // 设置编辑弹窗的数据
    this.setData({
      editModal: {
        show: true,
        id: id,
        title: item.title,
        content: item.content,
        isActive: !!item.isActive,
        typeIndex: Math.max(0, this.data.types.indexOf(item.type || '通知'))
      }
    });
  },

  // 编辑弹窗相关方法
  onEditModalInputTitle(e) {
    this.setData({
      'editModal.title': e.detail.value
    });
  },

  onEditModalInputContent(e) {
    this.setData({
      'editModal.content': e.detail.value
    });
  },

  onEditModalTypeChange(e) {
    this.setData({
      'editModal.typeIndex': Number(e.detail.value || 0)
    });
  },

  onEditModalActiveChange(e) {
    this.setData({
      'editModal.isActive': !!e.detail.value
    });
  },

  onEditModalCancel() {
    this.setData({
      'editModal.show': false
    });
  },

  async onEditModalConfirm() {
    const { editModal, types } = this.data;
    const { id, title, content, isActive, typeIndex } = editModal;
    
    if (!title || !content) {
      app.showToast('请填写标题和内容', 'error');
      return;
    }

    try {
      app.showLoading('更新中...');
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({
        name: 'adminManageAnnouncements',
        config: { env: cloudEnv },
        data: { 
          action: 'update', 
          data: { id, title, content, isActive, type: types[typeIndex] } 
        }
      });
      
      if (!res.result || res.result.success !== true) {
        throw new Error(res.result && res.result.message);
      }
      
      app.showToast('更新成功');
      this.setData({ 'editModal.show': false });
      this.fetchList();
      // 通知首页刷新公告
      this.notifyHomePageRefresh();
    } catch (e) {
      console.error('更新失败', e);
      app.showToast(e.message || '更新失败', 'error');
    } finally {
      app.hideLoading();
    }
  },

  // 通知首页刷新公告
  notifyHomePageRefresh() {
    // 设置全局标记，首页可以检查这个标记来决定是否需要刷新
    getApp().globalData.shouldRefreshAnnouncements = true;
  }
  ,
  // 展开/折叠发布表单
  onToggleCreateForm() {
    this.setData({ showCreateForm: !this.data.showCreateForm })
  },

  // 首页展示选择：勾选/取消
  async onHomeSwitchChange(e) {
    const id = e.currentTarget.dataset.id
    const checked = !!(e.detail && e.detail.value)
    if (!id) return
    try {
      app.showLoading('更新首页展示...')
      const cloudEnv = app.globalData.cloudEnv || 'cloudbase-0gvjuqae479205e8'
      const res = await wx.cloud.callFunction({ name: 'adminManageAnnouncements', config: { env: cloudEnv }, data: { action: 'toggleFeatured', data: { id, value: checked } } })
      if (!res.result || res.result.success !== true) throw new Error(res.result && res.result.message)
      // 本地同步已选集合
      const current = this.data.homeSelectedIds.slice()
      const idx = current.indexOf(id)
      if (checked && idx === -1) {
        current.push(id)
      } else if (!checked && idx >= 0) {
        current.splice(idx, 1)
      }
      this.setData({ homeSelectedIds: current })
      app.showToast('已更新')
      this.notifyHomePageRefresh()
    } catch (err) {
      console.error('更新首页展示失败', err)
      app.showToast(err.message || '更新失败', 'error')
      this.fetchList()
    } finally {
      app.hideLoading()
    }
  }
});
