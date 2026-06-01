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

  // 查找该任务对应的桌面便签
  for (const [noteId, note] of stickyManagerRef.notes.entries()) {
    if (note.taskId === taskId && note.win && !note.win.isDestroyed()) {
      const wc = note.win.webContents;

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

      break;
    }
  }
}

function getTaskService() {
  return taskService;
}

module.exports = { registerTaskHandlers, getTaskService };
