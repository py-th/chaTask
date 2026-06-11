// src/main/services/ocrService.js
const sharp = require('sharp');
const { getEffectiveConfig } = require('../configManager');
const path = require('path');
const crypto = require('crypto');

// QPS 限流管理器：百度云免费版限制 2 QPS
class QPSLimiter {
  constructor(maxRequests = 2, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requestTimes = []; // 记录请求时间
    this.queue = []; // 请求队列
    this.isProcessing = false;
  }

  // 检查是否可以执行请求
  canMakeRequest() {
    const now = Date.now();
    // 清理过期的时间记录
    this.requestTimes = this.requestTimes.filter(time => now - time < this.windowMs);
    return this.requestTimes.length < this.maxRequests;
  }

  // 等待直到可以执行请求
  async waitForSlot() {
    return new Promise((resolve) => {
      const tryProcess = () => {
        if (this.canMakeRequest()) {
          this.requestTimes.push(Date.now());
          resolve();
        } else {
          // 计算需要等待的时间
          const oldestRequest = this.requestTimes[0];
          const waitTime = this.windowMs - (Date.now() - oldestRequest) + 10;
          setTimeout(tryProcess, waitTime);
        }
      };
      tryProcess();
    });
  }
}

// 百度云 API 限流器（2 QPS）
const baiduLimiter = new QPSLimiter(2, 1000);
// 腾讯云 API 限流器（免费版 2 QPS）
const tencentLimiter = new QPSLimiter(2, 1000);
// 阿里云 API 限流器（免费版 2 QPS）
const aliyunLimiter = new QPSLimiter(2, 1000);

// Access Token 缓存
let accessTokenCache = {
  token: null,
  expiresAt: 0,
  apiKey: null,
  secretKey: null
};

// ============================================================
// OCR 引擎策略（2级）：
// 1. 若用户启用云端配置 → 优先云端 API
//    云端失败/断网/超时 → 自动回退到本地 RapidOCR
// 2. 若用户未启用云端 → 直接使用本地 RapidOCR
//
// 注意：所有 OCR 操作均在 Electron 主进程执行，不阻塞渲染进程
// ============================================================

let rapidOcrInstance = null;

/**
 * 判断是否为网络相关错误
 */
function isNetworkRelatedError(err) {
  const message = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return code === 'econnrefused' || 
         code === 'enetunreach' || 
         code === 'ehostunreach' ||
         code === 'enotfound' ||
         code === 'enetreset' ||
         code === 'econnreset' ||
         message.includes('network') ||
         message.includes('connection') ||
         message.includes('网络');
}

/**
 * 判断是否为配置相关错误
 */
function isConfigRelatedError(err) {
  const message = (err.message || '').toLowerCase();
  return message.includes('未配置') || 
         message.includes('配置') ||
         message.includes('api key') ||
         message.includes('secret key') ||
         message.includes('accesskey') ||
         message.includes('access_key') ||
         message.includes('invalid') ||
         message.includes('unauthorized') ||
         message.includes('auth');
}

/**
 * 判断是否为超时相关错误
 */
function isTimeoutRelatedError(err) {
  const message = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  const name = (err.name || '').toLowerCase();
  return code === 'etimedout' ||
         code === 'econnaborted' ||
         name === 'timeouterror' ||
         name === 'abort' ||
         message.includes('timeout') ||
         message.includes('超时') ||
         message.includes('timed out');
}

/**
 * 判断是否为API限制相关错误
 */
function isApiLimitError(err) {
  const message = (err.message || '').toLowerCase();
  return message.includes('qps') ||
         message.includes('limit') ||
         message.includes('quota') ||
         message.includes('rate') ||
         message.includes('请求过于频繁') ||
         message.includes('频率限制');
}

/**
 * 初始化 OCR 服务（主进程调用，不阻塞渲染进程）
 */
async function initOCR() {
  try {
    await initRapidOCR();
    console.log('[OCR] ✅ RapidOCR 本地模型初始化成功');
    return { engine: 'rapidocr', ready: true };
  } catch (err) {
    console.error('[OCR] ❌ RapidOCR 本地模型初始化失败:', err.message);
    throw err;
  }
}
/**
 * 初始化 RapidOCR（基于 PaddleOCR + ONNXRuntime）
 */
