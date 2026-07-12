// src/main/services/ocrService.js
const sharp = require('sharp');
const { getEffectiveConfig } = require('../configManager');

// 基础版仅使用本地 RapidOCR，所有云端 OCR 路径已移除。
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
  const cfg = getEffectiveConfig();
  const { detModelPath, recModelPath, dictionaryPath } = cfg.rapidOCR;

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
    croppedBuffer = await sharp(imageBuffer)
      .extract({ left: x, top: y, width, height })
      .png()
      .toBuffer();
    console.log(`[OCR] ✅ 裁剪完成: ${croppedBuffer.length} bytes, 尺寸 ${width}x${height}`);
  } catch (err) {
    console.error('[OCR] ❌ 裁剪失败:', err.message);
    throw err;
  }

  return await recognizeWithRapidOCR(croppedBuffer, width, height);
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
 * @param {Buffer} pngBuffer - PNG Buffer（内部会转为 raw RGBA）
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
