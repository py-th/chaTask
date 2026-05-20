// src/main/ipc/index.js
const { registerTaskHandlers } = require('./task');
const { registerContactHandlers } = require('./contact');
const { registerStickyHandlers } = require('./sticky');
const { registerScreenshotIpc } = require('./screenshot');

function registerIpcHandlers(mainWindow, stickyManager, yoloService, screenshotUtils, yoloSenderDateService) {
  registerScreenshotIpc(mainWindow, screenshotUtils);
  registerTaskHandlers();
  registerContactHandlers();
  registerStickyHandlers(stickyManager, screenshotUtils);
}

module.exports = { registerIpcHandlers };
