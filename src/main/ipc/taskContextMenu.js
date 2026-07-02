// src/main/ipc/taskContextMenu.js
const { ipcMain } = require('electron');
const { TaskContextMenu } = require('../menus/taskContextMenu');
const { getTaskById } = require('../../database/repositories/taskRepository');

function registerTaskContextMenuHandlers(mainWindow, stickyManager) {
  const taskContextMenu = new TaskContextMenu(mainWindow, stickyManager);

  ipcMain.on('show-task-context-menu', async (event, { taskId, x, y, view }) => {
    try {
      const task = await getTaskById(taskId);
      if (!task) {
        console.error('[TaskContextMenu] 找不到任务:', taskId);
        return;
      }
      const menu = taskContextMenu.buildMenu(task, view);
      menu.popup({ window: mainWindow, x, y });
    } catch (err) {
      console.error('[TaskContextMenu] 显示菜单失败:', err);
    }
  });
}

module.exports = { registerTaskContextMenuHandlers };
