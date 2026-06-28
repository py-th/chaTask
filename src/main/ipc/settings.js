const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const { loadUserSettings, saveUserSettings, getEffectiveConfig, userDefaults } = require('../configManager');

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

  ipcMain.handle('export-all-data', async () => {
    try {
      const settings = loadUserSettings();
      const tasks = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all();
      const contacts = db.prepare('SELECT * FROM contacts ORDER BY name').all();

      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        settings,
        tasks,
        contacts
      };

      const defaultName = `chatask-backup-${new Date().toISOString().slice(0, 10)}.json`;

      const result = await dialog.showSaveDialog({
        title: '导出数据',
        defaultPath: path.join(app.getPath('desktop'), defaultName),
        filters: [{ name: 'JSON 文件', extensions: ['json'] }]
      });

      if (result.canceled) {
        return { success: false, error: '用户取消导出' };
      }

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');
      return { success: true, filePath: result.filePath };
    } catch (err) {
      console.error('[Settings] 导出数据失败:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('import-all-data', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '导入数据',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: '用户取消导入' };
      }

      const raw = fs.readFileSync(result.filePaths[0], 'utf8');
      const importData = JSON.parse(raw);

      if (!importData.tasks || !Array.isArray(importData.tasks)) {
        return { success: false, error: '无效的数据文件格式' };
      }

      const insertTask = db.prepare(`
        INSERT OR REPLACE INTO tasks (
          id, source, sender_avatar, sender_name, content, source_time, created_at,
          due_date, reminder_time, priority, status, color, is_pinned, is_show_desk,
          position_x, position_y, tags, attachments, is_completed, is_archived, is_deleted, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertContact = db.prepare(`
        INSERT OR REPLACE INTO contacts (name, avatar_hash, avatar_base64)
        VALUES (?, ?, ?)
      `);

      const insertMany = db.transaction(() => {
        for (const task of importData.tasks) {
          insertTask.run(
            task.id, task.source, task.sender_avatar, task.sender_name,
            task.content, task.source_time, task.created_at,
            task.due_date, task.reminder_time, task.priority, task.status,
            task.color, task.is_pinned, task.is_show_desk,
            task.position_x, task.position_y, task.tags, task.attachments,
            task.is_completed, task.is_archived, task.is_deleted || 0,
            task.completed_at || null
          );
        }
        if (importData.contacts && Array.isArray(importData.contacts)) {
          for (const contact of importData.contacts) {
            insertContact.run(contact.name, contact.avatar_hash, contact.avatar_base64);
          }
        }
      });

      insertMany();

      if (importData.settings) {
        saveUserSettings(importData.settings);
      }

      return {
        success: true,
        taskCount: importData.tasks.length,
        contactCount: (importData.contacts || []).length
      };
    } catch (err) {
      console.error('[Settings] 导入数据失败:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('clear-all-data', () => {
    try {
      db.exec('DELETE FROM tasks');
      db.exec('DELETE FROM contacts');
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