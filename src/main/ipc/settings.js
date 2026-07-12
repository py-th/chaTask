const { ipcMain } = require('electron');
const db = require('../../database/db');
const { loadUserSettings, saveUserSettings, getEffectiveConfig, userDefaults } = require('../configManager');
const { exportAllData, importAllData } = require('../services/dataExportService');

function registerSettingsHandlers(stickyManager) {
  ipcMain.handle('get-settings', () => {
    return loadUserSettings();
  });

  ipcMain.handle('save-settings', (event, settings) => {
    const result = saveUserSettings(settings);
    if (stickyManager && settings.sticky) {
      // 便签折叠头像大小变化时，同步通知便签管理器更新已打开的便签
      if (settings.sticky.foldedAvatarSize !== undefined) {
        try {
          stickyManager.updateFoldedAvatarSize(settings.sticky.foldedAvatarSize);
        } catch (err) {
          console.error('[Settings] 同步折叠头像大小失败:', err);
        }
      }
      // 默认贴边位置变化时，同步更新已折叠便签位置
      if (settings.sticky.foldedEdge !== undefined) {
        try {
          stickyManager.updateFoldedEdge(settings.sticky.foldedEdge);
        } catch (err) {
          console.error('[Settings] 同步默认贴边位置失败:', err);
        }
      }
      // 任务文本最大长度变化时，同步更新已打开便签
      if (settings.sticky.taskTextMaxLength !== undefined) {
        try {
          stickyManager.updateTaskTextMaxLength(settings.sticky.taskTextMaxLength);
        } catch (err) {
          console.error('[Settings] 同步任务文本最大长度失败:', err);
        }
      }
      // 贴边折叠延时半透明时间变化时，同步更新已打开便签
      if (settings.general && settings.general.foldedDimDelay !== undefined) {
        try {
          stickyManager.updateFoldedDimDelay(settings.general.foldedDimDelay);
        } catch (err) {
          console.error('[Settings] 同步贴边折叠延时半透明时间失败:', err);
        }
      }
    }
    return result;
  });

  ipcMain.handle('get-effective-config', () => {
    return getEffectiveConfig();
  });

  ipcMain.handle('reset-settings', () => {
    return saveUserSettings(userDefaults);
  });

  ipcMain.handle('get-screenshot-config', () => {
    const config = getEffectiveConfig();
    return {
      mode: config.screenshot.mode,
      clipboardInterval: config.screenshot.clipboardInterval
    };
  });

  ipcMain.handle('export-all-data', async (event) => {
    const senderWindow = event.sender.getOwnerBrowserWindow();
    return exportAllData(senderWindow);
  });

  ipcMain.handle('import-all-data', async (event) => {
    const senderWindow = event.sender.getOwnerBrowserWindow();
    return importAllData(senderWindow);
  });

  ipcMain.handle('clear-all-data', () => {
    try {
      db.exec('DELETE FROM tasks');
      db.exec('DELETE FROM contacts');
      db.exec('DELETE FROM timeline_notes');
      db.exec('DELETE FROM reminder_rules');
      db.exec('DELETE FROM reminder_logs');
      return { success: true };
    } catch (err) {
      console.error('[Settings] 清空数据失败:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerSettingsHandlers, loadUserSettings, userDefaults };