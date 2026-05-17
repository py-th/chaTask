// src/main/windows/mainWindow.js
const { BrowserWindow } = require('electron');
const path = require('path');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/index.js')
    }
  });
  win.loadURL('http://localhost:5173');
  if (process.env.NODE_ENV === 'development') {
    win.webContents.openDevTools();
  }
  return win;
}

module.exports = { createMainWindow };