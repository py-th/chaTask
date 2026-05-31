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
    return await updateTask(id, { is_completed: 1, is_show_desk: 0 });
  }

  async showOnDesk(id, show = true) {
    return await updateTask(id, { is_show_desk: show ? 1 : 0 });
  }

  async togglePin(id, isPinned) {
    return await updateTask(id, { is_pinned: isPinned ? 1 : 0 });
  }
}

module.exports = TaskService;
