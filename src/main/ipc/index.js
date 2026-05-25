// src/main/ipc/index.js
const { registerTaskHandlers } = require('./task');
const { registerContactHandlers } = require('./contact');
const { registerStickyHandlers } = require('./sticky');
const { registerScreenshotIpc } = require('./screenshot');
const { registerSettingsHandlers } = require('./settings');

function registerIpcHandlers(mainWindow, stickyManager, screenshotUtils, reminderService) {
  registerScreenshotIpc(mainWindow, screenshotUtils);
  registerTaskHandlers();
  registerContactHandlers();
  registerStickyHandlers(mainWindow, stickyManager, screenshotUtils, reminderService);
  registerSettingsHandlers();
}

module.exports = { registerIpcHandlers };
