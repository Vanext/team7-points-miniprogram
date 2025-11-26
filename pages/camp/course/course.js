// pages/camp/course/course.js
Page({
  data: {
    swimUrl: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/swim.jpg',
    bikeUrl: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/bike.jpg',
    runUrl: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/run.jpg',
    logoUrl: 'cloud://cloudbase-0gvjuqae479205e8.636c-cloudbase-0gvjuqae479205e8-1377814389/ironman-703-hengqin-logo.jpg'
  },
  async onLoad() {
    try {
      const r = await wx.cloud.callFunction({ name: 'getCampData', data: { camp_id: 'camp_hengqin_2026' } })
      const plan = r && r.result && r.result.campPlan ? r.result.campPlan : null
      if (!plan) return
      let logoUrl = plan.logo_url || plan.hero_url || '/images/default-image.png'
      let swimUrl = plan.course_swim || '/images/default-image.png'
      let bikeUrl = plan.course_bike || '/images/default-image.png'
      let runUrl = plan.course_run || '/images/default-image.png'
      const fileIds = [logoUrl, swimUrl, bikeUrl, runUrl].filter(u => typeof u === 'string' && u.indexOf('cloud://') === 0)
      if (fileIds.length) {
        const out = await wx.cloud.getTempFileURL({ fileList: fileIds })
        (out.fileList || []).forEach(it => {
          if (it.fileID === logoUrl && it.tempFileURL) logoUrl = it.tempFileURL
          if (it.fileID === swimUrl && it.tempFileURL) swimUrl = it.tempFileURL
          if (it.fileID === bikeUrl && it.tempFileURL) bikeUrl = it.tempFileURL
          if (it.fileID === runUrl && it.tempFileURL) runUrl = it.tempFileURL
        })
      }
      this.setData({ logoUrl, swimUrl, bikeUrl, runUrl })
    } catch (_) {}
  }
})