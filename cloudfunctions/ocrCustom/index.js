const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const fileID = event && event.fileID
  const imageUrl = event && event.imageUrl
  if (!fileID && !imageUrl) return { success: false, message: '缺少fileID或imageUrl' }
  try {
    const url = imageUrl ? imageUrl : (await cloud.getTempFileURL({ fileList: [fileID] })).fileList[0].tempFileURL
    if (!url) return { success: false, message: '无法获取临时链接' }
    const res = await cloud.openapi.ocr.printedText({ imgUrl: url })
    const items = Array.isArray(res.items) ? res.items : []
    const text = items.map(i => i.text).join('\n')
    return { success: true, text, raw: res }
  } catch (err) {
    return { success: false, message: err.message || 'OCR失败' }
  }
}