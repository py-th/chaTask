const ort = require('onnxruntime-node');
const sharp = require('sharp');
const path = require('path');
const { createWorker } = require('tesseract.js');
const fs = require('fs');

class YOLOExtractor {
  constructor() {
    this.session = null;
    this.ocrWorker = null;
    this.inputSize = 640;
    this.confThreshold = 0.5; // 降低阈值，提高检出率
    this.nmsThreshold = 0.45;
    this.classes = ['avatar', 'text_info'];
    
    // ⭐ 修正：直接指定模型路径（开发环境）
    this.modelPath = path.join(process.cwd(), 'public/models/best.onnx');
    
    // 如果开发环境路径不存在，尝试生产环境路径
    if (!fs.existsSync(this.modelPath)) {
      this.modelPath = path.join(process.resourcesPath || '', 'models/best.onnx');
    }
    
    console.log('[YOLO1] 模型路径:', this.modelPath);
  }
  //图像感知哈希值
 // 计算平均哈希（aHash）
async computeImageHash(imageBuffer) {
  // 1. 缩放为 8x8，转换为灰度图，获取原始像素数据
  const { data, info } = await sharp(imageBuffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. 计算平均灰度值
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  const avg = sum / data.length;

  // 3. 生成二进制哈希字符串（大于平均值记为 '1'，否则为 '0'）
  let hash = '';
  for (let i = 0; i < data.length; i++) {
    hash += data[i] > avg ? '1' : '0';
  }
  return hash; // 返回 64 位二进制字符串，例如 "101010..."
}

  async init() {
    if (this.session) return;
    
    try {
      // 检查模型文件是否存在
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`模型文件不存在2: ${this.modelPath}\n请确保 best.onnx 放在 public/models/ 目录下`);
      }
      
      console.log('[YOLO3] 正在加载模型...');
      
      // 加载ONNX模型
      this.session = await ort.InferenceSession.create(this.modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all'
      });
      
      console.log('[YOLO4] 模型加载成功');
      
      // 初始化OCR
      this.ocrWorker = await createWorker('chi_sim');
      
