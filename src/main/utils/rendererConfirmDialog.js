// src/main/utils/rendererConfirmDialog.js
// 在主窗口渲染层弹出 ConfirmDialog.vue（与任务视图 Pro 锁定弹窗风格一致）
const { ipcMain } = require('electron');

let idCounter = 0;

function generateId() {
  idCounter += 1;
  return `${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 在主窗口渲染进程显示确认对话框
 * @param {BrowserWindow} mainWindow - 主程序窗口
 * @param {object} options - 与 ConfirmDialog.vue 一致的选项
 * @returns {Promise<boolean>}
 */
function showRendererConfirmDialog(mainWindow, options = {}) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(false);
      return;
    }

    const id = generateId();
    const resultChannel = `renderer-confirm-result-${id}`;

    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(resultChannel);
      resolve(false);
    }, 30000);

    ipcMain.once(resultChannel, (event, { result }) => {
      clearTimeout(timer);
      resolve(!!result);
    });

    mainWindow.webContents.send('show-renderer-confirm', { id, options });
  });
}

module.exports = { showRendererConfirmDialog };
