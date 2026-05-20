// src/main/index.js
const { app, globalShortcut, ipcMain } = require('electron');
const { createMainWindow } = require('./windows/mainWindow');
const StickyNoteManager = require('./windows/stickyNote');
const { startClipboardWatcher } = require('./utils/clipboard');
const { YOLOService } = require('./services/yoloServiceAvatarMessage');
const { YOLOSenderDateService } = require('./services/yoloServiceSenderDate');
const { registerIpcHandlers } = require('./ipc');
const ScreenshotUtils = require('./services/screenshotService');
const { integrateExtractionResults } = require('./services/integrationService');
const { initOCR } = require('./services/ocrService');
const ReminderService = require('./services/reminderService');
const { getDeskTasks } = require('../database/repositories/taskRepository');

let mainWindow = null;
let clipboardWatcher = null;
let yoloService = null;
let stickyManager = null;
let screenshotUtils = null;
let yoloSenderDateService = null;
let reminderService = null;

app.whenReady().then(async () => {
  mainWindow = createMainWindow();
  console.log('[main] 主窗口创建完成');

  // ✅ 第1步：先注册所有基础 IPC（确保 get-all-tasks 等一定可用）
  screenshotUtils = new ScreenshotUtils();
  stickyManager = new StickyNoteManager();
  
  // 初始化提醒服务
  reminderService = new ReminderService(stickyManager);
  reminderService.start();
  console.log('[main] 提醒服务已启动');

  // 将提醒服务注入到 StickyNoteManager
  stickyManager.reminderService = reminderService;

  registerIpcHandlers(mainWindow, stickyManager, yoloService, screenshotUtils, yoloSenderDateService, reminderService);

  // 恢复桌面便签（重启后自动显示之前未完成的桌面任务）
  try {
    const deskTasks = getDeskTasks();
    console.log(`[main] 恢复桌面便签: ${deskTasks.length} 个任务`);
    for (const task of deskTasks) {
      stickyManager.createNote(task);
    }
  } catch (err) {
    console.error('[main] 恢复桌面便签失败:', err);
  }
  console.log('[main] 基础 IPC 处理器注册完成');

  // ✅ 第2步：预加载 OCR（失败不阻塞）
  try {
    await initOCR();
    console.log('[main] OCR 服务初始化完成');
  } catch (err) {
    console.error('[main] OCR 初始化失败:', err.message);
  }

  // ✅ 第3步：初始化 YOLO 头像/文本模型（失败不阻塞）
  try {
    yoloService = new YOLOService();
    await yoloService.init();
    console.log('[main] YOLO 头像/文本模型初始化完成');
  } catch (err) {
    console.error('[main] YOLO 头像/文本模型初始化失败:', err.message);
  }

  // ✅ 第4步：初始化 YOLO 发送者/日期模型（完全可选，失败不阻塞）
  if (YOLOSenderDateService) {
    try {
      yoloSenderDateService = new YOLOSenderDateService();
      await yoloSenderDateService.init();
      console.log('[main] YOLO 发送者/日期模型初始化完成');
    } catch (err) {
      console.error('[main] YOLO 发送者/日期模型初始化失败:', err.message);
      yoloSenderDateService = null;
    }
  }

  // ✅ 第5步：注册整合截图 Handler（依赖上面两个模型，所以放后面）
  ipcMain.handle('finish-screenshot', async (event, region) => {
    if (!yoloService) {
      return { success: false, error: 'YOLO 头像/文本服务未初始化' };
    }
    try {
      console.log('[main] 开始双截图识别流程...');
      const screenshotData = await screenshotUtils.captureScreenshotData(region);
      if (!screenshotData) throw new Error('截图数据获取失败');

      const avatarTextResult = await yoloService.extract(screenshotData.localImageBuffer);
      
      let senderDateResult = { success: false, senders: [], dates: [] };
      if (yoloSenderDateService) {
        senderDateResult = await yoloSenderDateService.extract(screenshotData.fullWindowBuffer);
      }

      console.log('[main] 头像/消息识别:', avatarTextResult.success
        ? `${avatarTextResult.messages?.length || 0} 条消息，${ avatarTextResult.rawDetections.avatars || 0 } 个头像，${ avatarTextResult.rawDetections.texts || 0 } 个文本框`
        : `失败: ${avatarTextResult.error || '未知'}`);
      console.log('[main] 发送者/日期识别:', senderDateResult.success
        ? `${senderDateResult.senders?.length || 0} 个发送者, ${senderDateResult.dates?.length || 0} 个日期`
        : `失败或未启用`);

      const integratedData = await integrateExtractionResults(
        avatarTextResult,
        senderDateResult,
        screenshotData
      );

      mainWindow.webContents.send('integrated-extraction-result', integratedData);
      return { success: true };
    } catch (error) {
      console.error('[main] 双截图识别流程失败:', error);
      mainWindow.webContents.send('integrated-extraction-result', {
        success: false,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  });

  // ✅ 第6步：启动剪贴板监听（备选方案）
  clipboardWatcher = startClipboardWatcher(async (imgBuffer) => {
    if (!yoloService) {
      console.log('[clipboard] YOLO 服务未初始化，忽略剪贴板截图');
      return;
    }
    const result = await yoloService.extract(imgBuffer);
    if (result.success && result.messages.length > 0) {
      mainWindow.webContents.send('screenshot-extracted', {
        base64: imgBuffer.toString('base64'),
        result: result
      });
    } else {
      console.log('[clipboard] 不是有效的聊天截图，忽略');
    }
  });

  // ✅ 第7步：注册全局快捷键
  globalShortcut.register('CommandOrControl+Alt+S', () => {
    if (screenshotUtils) {
      screenshotUtils.startDoubleScreenshot();
    }
  });
});

app.on('window-all-closed', () => {
  if (clipboardWatcher) clearInterval(clipboardWatcher);
  if (yoloService) yoloService.terminate();
  if (yoloSenderDateService) yoloSenderDateService.terminate();
  if (screenshotUtils) screenshotUtils.closeOverlay();
  if (reminderService) reminderService.stop();
  if (process.platform !== 'darwin') app.quit();
});
//释放全局快捷键
app.on('will-quit', () => { globalShortcut.unregisterAll(); })