// src/main/index.js
const { app, globalShortcut, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
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
const { getEffectiveConfig, loadUserSettings } = require('./configManager');
const { createTray, updateTrayTooltip } = require('./tray');

let mainWindow = null;
let clipboardService = null;
let yoloService = null;
let stickyManager = null;
let screenshotUtils = null;
let yoloSenderDateService = null;
let reminderService = null;

app.isQuitting = false;

function registerDynamicShortcuts(shortcutConfig) {
  globalShortcut.unregisterAll();
  const screenshotShortcut = shortcutConfig.screenshot || 'Ctrl+Alt+S';
  const showWindowShortcut = shortcutConfig.showWindow || 'Ctrl+Shift+A';

  try {
    globalShortcut.register(screenshotShortcut.replace('Ctrl', 'CommandOrControl'), () => {
      if (screenshotUtils) screenshotUtils.startDoubleScreenshot();
    });
    console.log(`[main] 注册截图快捷键: ${screenshotShortcut}`);
  } catch (e) {
    console.error(`[main] 注册截图快捷键失败: ${e.message}`);
  }

  try {
    globalShortcut.register(showWindowShortcut.replace('Ctrl', 'CommandOrControl'), () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSkipTaskbar(false);
        mainWindow.restore();
        mainWindow.show();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
        }, 200);
      }
    });
    console.log(`[main] 注册显示窗口快捷键: ${showWindowShortcut}`);
  } catch (e) {
    console.error(`[main] 注册显示窗口快捷键失败: ${e.message}`);
  }
}

app.whenReady().then(async () => {
  app.setName('ChaTask');
  if (process.platform === 'win32') {
    app.setAppUserModelId(process.execPath);
  }
  mainWindow = createMainWindow();
  console.log('[main] 主窗口创建完成');

  createTray(mainWindow);
  console.log('[main] 系统托盘创建完成');

  const effectiveConfig = getEffectiveConfig();

  if (effectiveConfig.general.autoLaunch) {
    app.setLoginItemSettings({ openAtLogin: true });
  } else {
    app.setLoginItemSettings({ openAtLogin: false });
  }

  const closeToTray = effectiveConfig.general.minimizeToTray !== false;

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      if (closeToTray) {
        mainWindow.hide();
        mainWindow.setSkipTaskbar(true);
      }
    }
  });

  mainWindow.on('minimize', () => {
    if (closeToTray) {
      mainWindow.hide();
      mainWindow.setSkipTaskbar(true);
    }
  });

  screenshotUtils = new ScreenshotUtils();
  stickyManager = new StickyNoteManager();
  stickyManager.settings = effectiveConfig.sticky;

  reminderService = new ReminderService(stickyManager, effectiveConfig.reminder);
  reminderService.start();
  console.log('[main] 提醒服务已启动');

  stickyManager.reminderService = reminderService;

  registerIpcHandlers(mainWindow, stickyManager, screenshotUtils, reminderService);

  ipcMain.handle('minimize-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
    return true;
  });

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

  try {
    await initOCR();
    console.log('[main] OCR 服务初始化完成');
  } catch (err) {
    console.error('[main] OCR 初始化失败:', err.message);
  }

  try {
    yoloService = new YOLOService();
    await yoloService.init();
    console.log('[main] YOLO 头像/文本模型初始化完成');
  } catch (err) {
    console.error('[main] YOLO 头像/文本模型初始化失败:', err.message);
  }

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
            const screenshotInfo = {
              localImageBase64: integratedData.localImageBase64,
              messageCount: integratedData.messages?.length || 0,
              avatarCount: integratedData.rawDetections?.avatars || 0,
              textCount: integratedData.rawDetections?.texts || 0,
              senderCount: integratedData.rawResults?.senderDate?.senderCount || 0,
              dateCount: integratedData.rawResults?.senderDate?.dateCount || 0,
              windowName: integratedData.screenshotInfo?.windowName || 'Unknown'
            };
            const dialogResult = await showNameDialog(
              unconfirmed,
              contacts,
              integratedData.screenshotInfo?.windowName || 'Unknown',
              screenshotInfo
            );
            if (dialogResult && dialogResult.results && dialogResult.results.length > 0) {
              for (const item of dialogResult.results) {
                const msg = integratedData.messages[item.idx];
                if (msg) {
                  msg.senderName = item.name;
                  msg.isNewContact = true;
                  if (item.text) msg.text = item.text;
                  if (item.dueDate) msg.dueDate = item.dueDate;
                  if (item.avatarBase64) msg.avatarBase64 = item.avatarBase64;
                }
              }
              // 处理联系人头像更新
              if (dialogResult.contactUpdates && dialogResult.contactUpdates.length > 0) {
                for (const update of dialogResult.contactUpdates) {
                  try {
                    await require('../database/repositories/contactRepository').updateContactAvatar(
                      update.name, update.avatarHash, update.avatarBase64
                    );
                    console.log(`[main] 更新联系人[${update.name}]头像`);
                  } catch (e) {
                    console.error(`[main] 更新联系人[${update.name}]头像失败:`, e);
                  }
                }
              }
            } else if (dialogResult === null) {
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

  const screenshotMode = effectiveConfig.screenshot.mode;

  if (screenshotMode === 'clipboard') {
    console.log('[main] 启用系统截图+剪贴板监听模式');
    const s = effectiveConfig.screenshot;
    clipboardService = new ClipboardService({
      interval: s.clipboardInterval,
      minWidth: s.clipboardMinWidth,
      maxWidth: s.clipboardMaxWidth,
      minHeight: s.clipboardMinHeight,
      maxHeight: s.clipboardMaxHeight
    });
    clipboardService.setDependencies(yoloService, mainWindow);
    clipboardService.start();
  } else {
    console.log('[main] 启用快捷键截图模式');
  }

  registerDynamicShortcuts(effectiveConfig.shortcuts);

  ipcMain.handle('reload-shortcuts', () => {
    const cfg = getEffectiveConfig();
    registerDynamicShortcuts(cfg.shortcuts);
    return true;
  });

  ipcMain.handle('reload-auto-launch', () => {
    const cfg = getEffectiveConfig();
    app.setLoginItemSettings({ openAtLogin: cfg.general.autoLaunch });
    return true;
  });

  // 自动更新检查
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo || null };
    } catch (err) {
      console.error('[main] 检查更新失败:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
    return true;
  });

  // 自动更新事件监听
  autoUpdater.on('update-available', (info) => {
    console.log('[main] 发现新版本:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[main] 当前已是最新版本');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progress);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[main] 更新已下载:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[main] 自动更新错误:', err);
  });

  // 启动后延迟检查更新（避免影响启动速度）
  setTimeout(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
      autoUpdater.checkForUpdates().catch(() => {});
    }
  }, 30000);
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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});