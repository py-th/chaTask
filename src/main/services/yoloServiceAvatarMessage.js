// src/main/services/yoloService.js
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');
const config = require('../config');
const { computeImageHash } = require('../utils/hash');
const { recognizeTextFromRegion } = require('./ocrService');

class YOLOService {
  constructor() {
    this.session = null;
    this.inputSize = config.yolo.inputSize;
    this.confThreshold = config.yolo.confThreshold;
    this.nmsThreshold = config.yolo.nmsThreshold;
    this.classes = config.yolo.classes;
    this.modelPath = config.modelPath_avatar_text;
  }

  async init() {
    if (this.session) return;
    if (!fs.existsSync(this.modelPath)) {
      throw new Error(`模型文件不存在: ${this.modelPath}`);
    }
    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all'
    });
  }

  async preprocess(imageBuffer) {
    const metadata = await sharp(imageBuffer).metadata();
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
    const data = new Float32Array(3 * this.inputSize * this.inputSize);
    for (let y = 0; y < this.inputSize; y++) {
      for (let x = 0; x < this.inputSize; x++) {
        const idx = (y * this.inputSize + x) * 3;
        data[0 * this.inputSize * this.inputSize + y * this.inputSize + x] = resized.data[idx] / 255.0;
        data[1 * this.inputSize * this.inputSize + y * this.inputSize + x] = resized.data[idx + 1] / 255.0;
        data[2 * this.inputSize * this.inputSize + y * this.inputSize + x] = resized.data[idx + 2] / 255.0;
      }
    }
    const tensor = new ort.Tensor('float32', data, [1, 3, this.inputSize, this.inputSize]);
    return {
      tensor,
      metadata: {
        originalWidth: metadata.width,
        originalHeight: metadata.height,
        scale,
        padX,
        padY
      }
    };
  }

  parseDetections(output, metadata) {
    const outputName = this.session.outputNames[0];
    const outputTensor = output[outputName];
    const data = outputTensor.data;
    const dims = outputTensor.dims;
    let numAnchors, numClasses;
    if (dims.length === 3) {
      numAnchors = dims[2];
      numClasses = dims[1] - 4;
    } else {
      throw new Error('不支持的输出维度: ' + dims.length);
    }
    const detections = [];
    for (let i = 0; i < numAnchors; i++) {
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
        const x1 = (x - w/2 - metadata.padX) / metadata.scale;
        const y1 = (y - h/2 - metadata.padY) / metadata.scale;
        const x2 = (x + w/2 - metadata.padX) / metadata.scale;
        const y2 = (y + h/2 - metadata.padY) / metadata.scale;
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
    return this.nms(detections);
  }

  nms(detections) {
    const result = [];
    for (const cls of this.classes) {
      let clsDets = detections.filter(d => d.class === cls).sort((a, b) => b.confidence - a.confidence);
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

  async extract(imageBuffer) {
    try {
      await this.init();
      const { tensor, metadata } = await this.preprocess(imageBuffer);
      const feeds = {};
      feeds[this.session.inputNames[0]] = tensor;
      const results = await this.session.run(feeds);
      const detections = this.parseDetections(results, metadata);
      const avatars = detections.filter(d => d.class === 'avatar');
      const texts = detections.filter(d => d.class === 'text_info');
      
      // ⭐ 必须有文本；头像可以为空
      if (texts.length === 0) {
        return { success: false, reason: '未检测到文本区域' };
      }
      
      const messages = await this.associateAndOCR(imageBuffer, avatars, texts);
      if (messages.length === 0) {
        return { success: false, reason: 'OCR识别失败' };
      }
      
      return {
        success: true,
        method: 'yolo-v8',
        messages: messages,
        rawDetections: { avatars: avatars.length, texts: texts.length }
      };
    } catch (err) {
      console.error('[YOLO] 提取失败:', err);
      return { success: false, error: err.message };
    }
  }

  async associateAndOCR(imageBuffer, avatars, texts) {
    const messages = [];
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    for (const text of texts) {
      let bestAvatar = null;
      let minDistance = Infinity;
      
      // 尝试关联最近的头像（头像为空数组时不执行）
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
      
      try {
        let isReceived = true;
        let avatarBase64 = null;
        let avatarHashValue = null;
        let avatarRegion = null;
        
        // ⭐ 有头像才裁剪；无头像则全部留空
        if (bestAvatar) {
          isReceived = bestAvatar.cx < text.cx;
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
          if (avaW < avaSize) finalX1 = Math.max(0, Math.round(avatarX1 - (avaSize - avaW) / 2));
          if (avaH < avaSize) finalY1 = Math.max(0, Math.round(avatarY1 - (avaSize - avaH) / 2));
          finalX1 = Math.min(finalX1, Math.max(0, metadata.width - finalSize));
          finalY1 = Math.min(finalY1, Math.max(0, metadata.height - finalSize));
          finalSize = Math.min(finalSize, metadata.width, metadata.height);
          
          const avatarBuffer = await image.clone()
            .extract({ left: finalX1, top: finalY1, width: finalSize, height: finalSize })
            .resize(100, 100, { fit: 'cover' })
            .png()
            .toBuffer();
          
          avatarHashValue = await computeImageHash(avatarBuffer);
          avatarBase64 = `data:image/png;base64,${avatarBuffer.toString('base64')}`;
          avatarRegion = { x: finalX1, y: finalY1, width: finalSize, height: finalSize };
        }
        
        const textX = Math.round(text.x1);
        const textY = Math.round(text.y1);
        const textW = Math.round(text.x2 - text.x1);
        const textH = Math.round(text.y2 - text.y1);
        const recognizedText = await recognizeTextFromRegion(imageBuffer, { x: textX, y: textY, width: textW, height: textH });
        
        if (recognizedText) {
          messages.push({
            text: recognizedText,
            textConfidence: 1.0,
            avatarBase64: avatarBase64,        // ⭐ 可能为 null
            avatarHash: avatarHashValue,       // ⭐ 可能为 null
            avatarRegion: avatarRegion,
            textRegion: { x: textX, y: textY, width: textW, height: textH },
            direction: isReceived ? 'received' : 'sent',
            confidence: (text.confidence + (bestAvatar ? bestAvatar.confidence : 0)) / (bestAvatar ? 2 : 1)
          });
        }
      } catch (err) {
        console.error('[YOLO] 关联处理失败:', err);
      }
    }
    return messages;
  }

  async terminate() {
    this.session = null;
  }
}

module.exports = { YOLOService };