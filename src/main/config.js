// src/main/config.js
const path = require('path');

module.exports = {
  // 模型路径
  modelPath_avatar_text: path.join(process.cwd(), 'public/models/best_avatar_text.onnx'),
  modelPath_sender_date: path.join(process.cwd(), 'public/models/best_sender_date.onnx'),
  // RapidOCR 模型路径 (需下载放置)
  rapidOCR: {
    // 检测模型：检测文本区域位置
    detModelPath: path.join(process.cwd(), 'public/models/ch_PP-OCRv5_det_mobile.onnx'),
    // 识别模型：识别文本内容
    recModelPath: path.join(process.cwd(), 'public/models/ch_PP-OCRv5_rec_mobile.onnx'),
    // 字典文件路径（识别模型需要）
    dictionaryPath: path.join(process.cwd(), 'public/models/ppocrv5_mobile_dict.txt'),
  },
  // YOLO 参数
  yolo: {
    inputSize: 640,
    confThreshold: 0.5,//模型置信度
    nmsThreshold: 0.45,
    classes: ['avatar', 'text_info']
  },
  // OCR 参数
  ocr: {
    // 云端 OCR API 配置（可选）
    // 若 enabled 为 true，优先使用云端；云端失败自动回退本地 RapidOCR
    cloud: {
      enabled: true,        // 是否启用云端
      provider: 'baidu',     // 可选: baidu, tencent, aliyun
      apiKey: 'Si4vd0qcEz7lBVwN9vccpbmk',            // API Key
      secretKey: 'AFxsv9FBAj9If8I15LyVTqWUB93TUG6p',         // Secret Key
      endpoint: '',          // 自定义端点
      timeout: 10000,        // 超时时间(ms)
    }
  },
  // 剪贴板轮询间隔（毫秒）
  clipboardInterval: 1000,
  // 头像匹配阈值（汉明距离）
  avatarMatchThreshold: 10,
  //时间日期格式匹配
  dateString:["刚刚","现在","昨天","今天","明天"]
};