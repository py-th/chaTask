// src/main/ipc/screenshot.js
const { ipcMain } = require('electron');

function registerScreenshotIpc(mainWindow, screenshotUtils) {
  ipcMain.on('request-name-screenshot', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-name-capture-guide');
    }
  });

  // ✅ 双截图 IPC
  ipcMain.handle('start-double-screenshot', async () => {
    await screenshotUtils.startDoubleScreenshot();
  });

  ipcMain.on('cancel-screenshot', () => {
    screenshotUtils.closeOverlay();
  });

  // ✅ 提供截图配置给渲染进程
  const config = require('../config');
  ipcMain.handle('get-screenshot-config', () => {
    return {
      mode: config.screenshot ? config.screenshot.mode : 'shortcut'
    };
  });
}

module.exports = { registerScreenshotIpc };
