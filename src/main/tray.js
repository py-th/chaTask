const { Tray, Menu, nativeImage, app } = require('electron');
const sharp = require('sharp');

let tray = null;

async function generateTrayIcon() {
  const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
    <rect width="32" height="32" rx="6" fill="#4A90D9"/>
    <path d="M9 16 L14 21 L23 11" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const pngBuffer = await sharp(Buffer.from(svg)).resize(32, 32).png().toBuffer();
  return nativeImage.createFromBuffer(pngBuffer, { width: 32, height: 32 });
}

async function createTray(mainWindow) {
  const icon = await generateTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('ChatAsk - 智能任务便签');

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
    tray.setToolTip(text || 'ChatAsk - 智能任务便签');
  }
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { createTray, updateTrayTooltip, destroyTray };