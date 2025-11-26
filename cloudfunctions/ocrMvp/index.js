const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  try {
    const fileID = event && event.fileID
    let imgUrl = event && event.imgUrl
    if (!imgUrl && fileID) {
      const tmp = await cloud.getTempFileURL({ fileList: [fileID] })
      imgUrl = tmp.fileList && tmp.fileList[0] && tmp.fileList[0].tempFileURL
    }
    if (!imgUrl) return { success: false, message: '缺少图片URL或fileID' }

    const res = await cloud.openapi.ocr.printedText({ imgUrl })
    const items = Array.isArray(res.items) ? res.items : []
    const text = items.map(i => i.text).join('\n')
    return { success: true, text, raw: res }
  } catch (err) {
    return { success: false, message: err.message || 'OCR失败' }
  }
}