      console.log('[YOLOExtractor5] 初始化完成');
    } catch (err) {
      console.error('[YOLOExtractor6] 初始化失败:', err);
      throw err;
    }
  }

  async extract(imageBuffer) {
    try {
      await this.init();
      
      console.log('[YOLO7] 开始处理截图...');
      
      // 1. 预处理图像
      const { tensor, metadata } = await this.preprocess(imageBuffer);
      
      // 2. 运行ONNX推理
      const feeds = {};
      feeds[this.session.inputNames[0]] = tensor;
      const results = await this.session.run(feeds);
      
      // 3. 解析检测结果
      const detections = this.parseDetections(results, metadata);
      console.log(`[YOLO8] 检测到 ${detections.length} 个目标:`, 
        detections.map(d => `${d.class}(${d.confidence.toFixed(2)})`).join(', '));
      
      // 4. 分离avatar和text_info
      const avatars = detections.filter(d => d.class === 'avatar');
      const texts = detections.filter(d => d.class === 'text_info');
      
      console.log(`[YOLO9] 头像: ${avatars.length} 个, 文本框: ${texts.length} 个`);
      
      // ⭐ 关键修改：适配单条消息场景
      if (avatars.length === 0) {
        return { 
          success: false, 
          reason: '未检测到头像区域',
          tip: '请确保截图包含发送者头像'
        };
      }
      
      if (texts.length === 0) {
        return {
          success: false,
          reason: '未检测到文本区域',
          tip: '请确保截图包含消息气泡'
        };
      }
      
      // 5. 关联并识别（适配单条/多条消息）
      const messages = await this.associateAndOCR(imageBuffer, avatars, texts);
      
      if (messages.length === 0) {
        return {
          success: false,
          reason: '检测到区域但OCR识别失败',
          rawDetections: { avatars: avatars.length, texts: texts.length }
        };
      }
      
      return {
        success: true,
        method: 'yolo-v8',
        messages: messages,
        rawDetections: { avatars: avatars.length, texts: texts.length }
      };
      
    } catch (err) {
      console.error('[YOLOExtractor10] 提取失败:', err);
      return { success: false, error: err.message };
    }
  }

  async preprocess(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
    
    // Letterbox缩放
    const scale = Math.min(this.inputSize / metadata.width, this.inputSize / metadata.height);
    const newWidth = Math.round(metadata.width * scale);
    const newHeight = Math.round(metadata.height * scale);
    
    const padX = (this.inputSize - newWidth) / 2;
    const padY = (this.inputSize - newHeight) / 2;
    
    const resized = await sharp(imageBuffer)
      .resize(newWidth, newHeight, { fit: 'fill' })
      .extend({
        top: Math.floor(padY),
        bottom: Math.ceil(padY),
        left: Math.floor(padX),
        right: Math.ceil(padX),
        background: { r: 114, g: 114, b: 114 }
      })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // 转换为Float32Array [1, 3, 640, 640] (NCHW)
    const data = new Float32Array(3 * this.inputSize * this.inputSize);
    
    for (let y = 0; y < this.inputSize; y++) {
      for (let x = 0; x < this.inputSize; x++) {
        const idx = (y * this.inputSize + x) * 3;
        const r = resized.data[idx] / 255.0;
        const g = resized.data[idx + 1] / 255.0;
        const b = resized.data[idx + 2] / 255.0;
        
        data[0 * this.inputSize * this.inputSize + y * this.inputSize + x] = r;
        data[1 * this.inputSize * this.inputSize + y * this.inputSize + x] = g;
        data[2 * this.inputSize * this.inputSize + y * this.inputSize + x] = b;
      }
    }
    
    const tensor = new ort.Tensor('float32', data, [1, 3, this.inputSize, this.inputSize]);
    
    return {
      tensor,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        scale: scale,
        padX: padX,
        padY: padY
      }
    };
  }

  parseDetections(output, metadata) {
    const outputName = this.session.outputNames[0];
    const outputTensor = output[outputName];
    const data = outputTensor.data;
    const dims = outputTensor.dims;
    
    console.log(`[YOLO11] 输出维度: [${dims.join(', ')}]`);
    
    let numAnchors, numClasses;
    
    // 自动检测输出格式
    if (dims.length === 3) {
      // [batch, features, anchors] - YOLOv8标准格式
      numAnchors = dims[2];
      numClasses = dims[1] - 4; // 总特征数 - 4个坐标
    } else {
      throw new Error('不支持的输出维度: ' + dims.length);
    }
    
    console.log(`[YOLO12] 锚点数: ${numAnchors}, 类别数: ${numClasses}`);
    
    const detections = [];
    
    for (let i = 0; i < numAnchors; i++) {
      // 找到最佳类别
      let maxConf = -Infinity;
      let classId = -1;
      
      for (let c = 0; c < numClasses; c++) {
        const conf = data[(4 + c) * numAnchors + i];
        if (conf > maxConf) {
          maxConf = conf;
          classId = c;
        }
      }
      
      if (maxConf > this.confThreshold && classId < this.classes.length) {
        const x = data[0 * numAnchors + i];
        const y = data[1 * numAnchors + i];
        const w = data[2 * numAnchors + i];
        const h = data[3 * numAnchors + i];
        
        // 转换到原图坐标
        const x1 = (x - w/2 - metadata.padX) / metadata.scale;
        const y1 = (y - h/2 - metadata.padY) / metadata.scale;
        const x2 = (x + w/2 - metadata.padX) / metadata.scale;
        const y2 = (y + h/2 - metadata.padY) / metadata.scale;
        
        // 边界检查
        if (x2 > 0 && y2 > 0 && x1 < metadata.originalWidth && y1 < metadata.originalHeight) {
          detections.push({
            class: this.classes[classId],
            confidence: maxConf,
            x1: Math.max(0, x1),
            y1: Math.max(0, y1),
            x2: Math.min(metadata.originalWidth, x2),
            y2: Math.min(metadata.originalHeight, y2),
            cx: (x - metadata.padX) / metadata.scale,
            cy: (y - metadata.padY) / metadata.scale,
            width: w / metadata.scale,
            height: h / metadata.scale
          });
        }
      }
    }
    
    // 按置信度排序并应用NMS
    return this.nms(detections);
  }

  nms(detections) {
    // 按类别分别做NMS
    const result = [];
    
    for (const cls of this.classes) {
      let clsDets = detections
        .filter(d => d.class === cls)
        .sort((a, b) => b.confidence - a.confidence);
      
      // 单条消息场景：如果检测到多个重叠框，只保留置信度最高的
      // 简单NMS
      const kept = [];
      for (const det of clsDets) {
        let shouldKeep = true;
        for (const k of kept) {
          if (this.iou(det, k) > this.nmsThreshold) {
            shouldKeep = false;
            break;
          }
        }
        if (shouldKeep) kept.push(det);
      }
      
      result.push(...kept);
    }
    
    return result;
  }

  iou(box1, box2) {
    const x1 = Math.max(box1.x1, box2.x1);
    const y1 = Math.max(box1.y1, box2.y1);
    const x2 = Math.min(box1.x2, box2.x2);
    const y2 = Math.min(box1.y2, box2.y2);
    
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (box1.x2 - box1.x1) * (box1.y2 - box1.y1);
    const area2 = (box2.x2 - box2.x1) * (box2.y2 - box2.y1);
    
    return intersection / (area1 + area2 - intersection + 1e-6);
  }

  async associateAndOCR(imageBuffer, avatars, texts) {
    const messages = [];
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    for (const text of texts) {
      let bestAvatar = null;
      let minDistance = Infinity;
      
      for (const avatar of avatars) {
        const dx = text.cx - avatar.cx;
        const dy = text.cy - avatar.cy;
        const distance = Math.sqrt(dx*dx + dy*dy);
        
        const height = Math.max(text.height, avatar.height);
        if (Math.abs(dy) > height * 0.8) continue;
        
        if (distance < minDistance) {
          minDistance = distance;
          bestAvatar = avatar;
        }
      }
      
      if (bestAvatar) {
        try {
          const isReceived = bestAvatar.cx < text.cx;
          
          // ⭐ 所有计算结果必须用 Math.round() 取整
          const avatarMargin = Math.round(Math.min(bestAvatar.width, bestAvatar.height) * 0.15);
          const avatarX1 = Math.max(0, Math.round(bestAvatar.x1) - avatarMargin);
          const avatarY1 = Math.max(0, Math.round(bestAvatar.y1) - avatarMargin);
          const avatarX2 = Math.min(metadata.width, Math.round(bestAvatar.x2) + avatarMargin);
          const avatarY2 = Math.min(metadata.height, Math.round(bestAvatar.y2) + avatarMargin);
          
          const avaW = avatarX2 - avatarX1;
          const avaH = avatarY2 - avatarY1;
          const avaSize = Math.max(avaW, avaH);
          
          let finalX1 = avatarX1;
          let finalY1 = avatarY1;
          let finalSize = avaSize;
          
          if (avaW < avaSize) {
            finalX1 = Math.max(0, Math.round(avatarX1 - (avaSize - avaW) / 2));
          }
          if (avaH < avaSize) {
            finalY1 = Math.max(0, Math.round(avatarY1 - (avaSize - avaH) / 2));
          }
          
          // ⭐ 边界检查也要取整
          finalX1 = Math.min(finalX1, Math.max(0, metadata.width - finalSize));
          finalY1 = Math.min(finalY1, Math.max(0, metadata.height - finalSize));
          finalSize = Math.min(finalSize, metadata.width, metadata.height);
          
          const avatarBuffer = await image.clone().extract({
            left: finalX1,
            top: finalY1,
            width: finalSize,
            height: finalSize
          }).resize(100, 100, { fit: 'cover' }).png().toBuffer();
          
          const avatarHashValue = await this.computeImageHash(avatarBuffer);
          // ⭐ 文本区域全部取整
          const textX = Math.round(text.x1);
          const textY = Math.round(text.y1);
          const textW = Math.round(text.x2 - text.x1);
          const textH = Math.round(text.y2 - text.y1);
          
        // 1. 确定缩放高度（固定64像素，保持宽高比）
        const targetHeight = 100;
        const scaleFactor = targetHeight / textH;
        const scaledWidth = Math.round(textW * scaleFactor);
        // 限制最大宽度避免过大
        const finalWidth = Math.min(scaledWidth, 1200);

        // 2. 提取并预处理：灰度 -> 二值化 -> 锐化 -> 缩放
        const textBuffer = await image.clone()
          .extract({
            left: textX,
            top: textY,
            width: textW,
            height: textH
          })
          .greyscale() // 灰度化
          .normalize()   // 增强对比度
          //.threshold(160)  // 自适应阈值（比简单二值化更好）可以尝试 128-180 之间的值                     
          .sharpen({ sigma: 1.5, flat: 1, jagged: 2 })  // 增强锐度
          .resize(finalWidth, targetHeight, { fit: 'fill' })//inside
          .toBuffer();
          
          // 3. 调用OCR时指定页面分割模式为单行
        const ocrResult = await this.ocrWorker.recognize(textBuffer, {
          tessedit_pageseg_mode: 6,
          preserve_interword_spaces: '1' // 尝试保留单词间空格
        });
          let recognizedText = ocrResult.data.text.trim();// 去掉前后空格
          recognizedText = recognizedText.replace(/\s+/g, ' ');  // 多个空格变一个
          // 可选：移除中文字符间的空格（如果存在）
          recognizedText = recognizedText.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

          if (recognizedText) {
            messages.push({
              text: recognizedText,
              textConfidence: ocrResult.data.confidence / 100,
              avatarBase64: `data:image/png;base64,${avatarBuffer.toString('base64')}`,
              avatarHash: avatarHashValue,
              avatarRegion: {
                x: finalX1,
                y: finalY1,
                width: finalSize,
                height: finalSize
              },
              textRegion: {
                x: textX,
                y: textY,
                width: textW,
                height: textH
              },
              direction: isReceived ? 'received' : 'sent',
              confidence: (text.confidence + bestAvatar.confidence) / 2
            });
          }
        } catch (err) {
          console.error('[YOLO] 处理失败:', err);
        }
      }
    }
    
    return messages;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  async terminate() {
    if (this.ocrWorker) {
      await this.ocrWorker.terminate();
      this.ocrWorker = null;
    }
    this.session = null;
  }
}

module.exports = { YOLOExtractor };