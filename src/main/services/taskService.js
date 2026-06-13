// src/main/services/taskService.js
const {
  insertTask,
  getAllTasks,
  getCompletedTasks,
  getDeletedTasks,
  getDeskTasks,
  getTaskById,
  updateTask,
  deleteTask
} = require('../../database/repositories/taskRepository');
const { saveContact, findContactByName } = require('../../database/repositories/contactRepository');
const { computeImageHash } = require('../utils/hash');

class TaskService {
  constructor(mainWindowGetter) {
    this.mainWindowGetter = mainWindowGetter;
  }

  getMainWindow() {
    if (typeof this.mainWindowGetter === 'function') {
      return this.mainWindowGetter();
    }
    return null;
  }

  notifyMainWindow() {
    const mainWindow = this.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('refresh-task-list');
    }
  }

  async createTask(task) {
    const result = insertTask(task);
    
    // 如果有发送者名称，自动创建/更新联系人，保持 source 一致
    if (task.senderName) {
      try {
        const existingContact = findContactByName(task.senderName);
        
        if (existingContact) {
          // 如果联系人已存在，更新其 source 字段（保持一致）
          const stmt = require('../../database/db').prepare(`
            UPDATE contacts SET source = ? WHERE id = ?
          `);
          stmt.run(task.source || 'unknow', existingContact.id);
        } else {
          // 如果联系人不存在，创建新联系人
          let avatarHash = null;
          let processedBase64 = null;
          
          if (task.senderAvatar) {
            try {
              const base64Data = task.senderAvatar.replace(/^data:image\/\w+;base64,/, '');
              const avatarBuffer = Buffer.from(base64Data, 'base64');
              avatarHash = await computeImageHash(avatarBuffer);
              processedBase64 = `data:image/png;base64,${base64Data}`;
            } catch (err) {
              console.error('[TaskService] 处理头像失败:', err);
            }
          }
          
          await saveContact({
            name: task.senderName,
            avatarHash,
            avatarBase64: processedBase64,
            source: task.source || 'unknow'
          });
          console.log(`[TaskService] 自动创建联系人: ${task.senderName}, source: ${task.source}`);
        }
      } catch (err) {
        console.error('[TaskService] 同步联系人失败:', err);
      }
    }
    
    this.notifyMainWindow();
    return result;
  }

  getAllTasks() {
    return getAllTasks();
  }

  getCompletedTasks() {
    return getCompletedTasks();
  }

  getDeletedTasks() {
    return getDeletedTasks();
  }

  getDeskTasks() {
    return getDeskTasks();
  }

  async updateTask(id, updates) {
    const result = await updateTask(id, updates);
    this.notifyMainWindow();
    return result;
  }

  async deleteTask(id) {
    const result = await deleteTask(id);
    this.notifyMainWindow();
    return result;
  }

  async getTaskById(id) {
    return getTaskById(id);
  }

  async restoreTask(id) {
    return await updateTask(id, { is_deleted: 0 });
  }

  async completeTask(id) {
    return await updateTask(id, {
      status: 'completed',
      is_completed: 1,
      is_show_desk: 0,
      completed_at: new Date().toISOString()
    });
  }

  async showOnDesk(id, show = true) {
    return await updateTask(id, { is_show_desk: show ? 1 : 0 });
  }

  async togglePin(id, isPinned) {
    return await updateTask(id, { is_pinned: isPinned ? 1 : 0 });
  }
}

module.exports = TaskService;
