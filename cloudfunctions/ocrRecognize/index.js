const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const fileID = event && event.fileID
  const imageUrl = event && event.imageUrl

  // 读取密钥自环境变量，避免泄露
  const secretId = process.env.TENCENTCLOUD_SECRETID || process.env.SECRET_ID || process.env.SECRETID
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY || process.env.SECRET_KEY || process.env.SECRETKEY
  const region = process.env.TENCENTCLOUD_REGION || process.env.REGION || 'ap-guangzhou'

  if (!secretId || !secretKey) {
    return { success: false, message: '未配置腾讯云密钥，请在云函数环境变量中设置 TENCENTCLOUD_SECRETID/TENCENTCLOUD_SECRETKEY' }
  }

  try {
    let payload = {}
    if (fileID) {
      const dl = await cloud.downloadFile({ fileID })
      const base64 = Buffer.from(dl.fileContent).toString('base64')
      payload = { ImageBase64: base64 }
    } else if (imageUrl) {
      payload = { ImageUrl: imageUrl }
    } else {
      payload = { ImageUrl: 'https://static-1251142369.file.myqcloud.com/ocr-sample-images/general/chinese_text.jpg' }
    }

    const service = 'ocr'
    const host = 'ocr.tencentcloudapi.com'
    const action = 'GeneralBasicOCR'
    const version = '2018-11-19'
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
    const signedHeaders = 'content-type;host'
    const body = JSON.stringify(payload)
    const hashedRequestPayload = crypto.createHash('sha256').update(body).digest('hex')
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`

    const algorithm = 'TC3-HMAC-SHA256'
    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

    const kDate = crypto.createHmac('sha256', 'TC3' + secretKey).update(date).digest()
    const kService = crypto.createHmac('sha256', kDate).update(service).digest()
    const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex')

    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const options = {
      hostname: host,
      method: 'POST',
      path: '/',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'Authorization': authorization,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': region
      }
    }

    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
        })
      })
      req.on('error', reject)
      req.write(body)
      req.end()
    })

    const result = (response && response.Response) || {}
    if (result.Error) {
      throw new Error(`${result.Error.Code}: ${result.Error.Message}`)
    }
    const text = (result.TextDetections || []).map(item => item.DetectedText).join('\n')
    return { success: true, text, raw: result }
  } catch (error) {
    return { success: false, message: error.message || 'OCR识别错误' }
  }
}