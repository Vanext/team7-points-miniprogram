function recognizeTextByFileID(fileID) {
  // 1) 优先使用 openapi 自定义云函数（小程序端带令牌）
  return wx.cloud.callFunction({
    name: 'ocrCustom',
    data: { fileID }
  }).then(res => {
    const r = res && res.result
    if (r && r.success && typeof r.text === 'string') return r.text
    throw new Error(r && r.message ? r.message : 'OCR识别失败')
  }).catch(() => {
    // 2) 退回 CloudBase 内置 AI 函数（若环境已启用）
    return wx.cloud.callFunction({
      name: 'tcb-ai-image-recognition',
      data: { fileID, action: 'ocr', ocrType: 'general' }
    }).then(res2 => {
      const r2 = res2 && res2.result
      let text = ''
      if (r2 && r2.data && Array.isArray(r2.data.items)) {
        text = r2.data.items.map(i => i.text).join('\n')
      } else if (r2 && r2.data && typeof r2.data.text === 'string') {
        text = r2.data.text
      } else if (r2 && typeof r2.text === 'string') {
        text = r2.text
      }
      if (text) return text
      throw new Error('OCR识别失败')
    }).catch(() => {
      // 3) 最后退回直调腾讯云 API 的云函数
      return wx.cloud.callFunction({
        name: 'ocrRecognize',
        data: { fileID }
      }).then(res3 => {
        const r3 = res3 && res3.result
        if (r3 && r3.success) return r3.text || ''
        throw new Error(r3 && r3.message ? r3.message : 'OCR识别失败')
      })
    })
  })
}

module.exports = {
  recognizeTextByFileID
}