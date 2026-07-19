// src/main/ipc/index.js
const { registerTaskHandlers } = require('./task');
const { registerContactHandlers } = require('./contact');
const { registerStickyHandlers } = require('./sticky');
const { registerScreenshotIpc } = require('./screenshot');
const { registerSettingsHandlers } = require('./settings');
const { registerTaskContextMenuHandlers } = require('./taskContextMenu');

function registerIpcHandlers(mainWindow, stickyManager, screenshotUtils, reminderService) {
  const getMainWindow = () => mainWindow;

  registerScreenshotIpc(mainWindow, screenshotUtils);
  registerTaskHandlers(getMainWindow, stickyManager, reminderService);
  registerContactHandlers();
  registerStickyHandlers(mainWindow, stickyManager, screenshotUtils, reminderService);
  registerSettingsHandlers(stickyManager);
  registerTaskContextMenuHandlers(mainWindow, stickyManager);
}

module.exports = { registerIpcHandlers };
