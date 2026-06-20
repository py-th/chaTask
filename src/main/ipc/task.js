// src/main/ipc/task.js
const { ipcMain } = require('electron');
const TaskService = require('../services/taskService');
const { getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');

let taskService = null;
let stickyManagerRef = null;

function registerTaskHandlers(getMainWindow, stickyManager) {
  taskService = new TaskService(getMainWindow);
  stickyManagerRef = stickyManager;

  ipcMain.handle('save-task', (event, task) => taskService.createTask(task));
  ipcMain.handle('get-all-tasks', () => taskService.getAllTasks());
  ipcMain.handle('get-completed-tasks', () => taskService.getCompletedTasks());
  ipcMain.handle('get-deleted-tasks', () => taskService.getDeletedTasks());
  ipcMain.handle('get-desk-tasks', () => taskService.getDeskTasks());

  ipcMain.handle('update-task', async (event, { id, updates }) => {
    const result = await taskService.updateTask(id, updates);
    // 同步更新桌面便签显示
    syncStickyNoteUpdate(id, updates);
    return result;
  });

  ipcMain.handle('delete-task', (event, id) => taskService.deleteTask(id));

  ipcMain.handle('restore-task', (event, id) => taskService.restoreTask(id));

  ipcMain.handle('complete-task', async (event, id) => {
    const result = await taskService.completeTask(id);
    // 同步更新桌面便签显示
    syncStickyNoteUpdate(id, { status: 'completed', is_completed: 1 });
    return result;
  });

  ipcMain.handle('show-on-desk', (event, { id, show }) => taskService.showOnDesk(id, show));

  ipcMain.handle('toggle-pin', (event, { id, isPinned }) => taskService.togglePin(id, isPinned));

  ipcMain.handle('get-task-detail', async (event, taskId) => {
    try {
      return await taskService.getTaskById(taskId);
    } catch (error) {
      console.error('获取任务详情失败:', error);
      return null;
    }
  });

  ipcMain.handle('get-reminder-rule', async (event, taskId) => {
    try {
      return getReminderRuleByTaskId(taskId);
    } catch (error) {
      console.error('获取提醒规则失败:', error);
      return null;
    }
  });
}

function syncStickyNoteUpdate(taskId, updates) {
  if (!stickyManagerRef || !stickyManagerRef.notes) return;

  // 获取任务信息用于时间轴更新
  let taskSenderName = null;
  for (const [, note] of stickyManagerRef.notes.entries()) {
    if (note.taskId === taskId) {
      // 对于单个便签，可以直接获取任务信息
      break;
    } else if (note.isTimeline) {
      // 对于时间轴便签，需要记录 senderName
      // 后续需要从数据库获取任务信息
    }
  }

  // 遍历所有便签，更新相关的便签
  for (const [noteId, note] of stickyManagerRef.notes.entries()) {
    if (!note.win || note.win.isDestroyed()) continue;
    const wc = note.win.webContents;

    if (note.isTimeline) {
      // 时间轴便签：检查该任务是否属于这个时间轴（同一联系人）
      // 需要通过数据库查询任务的 sender_name 来匹配
      // 这里我们向所有时间轴便签发送更新事件，由前端判断是否属于该时间轴
      const updateEvent = {};
      
      if (updates.content !== undefined) {
        updateEvent.content = updates.content;
      }
      if (updates.priority !== undefined) {
        updateEvent.priority = updates.priority;
      }
      if (updates.status !== undefined) {
        updateEvent.status = updates.status;
      }
      if (updates.due_date !== undefined) {
        updateEvent.dueDate = updates.due_date;
      }
      if (updates.reminder_enabled !== undefined || updates.reminder_rule_id !== undefined) {
        updateEvent.reminderChanged = true;
      }

      if (Object.keys(updateEvent).length > 0) {
        updateEvent.taskId = taskId;
        wc.send('timeline-update-task', updateEvent);
      }

      // 如果任务被删除，通知时间轴移除该任务
      if (updates.is_deleted !== undefined && updates.is_deleted === 1) {
        wc.send('timeline-remove-task', taskId);
      }
    } else if (note.taskId === taskId) {
      // 单个便签：直接更新
      // 同步内容更新
      if (updates.content !== undefined) {
        wc.executeJavaScript(`
          (function() {
            const taskTextDiv = document.getElementById('taskText');
            if (taskTextDiv) taskTextDiv.innerText = ${JSON.stringify(updates.content)};
          })();
        `).catch(() => {});
      }

      // 同步优先级更新
      if (updates.priority !== undefined) {
        wc.send('update-priority', updates.priority);
      }

      // 同步状态更新
      if (updates.status !== undefined) {
        wc.send('update-status', updates.status);
      }

      // 同步截止日期更新
      if (updates.due_date !== undefined) {
        wc.send('update-due-date', updates.due_date);
      }
    }
  }
}

function getTaskService() {
  return taskService;
}

module.exports = { registerTaskHandlers, getTaskService };
