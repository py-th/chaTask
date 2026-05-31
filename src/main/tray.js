const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function getResourcePath(...relativePaths) {
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, ...relativePaths);
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }
  const devPath = path.join(process.cwd(), 'public', ...relativePaths);
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return path.join(process.cwd(), 'public', ...relativePaths);
}

function createTrayIcon() {
  const iconPath = getResourcePath('resource', 'tray_icon32.png');
  return nativeImage.createFromPath(iconPath);
}

function createTray(mainWindow) {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('ChaTask - 智能任务便签');

  function showMainWindow() {
    if (!mainWindow) return;
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

  tray.on('click', () => {
    showMainWindow();
  });

  tray.on('right-click', () => {
    buildMenu(mainWindow, showMainWindow);
  });

  buildMenu(mainWindow, showMainWindow);
}

function buildMenu(mainWindow, showFn) {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (showFn) showFn();
      }
    },
    {
      label: '快速截图',
      click: () => {
        if (showFn) showFn();
        if (mainWindow) {
          mainWindow.webContents.send('trigger-screenshot');
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出程序',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function updateTrayTooltip(text) {
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(text || 'ChaTask - 智能任务便签');
  }
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, updateTrayTooltip, destroyTray };