async function initRapidOCR() {
  const Ocr = require('@repeato/ocr');
  const cfg = getEffectiveConfig();
  const { detModelPath, recModelPath, dictionaryPath } = cfg.rapidOCR;

  const requiredFiles = [
    { path: detModelPath, name: '检测模型' },
    { path: recModelPath, name: '识别模型' },
    { path: dictionaryPath, name: '字典文件' }
  ];

  /*for (const file of requiredFiles) {
    if (!fs.existsSync(file.path)) {
      throw new Error(`RapidOCR ${file.name} 文件不存在: ${file.path}`);
    }
  }*/

  rapidOcrInstance = await Ocr.create({
    models: {
      detectionPath: detModelPath,
      recognitionPath: recModelPath,
      dictionaryPath: dictionaryPath
    },
    onnxOptions: {
      executionProviders: ['cpu'],
      intraOpNumThreads: 1,
      interOpNumThreads: 1
    },
    isDebug: process.env.NODE_ENV === 'development'
  });

  console.log('[RapidOCR] 模型加载完成');
}

/**
 * 从图像区域识别文字（统一入口）
 * @param {Buffer} imageBuffer - 完整图像 Buffer
 * @param {Object} region - { x, y, width, height }
 * @returns {Promise<string>} 识别出的文字
 */

async function recognizeTextFromRegion(imageBuffer, region) {
  const { x, y, width, height } = region;

  console.log(`[OCR] 收到识别请求: region=(${x},${y},${width},${height}), 原图大小=${imageBuffer.length} bytes`);

  let croppedBuffer;
  try {
    // 1. 裁剪目标区域（输出 PNG，云端和本地都需要）
    croppedBuffer = await sharp(imageBuffer)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer();
    console.log(`[OCR] ✅ 裁剪完成: ${croppedBuffer.length} bytes, 尺寸 ${width}x${height}`);
  } catch (err) {
    console.error('[OCR] ❌ 裁剪失败:', err.message);
    throw err;
  }

  const debugDir = path.join(process.cwd(), 'temp', 'ocr_debug');
  /* 调试保存图片
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
  const debugFile = path.join(debugDir, `ocr_${Date.now()}_${width}x${height}.png`);
  fs.writeFileSync(debugFile, croppedBuffer);
  console.log(`[OCR] 🖼️ 调试图像已保存: ${debugFile}`);
  */
  const cfg = getEffectiveConfig();
  const engine = cfg.ocr.engine;
  // 策略：根据用户选择的引擎决定
  if (engine && engine !== 'paddle') {
    try {
      console.log(`[OCR] 用户选择引擎: ${engine}，尝试识别...`);
      const result = await recognizeWithCloud(croppedBuffer, engine);
      console.log('[OCR] ✅ 云端识别成功');
      return result;
    } catch (err) {
      // 错误分类 - 内联定义以避免函数顺序问题
      const msg = (err.message || '').toLowerCase();
      const code = (err.code || '').toLowerCase();
      const name = (err.name || '').toLowerCase();
      
      const isNetworkError = code === 'econnrefused' || code === 'enetunreach' || 
                             code === 'ehostunreach' || code === 'enotfound' ||
                             code === 'enetreset' || code === 'econnreset' ||
                             msg.includes('network') || msg.includes('connection') ||
                             msg.includes('网络');
      
      const isConfigError = msg.includes('未配置') || msg.includes('配置') ||
                            msg.includes('api key') || msg.includes('secret key') ||
                            msg.includes('accesskey') || msg.includes('access_key') ||
                            msg.includes('invalid') || msg.includes('unauthorized') ||
                            msg.includes('auth');
      
      const isTimeoutError = code === 'etimedout' || code === 'econnaborted' ||
                             name === 'timeouterror' || name === 'abort' ||
                             msg.includes('timeout') || msg.includes('超时') ||
                             msg.includes('timed out');
      
      const isApiLimitError = msg.includes('qps') || msg.includes('limit') ||
                              msg.includes('quota') || msg.includes('rate') ||
                              msg.includes('请求过于频繁') || msg.includes('频率限制');
      
      // 构建详细错误信息
      const errorCategory = isNetworkError ? '[网络错误]' : 
                            isConfigError ? '[配置错误]' : 
                            isTimeoutError ? '[超时错误]' : 
                            isApiLimitError ? '[API限制]' : '[其他错误]';
      
      console.warn(`[OCR] ⚠️ ${engine} ${errorCategory} 识别失败 (${err.message})，自动回退到本地 RapidOCR`);
      
      if (isConfigError) {
        console.warn(`[OCR] 💡 提示：API配置可能不完整，请检查设置中的 ${engine} OCR 配置`);
      }
      
      return await recognizeWithRapidOCR(croppedBuffer, width, height);
    }
  } else {
    // 未启用云端或选择本地，直接使用本地 RapidOCR
    return await recognizeWithRapidOCR(croppedBuffer, width, height);
  }
}

