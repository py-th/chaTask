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
const { saveContact, findContactByName, updateContactTaskCount, updateContactSource } = require('../../database/repositories/contactRepository');
const { deleteReminderRulesByTaskId, deleteReminderLogsByTaskId } = require('../../database/repositories/reminderRepository');
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
          // 更新联系人 source 字段（保持一致）
          updateContactSource(existingContact.id, task.source || 'unknow');
          updateContactTaskCount(task.senderName);
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
    // 删除前获取任务信息，以便更新联系人任务计数
    const task = getTaskById(id);
    const senderName = task ? task.sender_name : null;

    try {
      // 彻底删除前清理提醒规则和日志
      deleteReminderRulesByTaskId(id);
      deleteReminderLogsByTaskId(id);
    } catch (err) {
      console.error('[TaskService] 彻底删除任务时清理提醒规则失败:', err);
    }

    const result = await deleteTask(id);

    // 如果有发送者名称，更新其任务计数
    if (senderName) {
      try {
        updateContactTaskCount(senderName);
      } catch (err) {
        console.error('[TaskService] 更新联系人任务计数失败:', err);
      }
    }

    this.notifyMainWindow();
    return result;
  }

  async getTaskById(id) {
    return getTaskById(id);
  }

  async restoreTask(id) {
    // 恢复前获取任务信息，以便更新联系人任务计数
    const task = getTaskById(id);
    const senderName = task ? task.sender_name : null;
    
    const result = await updateTask(id, { is_deleted: 0 });

    // 如果有发送者名称，更新其任务计数
    if (senderName) {
      try {
        updateContactTaskCount(senderName);
      } catch (err) {
        console.error('[TaskService] 更新联系人任务计数失败:', err);
      }
    }

    this.notifyMainWindow();
    return result;
  }

  async completeTask(id) {
    try {
      // 完成任务前清理提醒规则和日志
      deleteReminderRulesByTaskId(id);
      deleteReminderLogsByTaskId(id);
    } catch (err) {
      console.error('[TaskService] 完成任务时清理提醒规则失败:', err);
    }

    const result = await updateTask(id, {
      status: 'completed',
      is_completed: 1,
      is_show_desk: 0,
      completed_at: new Date().toISOString()
    });

    this.notifyMainWindow();
    return result;
  }

  async showOnDesk(id, show = true) {
    return await updateTask(id, { is_show_desk: show ? 1 : 0 });
  }

  async togglePin(id, isPinned) {
    return await updateTask(id, { is_pinned: isPinned ? 1 : 0 });
  }
}

module.exports = TaskService;
