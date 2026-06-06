const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let currentDialog = null;
let currentResolve = null;

function showConfirmDialog(parentWindow, options = {}) {
  return new Promise((resolve) => {
    // 关闭已有对话框
    if (currentDialog && !currentDialog.isDestroyed()) {
      currentDialog.close();
    }
    currentResolve = resolve;

    const dialogWin = new BrowserWindow({
      width: 400,
      height: 220,
      parent: parentWindow,
      modal: true,
      frame: false,
      transparent: true,
      skipTaskbar: false,
      resizable: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    currentDialog = dialogWin;

    const htmlPath = path.join(__dirname, '../templates/confirmDialog.html');
    dialogWin.loadFile(htmlPath);

    dialogWin.once('ready-to-show', () => {
      dialogWin.show();
      dialogWin.focus();
      dialogWin.webContents.send('dialog-data', {
        title: options.title || '确认',
        message: options.message || '',
        detail: options.detail || '',
        type: options.type || 'warning',
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消'
      });
    });

    dialogWin.on('closed', () => {
      currentDialog = null;
      if (currentResolve) {
        currentResolve(false);
        currentResolve = null;
      }
    });
  });
}

// 监听确认和取消事件
ipcMain.on('confirm-dialog-result', (event, result) => {
  if (currentDialog && !currentDialog.isDestroyed()) {
    currentDialog.close();
  }
  if (currentResolve) {
    currentResolve(result);
    currentResolve = null;
  }
});

module.exports = { showConfirmDialog };