/**
 * 从 box 四边形坐标计算包围矩形
 * box 格式: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
 */
function boxToFrame(box) {
  if (!box || !Array.isArray(box) || box.length < 4) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const xs = box.map(p => p[0]);
  const ys = box.map(p => p[1]);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top)
  };
}

/**
 * 使用 RapidOCR 本地识别
 * @param {Buffer} imageBuffer - PNG Buffer（内部会转为 raw RGBA）
 */

async function recognizeWithRapidOCR(pngBuffer, origWidth, origHeight) {
  if (!rapidOcrInstance) {
    throw new Error('RapidOCR 未初始化');
  }
  console.log(`[OCR] 🚀 使用引擎: 本地 RapidOCR`);
  console.log(`[RapidOCR] 开始识别，原始尺寸 ${origWidth}x${origHeight}`);

  let scale = 1;
  if (origHeight < 48) scale = 3;
  else if (origHeight < 80) scale = 2;

  let preprocessedBuffer;
  let finalWidth = origWidth;
  let finalHeight = origHeight;

  try {
    if (scale > 1) {
      console.log(`[RapidOCR] 文字较小(${origHeight}px)，放大 ${scale} 倍预处理...`);
      preprocessedBuffer = await sharp(pngBuffer)
        .resize(origWidth * scale, origHeight * scale, { kernel: sharp.kernel.lanczos3 })
        .greyscale()
        .sharpen({ sigma: 1.2, flat: 1, jagged: 2 })
        .png()
        .toBuffer();
      finalWidth = origWidth * scale;
      finalHeight = origHeight * scale;
      console.log(`[RapidOCR] 预处理后尺寸: ${finalWidth}x${finalHeight}`);
    } else {
      preprocessedBuffer = pngBuffer;
    }
  } catch (err) {
    console.warn('[RapidOCR] 预处理失败，使用原图:', err.message);
    preprocessedBuffer = pngBuffer;
  }

  let rawData, info;
  try {
    const result = await sharp(preprocessedBuffer)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true });
    rawData = result.data;
    info = result.info;
    console.log(`[RapidOCR] raw 数据: ${rawData.length} bytes, ${info.width}x${info.height}x${info.channels}`);
  } catch (err) {
    console.error('[RapidOCR] ❌ 转 raw 失败:', err.message);
    throw err;
  }

  let result;
  try {
    result = await rapidOcrInstance.detect({
      data: new Uint8ClampedArray(rawData),
      width: info.width,
      height: info.height
    });
  } catch (err) {
    console.error('[RapidOCR] ❌ detect 调用失败:', err.message);
    throw err;
  }

  if (!result || !result.texts || result.texts.length === 0) {
    console.warn('[RapidOCR] ⚠️ 未检测到任何文本');
    return '';
  }

  console.log(`[RapidOCR] 检测到 ${result.texts.length} 个文本框`);
  result.texts.forEach((line, i) => {
    // ⭐ @repeato/ocr 实际返回字段: text, mean, box
    const text = line.text || '';
    const score = typeof line.mean === 'number' ? line.mean.toFixed(3) : 'N/A';
    const frame = boxToFrame(line.box);
    console.log(`  [${i}] "${text}" | mean=${score} | frame=(${frame.left},${frame.top},${frame.width}x${frame.height})`);
  });

  // 按位置排序（从上到下，从左到右）
  const sortedTexts = result.texts.sort((a, b) => {
    const frameA = boxToFrame(a.box);
    const frameB = boxToFrame(b.box);
    if (Math.abs(frameA.top - frameB.top) > 10) {
      return frameA.top - frameB.top;
    }
    return frameA.left - frameB.left;
  });
  // 过滤低置信度结果，合并文本
  const texts = sortedTexts.map(line => line.text || '').join(' ');
  const finalText = postProcess(texts);

  console.log(`[RapidOCR] ✅ 最终识别结果: "${finalText}"`);
  return finalText;
}

