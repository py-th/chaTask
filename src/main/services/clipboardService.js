// src/main/services/clipboardService.js
const { clipboard } = require('electron');
const sharp = require('sharp');
const { computeImageHash } = require('../utils/hash');
const { matchContact } = require('./contactMatcher');
const db = require('../../database/db');

function getImageHash(imgBuffer) {
  const size = imgBuffer.length;
  const prefix = imgBuffer.slice(0, 100).toString('hex');
  return `${size}:${prefix}`;
}

class ClipboardService {
  constructor(options = {}) {
    this.interval = options.interval || 1000;
    this.minWidth = options.minWidth || 50;
    this.maxWidth = options.maxWidth || 500;
    this.minHeight = options.minHeight || 20;
    this.maxHeight = options.maxHeight || 300;
    this.watcher = null;
    this.lastHash = null;
    this.yoloService = null;
    this.mainWindow = null;
  }

  /**
   * 设置依赖的服务
   */
  setDependencies(yoloService, mainWindow) {
    this.yoloService = yoloService;
    this.mainWindow = mainWindow;
  }

  /**
   * 检查图片尺寸是否在合理范围内（系统截图通常不会太大或太小）
   */
  async validateImageSize(imgBuffer) {
    try {
      const metadata = await sharp(imgBuffer).metadata();
      const { width, height } = metadata;
      if (!width || !height) return { valid: false, reason: '无法获取图片尺寸' };
      if (width < this.minWidth || width > this.maxWidth) {
        return { valid: false, reason: `宽度 ${width}px 不在范围 [${this.minWidth}, ${this.maxWidth}]` };
      }
      if (height < this.minHeight || height > this.maxHeight) {
        return { valid: false, reason: `高度 ${height}px 不在范围 [${this.minHeight}, ${this.maxHeight}]` };
      }
      return { valid: true, width, height };
    } catch (err) {
      return { valid: false, reason: `尺寸检查失败: ${err.message}` };
    }
  }

  /**
   * 处理剪贴板图片：YOLO识别 + 联系人匹配 + 发送结果
   */
  async processClipboardImage(imgBuffer) {
    if (!this.yoloService) {
      console.log('[ClipboardService] YOLO 服务未初始化，忽略');
      return;
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      console.log('[ClipboardService] 主窗口不可用，忽略');
      return;
    }

    const result = await this.yoloService.extract(imgBuffer);
    if (!result.success || !result.messages || result.messages.length === 0) {
      console.log('[ClipboardService] 不是有效的聊天截图，忽略');
      return;
    }

    // 剪贴板模式只有单张截图，无法识别发送者/日期
    // 但可以通过头像匹配联系人数据库，匹配成功则自动创建任务
    const contacts = db.prepare('SELECT * FROM contacts').all();
    const integratedMessages = [];

    for (const msg of result.messages) {
      // 使用 YOLO 服务已经计算好的头像哈希（与快捷键模式保持一致）
      let avatarHash = msg.avatarHash || null;
      let avatarBuffer = null;

      if (msg.avatarBase64) {
        try {
          avatarBuffer = Buffer.from(
            msg.avatarBase64.replace(/^data:image\/\w+;base64,/, ''),
            'base64'
          );
          // 如果 YOLO 没有返回哈希（异常情况），才重新计算
          if (!avatarHash) {
            avatarHash = await computeImageHash(avatarBuffer);
            console.warn('[ClipboardService] YOLO 未返回头像哈希，已重新计算');
          }
        } catch (e) {
          console.warn('[ClipboardService] 处理头像失败:', e.message);
        }
      }

      // 尝试通过头像匹配联系人（无发送者名称，传null）
      const matchResult = await matchContact(avatarBuffer, avatarHash, null, contacts);
      integratedMessages.push({
        text: msg.text,
        avatarBase64: msg.avatarBase64,
        avatarHash: avatarHash,
        senderName: matchResult.senderName,
        sourceTime: new Date().toISOString(),
        confidence: msg.confidence,
        direction: msg.direction,
        isNewContact: matchResult.isNewContact,
        senderRegion: null,
        dateRegion: null,
        dateText: null,
        senderConfidence: 0,
        dateConfidence: 0,
        matchReason: matchResult.reason
      });
    }

    this.mainWindow.webContents.send('integrated-extraction-result', {
      success: true,
      messages: integratedMessages,
      localImageBase64: imgBuffer.toString('base64'),
      screenshotInfo: { windowName: 'Clipboard', region: null },
      rawDetections: result.rawDetections || { avatars: 0, texts: 0 },
      rawResults: {
        avatarText: {
          success: true,
          messageCount: result.messages.length,
          rawDetections: result.rawDetections || { avatars: 0, texts: 0 }
        },
        senderDate: {
          success: false,
          senderCount: 0,
          dateCount: 0
        }
      }
    });
  }

  /**
   * 初始化：忽略当前剪贴板中的图片
   */
  init() {
    try {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const imgBuffer = img.toPNG();
        this.lastHash = getImageHash(imgBuffer);
        console.log('[ClipboardService] 初始化，忽略启动时剪贴板中的图片');
      }
    } catch (err) {
      console.error('[ClipboardService] 初始化失败:', err);
    }
  }

  /**
   * 启动剪贴板监听
   */
  start() {
    this.init();

    this.watcher = setInterval(async () => {
      try {
        const img = clipboard.readImage();
        if (img.isEmpty()) return;

        const imgBuffer = img.toPNG();
        const currentHash = getImageHash(imgBuffer);
        if (currentHash === this.lastHash) return;
        this.lastHash = currentHash;

        // 尺寸过滤
        const sizeCheck = await this.validateImageSize(imgBuffer);
        if (!sizeCheck.valid) {
          console.log(`[ClipboardService] 图片尺寸不合规，忽略: ${sizeCheck.reason}`);
          return;
        }

        console.log(`[ClipboardService] 检测到新图片 ${sizeCheck.width}x${sizeCheck.height}，开始处理...`);
        await this.processClipboardImage(imgBuffer);
      } catch (err) {
        console.error('[ClipboardService] 处理剪贴板图片错误:', err);
      }
    }, this.interval);

    console.log(`[ClipboardService] 剪贴板监听已启动，轮询间隔 ${this.interval}ms`);
  }

  /**
   * 停止剪贴板监听
   */
  stop() {
    if (this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
      console.log('[ClipboardService] 剪贴板监听已停止');
    }
  }

  /**
   * 是否正在运行
   */
  isRunning() {
    return this.watcher !== null;
  }
}

module.exports = { ClipboardService };
