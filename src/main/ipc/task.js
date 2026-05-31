// src/main/ipc/task.js
const { ipcMain } = require('electron');
const TaskService = require('../services/taskService');
const { getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');

let taskService = null;

function registerTaskHandlers(getMainWindow) {
  taskService = new TaskService(getMainWindow);

  ipcMain.handle('save-task', (event, task) => taskService.createTask(task));
  ipcMain.handle('get-all-tasks', () => taskService.getAllTasks());
  ipcMain.handle('get-completed-tasks', () => taskService.getCompletedTasks());
  ipcMain.handle('get-deleted-tasks', () => taskService.getDeletedTasks());
  ipcMain.handle('get-desk-tasks', () => taskService.getDeskTasks());

  ipcMain.handle('update-task', (event, { id, updates }) => taskService.updateTask(id, updates));

  ipcMain.handle('delete-task', (event, id) => taskService.deleteTask(id));

  ipcMain.handle('restore-task', (event, id) => taskService.restoreTask(id));

  ipcMain.handle('complete-task', (event, id) => taskService.completeTask(id));

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

function getTaskService() {
  return taskService;
}

module.exports = { registerTaskHandlers, getTaskService };