async function recognizeWithCloud(imageBuffer, engine) {
  const ocrConfig = getEffectiveConfig().ocr;

  if (!engine || engine === 'paddle') {
    throw new Error('未选择云端 OCR 引擎');
  }

  // 构建配置对象，使其与之前的 cloudConfig 兼容
  const cfg = {
    timeout: ocrConfig.timeout,
    baidu: ocrConfig.baidu,
    aliyun: ocrConfig.aliyun,
    tencent: ocrConfig.tencent
  };

  switch (engine) {
    case 'baidu':
      return await recognizeWithBaidu(imageBuffer, cfg);
    case 'tencent':
      return await recognizeWithTencent(imageBuffer, cfg);
    case 'aliyun':
      return await recognizeWithAliyun(imageBuffer, cfg);
    default:
      throw new Error(`不支持的 OCR 引擎: ${engine}`);
  }
}

/**
 * 获取或刷新百度云 Access Token（带缓存）
 */
async function getBaiduAccessToken(bdCfg, cfg) {
  const now = Date.now();
  
  // 检查缓存是否有效（提前 5 分钟过期）
  if (
    accessTokenCache.token &&
    accessTokenCache.apiKey === bdCfg.apiKey &&
    accessTokenCache.secretKey === bdCfg.secretKey &&
    now < accessTokenCache.expiresAt - 5 * 60 * 1000
  ) {
    console.log(`[OCR] 使用缓存的 Access Token`);
    return accessTokenCache.token;
  }

  console.log(`[OCR] 获取新的 Access Token`);
  const axios = require('axios');
  const qs = require('querystring');

  // QPS 限流
  await baiduLimiter.waitForSlot();

  const tokenRes = await axios.post(
    'https://aip.baidubce.com/oauth/2.0/token',
    qs.stringify({
      grant_type: 'client_credentials',
      client_id: bdCfg.apiKey,
      client_secret: bdCfg.secretKey
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: cfg.timeout || 10000
    }
  );

  const accessToken = tokenRes.data.access_token;
  if (!accessToken) {
    throw new Error('百度 OCR 获取 Access Token 失败');
  }

  // 更新缓存
  accessTokenCache = {
    token: accessToken,
    expiresAt: now + (tokenRes.data.expires_in * 1000 || 30 * 24 * 60 * 60 * 1000), // 默认 30 天
    apiKey: bdCfg.apiKey,
    secretKey: bdCfg.secretKey
  };

  console.log(`[OCR] Access Token 缓存成功，有效期至 ${new Date(accessTokenCache.expiresAt).toLocaleString()}`);
  return accessToken;
}

/**
 * 使用云端 API 识别
 * @param {Buffer} imageBuffer - PNG Buffer
 */
async function recognizeWithBaidu(imageBuffer, cfg) {
  console.log(`[OCR] 🚀 使用引擎: 云端-百度`);
  const axios = require('axios');
  const qs = require('querystring');

  const bdCfg = cfg.baidu;
  if (!bdCfg || !bdCfg.apiKey || !bdCfg.secretKey) {
    throw new Error('百度云 OCR 未配置 API Key / Secret Key');
  }

  // 获取 Access Token（带缓存）
  const accessToken = await getBaiduAccessToken(bdCfg, cfg);

  // QPS 限流：在实际 OCR 请求前检查
  await baiduLimiter.waitForSlot();
  console.log(`[OCR] 百度云 QPS 限流检查通过`);

  const base64 = imageBuffer.toString('base64');
  const ocrRes = await axios.post(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${accessToken}`,
    qs.stringify({ image: base64 }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: cfg.timeout || 10000
    }
  );

  if (ocrRes.data.words_result && ocrRes.data.words_result.length > 0) {
    return ocrRes.data.words_result.map(w => w.words).join(' ');
  }

  if (ocrRes.data.error_msg) {
    throw new Error(`百度 OCR 错误: ${ocrRes.data.error_msg}`);
  }

  throw new Error('百度 OCR 识别失败，无返回结果');
}

async function recognizeWithTencent(imageBuffer, cfg) {
  console.log(`[OCR] 🚀 使用引擎: 云端-腾讯云`);
  const axios = require('axios');

  const txCfg = cfg.tencent;
  if (!txCfg || !txCfg.secretId || !txCfg.secretKey) {
    throw new Error('腾讯云 OCR 未配置 SecretId / SecretKey');
  }

  // QPS 限流：等待可用槽位
  await tencentLimiter.waitForSlot();
  console.log(`[OCR] 腾讯云 QPS 限流检查通过`);

  const service = 'ocr';
  const host = 'ocr.tencentcloudapi.com';
  const action = 'GeneralBasicOCR';
  const version = '2018-11-19';
  const region = 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().substring(0, 10);

  const payload = JSON.stringify({
    ImageBase64: imageBuffer.toString('base64')
  });

  // TC3-HMAC-SHA256 签名
  const canonicalRequest = [
    'POST',
    '/',
    '',
    `content-type:application/json; charset=utf-8\nhost:${host}\n`,
    'content-type;host',
    crypto.createHash('sha256').update(payload, 'utf8').digest('hex')
  ].join('\n');

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');

  const kDate = crypto.createHmac('sha256', `TC3${txCfg.secretKey}`).update(date).digest();
  const kService = crypto.createHmac('sha256', kDate).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${txCfg.secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Version': version,
    'X-TC-Timestamp': timestamp,
    'X-TC-Region': region,
    'Authorization': authorization
  };

  const res = await axios.post(`https://${host}`, payload, {
    headers,
    timeout: cfg.timeout || 10000
  });

  if (res.data.Response.Error) {
    throw new Error(`腾讯云 OCR 错误: ${res.data.Response.Error.Message}`);
  }

  const detections = res.data.Response.TextDetections;
  if (detections && detections.length > 0) {
    return detections.map(d => d.DetectedText).join(' ');
  }

  throw new Error('腾讯云 OCR 识别失败，无返回结果');
}

