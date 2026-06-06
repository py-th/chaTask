// src/main/windows/mainWindow.js
const { BrowserWindow, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

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

function createAppIcon() {
  const icon48 = getResourcePath('resource', 'desk_icon48.png');
  const icon128 = getResourcePath('resource', 'desk_icon128.png');
  const icon256 = getResourcePath('resource', 'desk_icon256.png');

  const image = nativeImage.createEmpty();

  if (fs.existsSync(icon48)) {
    image.addRepresentation({ scaleFactor: 1, width: 48, height: 48, dataURL: nativeImage.createFromPath(icon48).toDataURL() });
  }
  if (fs.existsSync(icon128)) {
    image.addRepresentation({ scaleFactor: 1, width: 128, height: 128, dataURL: nativeImage.createFromPath(icon128).toDataURL() });
  }
  if (fs.existsSync(icon256)) {
    image.addRepresentation({ scaleFactor: 1, width: 256, height: 256, dataURL: nativeImage.createFromPath(icon256).toDataURL() });
  }

  return image;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 700,
    icon: createAppIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/index.js')
    }
  });
  Menu.setApplicationMenu(null);
  win.loadURL('http://localhost:5173');
  // 开发环境 默认打开控制台
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  return win;
}

module.exports = { createMainWindow };
