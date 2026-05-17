// src/main/services/ocrService.js
const sharp = require('sharp');
const config = require('../config');
//const fs = require('fs');
const path = require('path');

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
  const { detModelPath, recModelPath, dictionaryPath } = config.rapidOCR;

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
  const cloudEnabled = config.ocr.cloud && config.ocr.cloud.enabled;
  // 策略：用户启用云端 → 优先云端；否则直接用本地 RapidOCR
  if (cloudEnabled) {
    try {
      console.log('[OCR] 用户启用云端，优先尝试云端识别...');
      const result = await recognizeWithCloud(croppedBuffer);
      console.log('[OCR] ✅ 云端识别成功');
      return result;
    } catch (err) {
      console.warn(`[OCR] ⚠️ 云端识别失败 (${err.message})，自动回退到本地 RapidOCR`);
      return await recognizeWithRapidOCR(croppedBuffer, width, height);
    }
  } else {
    // 未启用云端，直接使用本地 RapidOCR
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

async function recognizeWithCloud(imageBuffer) {
  const cloudConfig = config.ocr.cloud;

  if (!cloudConfig || !cloudConfig.enabled) {
    throw new Error('云端 OCR 未配置');
  }

  switch (cloudConfig.provider) {
    case 'baidu':
      return await recognizeWithBaidu(imageBuffer, cloudConfig);
    case 'tencent':
      return await recognizeWithTencent(imageBuffer, cloudConfig);
    case 'aliyun':
      return await recognizeWithAliyun(imageBuffer, cloudConfig);
    default:
      throw new Error(`不支持的云端 OCR 提供商: ${cloudConfig.provider}`);
  }
}

/**
 * 使用云端 API 识别
 * @param {Buffer} imageBuffer - PNG Buffer
 */
async function recognizeWithBaidu(imageBuffer, cfg) {
  console.log(`[OCR] 🚀 使用引擎: 云端-百度`);
  const axios = require('axios');
  const qs = require('querystring');

  const tokenRes = await axios.post(
    'https://aip.baidubce.com/oauth/2.0/token',
    qs.stringify({
      grant_type: 'client_credentials',
      client_id: cfg.apiKey,
      client_secret: cfg.secretKey
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
  throw new Error('腾讯云 OCR 暂未实现');
}

async function recognizeWithAliyun(imageBuffer, cfg) {
  throw new Error('阿里云 OCR 暂未实现');
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