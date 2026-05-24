// src/main/services/yoloServiceSenderDate.js
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const fs = require('fs');
const { getEffectiveConfig } = require('../configManager');
const { recognizeTextFromRegion } = require('./ocrService');

class YOLOSenderDateService {
  constructor() {
    this.session = null;
    const cfg = getEffectiveConfig();
    this.inputSize = cfg.yolo.inputSize;
    this.confThreshold = cfg.yolo.confThreshold;
    this.nmsThreshold = cfg.yolo.nmsThreshold;
    this.classes = ['sender', 'message_date'];
    this.modelPath = cfg.modelPath_sender_date;
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
      
      const senders = detections.filter(d => d.class === 'sender');
      const dates = detections.filter(d => d.class === 'message_date');
      
      const senderTexts = [];
      for (const sender of senders) {
        try {
          const text = await recognizeTextFromRegion(imageBuffer, {
            x: Math.round(sender.x1),
            y: Math.round(sender.y1),
            width: Math.round(sender.x2 - sender.x1),
            height: Math.round(sender.y2 - sender.y1)
          });
          if (text && text.trim()) {
            senderTexts.push({
              text: text.trim(),
              confidence: sender.confidence,
              region: { x: sender.x1, y: sender.y1, width: sender.width, height: sender.height }
            });
          }
        } catch (err) {
          console.error('[YOLOSenderDate] Sender OCR失败:', err);
        }
      }
      
      const dateTexts = [];
      for (const date of dates) {
        try {
          const text = await recognizeTextFromRegion(imageBuffer, {
            x: Math.round(date.x1),
            y: Math.round(date.y1),
            width: Math.round(date.x2 - date.x1),
            height: Math.round(date.y2 - date.y1)
          });
          if (text && text.trim()) {
            dateTexts.push({
              text: text.trim(),
              confidence: date.confidence,
              region: { x: date.x1, y: date.y1, width: date.width, height: date.height }
            });
          }
        } catch (err) {
          console.error('[YOLOSenderDate] Date OCR失败:', err);
        }
      }
      
      return {
        success: true,
        senders: senderTexts,
        dates: dateTexts,
        rawDetections: { senders: senders.length, dates: dates.length }
      };
    } catch (err) {
      console.error('[YOLOSenderDate] 提取失败:', err);
      return { success: false, error: err.message };
    }
  }

  async terminate() {
    this.session = null;
  }
}

module.exports = { YOLOSenderDateService };