const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('../../database/db');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const defaultSettings = {
  general: { autoLaunch: false, minimizeToTray: true },
  sticky: { defaultOpacity: 100, edgeSnap: true },
  screenshot: { mode: 'shortcut' },
  ocr: { mode: 'local', cloudApiKey: '', language: 'ch' },
  shortcuts: { screenshot: 'Ctrl+Alt+S', showWindow: 'Ctrl+Shift+A' },
  reminder: { defaultTime: '09:00', advanceMinutes: 0 },
  cloudSync: { enabled: false, provider: 'baidu', autoBackup: false }
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      return { ...defaultSettings, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.error('[Settings] 读取设置文件失败:', err.message);
  }
  return { ...defaultSettings };
}

function saveSettingsToFile(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Settings] 保存设置文件失败:', err.message);
    return false;
  }
}

function registerSettingsHandlers() {
  ipcMain.handle('get-settings', () => {
    return loadSettings();
  });

  ipcMain.handle('save-settings', (event, settings) => {
    return saveSettingsToFile(settings);
  });

  ipcMain.handle('export-all-data', async () => {
    try {
      const settings = loadSettings();
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
        saveSettingsToFile({ ...defaultSettings, ...importData.settings });
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

module.exports = { registerSettingsHandlers, loadSettings, defaultSettings };