async function recognizeWithAliyun(imageBuffer, cfg) {
  console.log(`[OCR] 🚀 使用引擎: 云端-阿里云`);
  const axios = require('axios');

  const aliCfg = cfg.aliyun;
  if (!aliCfg || !aliCfg.accessKeyId || !aliCfg.accessKeySecret) {
    throw new Error('阿里云 OCR 未配置 AccessKey ID / Secret');
  }

  // QPS 限流：等待可用槽位
  await aliyunLimiter.waitForSlot();
  console.log(`[OCR] 阿里云 QPS 限流检查通过`);

  const base64 = imageBuffer.toString('base64');

  // 公共参数
  const params = {
    AccessKeyId: aliCfg.accessKeyId,
    Action: 'RecognizeGeneral',
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: Date.now() + Math.random().toString(36).substring(2),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2021-07-07'
  };

  // 构建签名字符串
  const sortedKeys = Object.keys(params).sort();
  const canonicalizedQuery = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const stringToSign = `POST&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQuery)}`;
  const signKey = `${aliCfg.accessKeySecret}&`;
  const signature = crypto.createHmac('sha1', signKey).update(stringToSign, 'utf8').digest('base64');

  params.Signature = signature;

  const queryString = Object.keys(params).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const url = `https://ocr-api.cn-hangzhou.aliyuncs.com/?${queryString}`;

  const res = await axios.post(url, { ImageBase64: base64 }, {
    headers: {
      'Content-Type': 'application/json',
      'x-acs-signature-method': 'HMAC-SHA1',
      'x-acs-signature-version': '1.0'
    },
    timeout: cfg.timeout || 10000
  });

  if (res.data.Code) {
    throw new Error(`阿里云 OCR 错误: ${res.data.Message || res.data.Code}`);
  }

  const data = res.data.Data;
  if (data && data.content) {
    return data.content;
  }

  throw new Error('阿里云 OCR 识别失败，无返回结果');
}

function postProcess(text) {
  if (!text) return '';
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

  const corrections = [
    { from: /曰/g, to: '日' },
    { from: /曱/g, to: '甲' },
    { from: /甴/g, to: '由' },
    { from: /【/g, to: '[' },
    { from: /】/g, to: ']' },
    { from: /，，/g, to: '，' },
    { from: /。。/g, to: '。' },
    { from: /！！/g, to: '！' },
    { from: /？？/g, to: '？' },
  ];

  for (const c of corrections) {
    text = text.replace(c.from, c.to);
  }

  text = text.replace(/^\S$|\s\S\s/g, match => {
    const validSingleChars = ['我', '你', '他', '她', '它', '的', '了', '在', '是'];
    return validSingleChars.includes(match.trim()) ? match : '';
  });

  return text.trim();
}
/**
 * 释放 OCR 资源
 */
async function terminateOCR() {
  if (rapidOcrInstance) {
    rapidOcrInstance = null;
  }
}

module.exports = {
  initOCR,
  recognizeTextFromRegion,
  terminateOCR
};