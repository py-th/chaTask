// src/main/index.js
const { app, globalShortcut, ipcMain } = require('electron');
const { createMainWindow } = require('./windows/mainWindow');
const StickyNoteManager = require('./windows/stickyNote');
const { ClipboardService } = require('./services/clipboardService');
const { YOLOService } = require('./services/yoloServiceAvatarMessage');
const { YOLOSenderDateService } = require('./services/yoloServiceSenderDate');
const { registerIpcHandlers } = require('./ipc');
const ScreenshotUtils = require('./services/screenshotService');
const { showNameDialog } = require('./windows/nameDialog');
const { integrateExtractionResults } = require('./services/integrationService');
const { initOCR } = require('./services/ocrService');
const ReminderService = require('./services/reminderService');
const { getDeskTasks } = require('../database/repositories/taskRepository');
const db = require('../database/db');
const config = require('./config');
const { createTray, updateTrayTooltip } = require('./tray');

let mainWindow = null;
let clipboardService = null;
let yoloService = null;
let stickyManager = null;
let screenshotUtils = null;
let yoloSenderDateService = null;
let reminderService = null;

app.isQuitting = false;

app.whenReady().then(async () => {
  mainWindow = createMainWindow();
  console.log('[main] 主窗口创建完成');

  createTray(mainWindow);
  console.log('[main] 系统托盘创建完成');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    }
  });

  mainWindow.on('minimize', () => {
    mainWindow.hide();
    mainWindow.setSkipTaskbar(true);
  });

  // ✅ 第1步：初始化窗口管理器和工具类
  screenshotUtils = new ScreenshotUtils();
  stickyManager = new StickyNoteManager();

  // 初始化提醒服务
  reminderService = new ReminderService(stickyManager);
  reminderService.start();
  console.log('[main] 提醒服务已启动');

  // 将提醒服务注入到 StickyNoteManager
  stickyManager.reminderService = reminderService;

  // ✅ 第2步：注册所有 IPC Handler（不依赖 YOLO 服务的基础 IPC）
  registerIpcHandlers(mainWindow, stickyManager, screenshotUtils, reminderService);

  ipcMain.handle('show-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setSkipTaskbar(false);
      mainWindow.restore();
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      mainWindow.webContents.focus();
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setAlwaysOnTop(false);
        }
      }, 200);
    }
    return true;
  });

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

  // ✅ 第3步：预加载 OCR（失败不阻塞）
  try {
    await initOCR();
    console.log('[main] OCR 服务初始化完成');
  } catch (err) {
    console.error('[main] OCR 初始化失败:', err.message);
  }

  // ✅ 第4步：初始化 YOLO 头像/文本模型（失败不阻塞）
  try {
    yoloService = new YOLOService();
    await yoloService.init();
    console.log('[main] YOLO 头像/文本模型初始化完成');
  } catch (err) {
    console.error('[main] YOLO 头像/文本模型初始化失败:', err.message);
  }

  // ✅ 第5步：初始化 YOLO 发送者/日期模型（完全可选，失败不阻塞）
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

  // ✅ 第6步：注册依赖 YOLO 服务的 IPC Handler（必须在 YOLO 初始化之后）
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
        ? `${avatarTextResult.messages?.length || 0} 条消息，${avatarTextResult.rawDetections.avatars || 0} 个头像，${avatarTextResult.rawDetections.texts || 0} 个文本框`
        : `失败: ${avatarTextResult.error || '未知'}`);
      console.log('[main] 发送者/日期识别:', senderDateResult.success
        ? `${senderDateResult.senders?.length || 0} 个发送者, ${senderDateResult.dates?.length || 0} 个日期`
        : '失败或未启用');

      const integratedData = await integrateExtractionResults(
        avatarTextResult,
        senderDateResult,
        screenshotData
      );

      if (integratedData.success && integratedData.messages) {
        const unconfirmed = integratedData.messages.filter(m => m.isNewContact || !m.senderName);
        if (unconfirmed.length > 0) {
          try {
            const contacts = db.prepare('SELECT * FROM contacts').all();
            const confirmedNames = await showNameDialog(unconfirmed, contacts);
            if (confirmedNames && confirmedNames.length > 0) {
              for (const item of confirmedNames) {
                const msg = integratedData.messages[item.idx];
                if (msg) {
                  msg.senderName = item.name;
                  msg.isNewContact = true;
                }
              }
            } else if (confirmedNames === null) {
              return { success: true };
            }
          } catch (err) {
            console.error('[main] 名称确认对话框失败:', err);
            mainWindow.webContents.send('integrated-extraction-result', {
              success: false,
              error: '确认对话框异常: ' + err.message,
              localImageBase64: integratedData.localImageBase64,
              screenshotInfo: integratedData.screenshotInfo,
              rawDetections: integratedData.rawDetections,
              rawResults: integratedData.rawResults
            });
            return { success: true };
          }
        }
      }

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

  // ✅ 第7步：根据配置决定截图模式（两种方式互斥）
  const screenshotMode = config.screenshot ? config.screenshot.mode : 'shortcut';

  if (screenshotMode === 'clipboard') {
    console.log('[main] 启用系统截图+剪贴板监听模式');
    clipboardService = new ClipboardService({
      interval: config.screenshot.clipboardInterval || 1000,
      minWidth: 50,
      maxWidth: 500,
      minHeight: 20,
      maxHeight: 300
    });
    clipboardService.setDependencies(yoloService, mainWindow);
    clipboardService.start();
  } else {
    console.log('[main] 启用快捷键截图模式 (Ctrl+Alt+S)');
  }

  // ✅ 第8步：仅在快捷键模式下注册全局快捷键
  if (screenshotMode === 'shortcut') {
    globalShortcut.register('CommandOrControl+Alt+S', () => {
      if (screenshotUtils) {
        screenshotUtils.startDoubleScreenshot();
      }
    });
  }
});

app.on('window-all-closed', () => {
  if (clipboardService) clipboardService.stop();
  if (yoloService) yoloService.terminate();
  if (yoloSenderDateService) yoloSenderDateService.terminate();
  if (screenshotUtils) screenshotUtils.closeOverlay();
  if (reminderService) reminderService.stop();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});

// 释放全局快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
