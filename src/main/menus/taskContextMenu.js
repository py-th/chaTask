// src/main/menus/taskContextMenu.js
const { Menu, clipboard } = require('electron');
const { updateTask, getTaskById, deleteTask } = require('../../database/repositories/taskRepository');
const { deleteReminderRulesByTaskId, deleteReminderLogsByTaskId } = require('../../database/repositories/reminderRepository');
const { showRendererConfirmDialog } = require('../utils/rendererConfirmDialog');

class TaskContextMenu {
  constructor(mainWindow, stickyManager) {
    this.mainWindow = mainWindow;
    this.stickyManager = stickyManager;
  }

  _notifyRefresh() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('refresh-task-list');
    }
  }

  _sendToast(type, message) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('show-toast', { type, message });
    }
  }

  _closeStickyNoteByTaskId(taskId) {
    if (!this.stickyManager || !this.stickyManager.notes) return;
    for (const [noteId, note] of this.stickyManager.notes.entries()) {
      if (note.taskId === taskId && note.win && !note.win.isDestroyed()) {
        note.win.close();
        break;
      }
    }
  }

  buildMenu(task, view) {
    const isDeleted = task.is_deleted === 1;
    const isCompleted = task.is_completed === 1;
    const isOnDesktop = task.is_show_desk === 1;

    const template = [];

    // 详情
    if (!isDeleted) {
      template.push({
        label: '📋 详情',
        click: () => {
          if (view === 'tasklist' && this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('open-task-detail', task);
          } else {
            this._notifyRefresh();
          }
        }
      });
    }

    // 添加到桌面 / 从桌面隐藏
    if (!isDeleted && !isCompleted) {
      if (isOnDesktop) {
        template.push({
          label: '🙈 从桌面隐藏',
          click: async () => {
            try {
              await updateTask(task.id, { is_show_desk: 0 });
              this._closeStickyNoteByTaskId(task.id);
              this._notifyRefresh();
              this._sendToast('success', '已从桌面隐藏');
            } catch (err) {
              console.error('[TaskContextMenu] 从桌面隐藏失败:', err);
              this._sendToast('error', '从桌面隐藏失败');
            }
          }
        });
      } else {
        template.push({
          label: '📌 添加到桌面',
          click: async () => {
            try {
              if (this.stickyManager) {
                this.stickyManager.createNote(task);
              }
              await updateTask(task.id, { is_show_desk: 1 });
              this._notifyRefresh();
              this._sendToast('success', '已添加到桌面');
            } catch (err) {
              console.error('[TaskContextMenu] 添加到桌面失败:', err);
              this._sendToast('error', '添加到桌面失败');
            }
          }
        });
      }
    }

    // 复制文本
    template.push({
      label: '📄 复制文本',
      click: () => {
        try {
          clipboard.writeText(task.content || '');
          this._sendToast('success', '任务文本已复制');
        } catch (err) {
          console.error('[TaskContextMenu] 复制失败:', err);
          this._sendToast('error', '复制失败');
        }
      }
    });

    // 提醒设置
    if (!isDeleted && !isCompleted) {
      template.push({
        label: '🔔 提醒设置',
        click: () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('open-task-reminder-dialog', task.id);
          }
        }
      });
    }

    template.push({ type: 'separator' });

    // 恢复 / 删除 / 彻底删除
    if (isDeleted) {
      template.push({
        label: '🔄 恢复',
        click: async () => {
          try {
            await updateTask(task.id, { is_deleted: 0 });
            this._notifyRefresh();
            this._sendToast('success', '任务已恢复');
          } catch (err) {
            console.error('[TaskContextMenu] 恢复任务失败:', err);
            this._sendToast('error', '恢复任务失败');
          }
        }
      });
      template.push({
        label: '💣 彻底删除',
        click: async () => {
          const confirmed = await showRendererConfirmDialog(this.mainWindow, {
            title: '确认彻底删除',
            message: '确定要彻底删除这个任务吗？',
            detail: '此操作不可恢复，请谨慎操作！',
            type: 'danger',
            confirmText: '彻底删除',
            cancelText: '取消'
          });
          if (!confirmed) return;
          try {
            deleteTask(task.id);
            this._closeStickyNoteByTaskId(task.id);
            this._notifyRefresh();
            this._sendToast('success', '任务已彻底删除');
          } catch (err) {
            console.error('[TaskContextMenu] 彻底删除失败:', err);
            this._sendToast('error', '彻底删除失败');
          }
        }
      });
    } else {
      template.push({
        label: '🗑️ 删除',
        click: async () => {
          const confirmed = await showRendererConfirmDialog(this.mainWindow, {
            title: '确认删除',
            message: '确定要删除这个任务吗？',
            detail: '删除后任务将移动到回收站，您可以在回收站中恢复。',
            type: 'danger',
            confirmText: '删除',
            cancelText: '取消'
          });
          if (!confirmed) return;
          try {
            deleteReminderRulesByTaskId(task.id);
            deleteReminderLogsByTaskId(task.id);
            await updateTask(task.id, { is_deleted: 1, is_show_desk: 0 });
            this._closeStickyNoteByTaskId(task.id);
            this._notifyRefresh();
            this._sendToast('success', '任务删除成功');
          } catch (err) {
            console.error('[TaskContextMenu] 删除任务失败:', err);
            this._sendToast('error', '删除任务失败');
          }
        }
      });
    }

    return Menu.buildFromTemplate(template);
  }
}

module.exports = { TaskContextMenu };
