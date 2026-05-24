// src/main/ipc/screenshot.js
const { ipcMain } = require('electron');

function registerScreenshotIpc(mainWindow, screenshotUtils) {
  ipcMain.on('request-name-screenshot', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-name-capture-guide');
    }
  });

  ipcMain.handle('start-double-screenshot', async () => {
    await screenshotUtils.startDoubleScreenshot();
  });

  ipcMain.on('cancel-screenshot', () => {
    screenshotUtils.closeOverlay();
  });
}

module.exports = { registerScreenshotIpc };
