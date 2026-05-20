// src/main/ipc/task.js
const { ipcMain } = require('electron');
const { insertTask, getAllTasks, getCompletedTasks, getDeletedTasks, getTaskById, updateTask } = require('../../database/repositories/taskRepository');

function registerTaskHandlers() {
  ipcMain.handle('save-task', (event, task) => insertTask(task));
  ipcMain.handle('get-all-tasks', () => getAllTasks());
  ipcMain.handle('get-completed-tasks', () => getCompletedTasks());
  ipcMain.handle('get-deleted-tasks', () => getDeletedTasks());
  
  // 更新任务
  ipcMain.handle('update-task', (event, { id, updates }) => updateTask(id, updates));
  
  // 1. 添加：获取单个任务详情
  ipcMain.handle('get-task-detail', async (event, taskId) => {
    try {
      const task = await getTaskById(taskId); // 你的数据库查询方法
      return task; // 返回包含 is_pinned 等字段的对象
    } catch (error) {
      console.error('获取任务详情失败:', error);
      return null;
    }
  });
}

module.exports = { registerTaskHandlers };
