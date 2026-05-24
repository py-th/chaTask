const { Menu, dialog } = require('electron');
const { updateTask } = require('../../database/repositories/taskRepository');
const { deleteReminderRulesByTaskId, deleteReminderLogsByTaskId } = require('../../database/repositories/reminderRepository');

class StickyMenu {
  constructor(stickyManager, screenshotUtils) {
    this.stickyManager = stickyManager;
    this.screenshotUtils = screenshotUtils;
  }

  buildContextMenu(noteId, taskId, isPinned) {
    const pinLabel = isPinned ? '取消置顶' : '置顶';

    return Menu.buildFromTemplate([
      {
        label: pinLabel,
        click: async () => {
          const newPinnedState = !isPinned;
          const note = this.stickyManager.notes.get(noteId);
          if (note && !note.win.isDestroyed()) {
            note.win.setAlwaysOnTop(newPinnedState);
          }
          await updateTask(taskId, { is_pinned: newPinnedState ? 1 : 0 });
        }
      },
      {
        label: '隐藏 🙈',
        click: async (_, win) => {
          await updateTask(taskId, { is_show_desk: 0 });
          if (win && !win.isDestroyed()) {
            win.close();
          }
        }
      },
      {
        label: '删除',
        click: async (_, win) => {
          const result = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['取消', '删除'],
            defaultId: 0,
            cancelId: 0,
            title: '确认删除',
            message: '确定要删除这个任务吗？',
            detail: '删除后任务将移动到回收站，您可以在回收站中恢复。'
          });
          
          // 用户点击"删除"（索引1）
          if (result.response === 1) {
            // 清理该任务的提醒规则和日志
            deleteReminderRulesByTaskId(taskId);
            deleteReminderLogsByTaskId(taskId);
            // 标记为删除（移动到回收站）
            await updateTask(taskId, { is_deleted: 1, is_show_desk: 0 });
            if (win && !win.isDestroyed()) {
              win.close();
            }
          }
        }
      },
      { type: 'separator' },
       {
        label: '复制文本',
        click: () => {
          const note = this.stickyManager.notes.get(noteId);
          if (note && note.win && !note.win.isDestroyed()) {
            note.win.webContents.send('copy-task-text');
          }
        }
      },
      {
        label: '截取任务',
        click: async () => {
          if (this.screenshotUtils) {
            await this.screenshotUtils.startDoubleScreenshot();
          }
        }
      },
      { type: 'separator' },
      {
        label: '优先级',
        submenu: this._buildPrioritySubmenu(noteId, taskId)
      },
      {
        label: '状态',
        submenu: this._buildStatusSubmenu(noteId, taskId)
      },
      {
        label: '重复&提醒',
        click: () => {
          const note = this.stickyManager.notes.get(noteId);
          if (note && note.win && !note.win.isDestroyed()) {
            note.win.webContents.send('show-repeat-remind-picker');
          }
        }
      },
      { type: 'separator' },
      {
        label: '样式',
        click: () => {
          const note = this.stickyManager.notes.get(noteId);
          if (note && note.win && !note.win.isDestroyed()) {
            note.win.webContents.send('show-style-panel');
          }
        }
      },
      {
        label: '皮肤模板',
        submenu: [
          {
            label: '经典',
            click: () => {
              console.log('应用经典模板', taskId);
            }
          },
          {
            label: '简约',
            click: () => {
              console.log('应用简约模板', taskId);
            }
          },
          {
            label: '可爱',
            click: () => {
              console.log('应用可爱模板', taskId);
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: '便签管理器',
        click: () => {
          console.log('打开便签管理器');
        }
      },
      {
        label: '工具箱',
        click: () => {
          // 后续功能扩展
          console.log('桌面倒计时，番茄时钟，定时关机');
        }
      }
    ]);
  }

  _buildPrioritySubmenu(noteId, taskId) {
    return [
      {
        label: '高',
        click: async () => {
          await updateTask(taskId, { priority: 'high', color: null });
          this._notifyNote(noteId, 'update-priority', 'high');
        }
      },
      {
        label: '中',
        click: async () => {
          await updateTask(taskId, { priority: 'medium', color: null });
          this._notifyNote(noteId, 'update-priority', 'medium');
        }
      },
      {
        label: '低',
        click: async () => {
          await updateTask(taskId, { priority: 'low', color: null });
          this._notifyNote(noteId, 'update-priority', 'low');
        }
      },
      {
        label: '无',
        click: async () => {
          await updateTask(taskId, { priority: 'none', color: null });
          this._notifyNote(noteId, 'update-priority', 'none');
        }
      }
    ];
  }

  _buildStatusSubmenu(noteId, taskId) {
    return [
      {
        label: '完成',
        click: async () => {
          const completedAt = new Date().toISOString();
          await updateTask(taskId, { 
            status: 'completed', 
            is_completed: 1,
            is_show_desk: 0,
            completed_at: completedAt
          });
          // 清理该任务的提醒规则和日志
          deleteReminderRulesByTaskId(taskId);
          deleteReminderLogsByTaskId(taskId);
          // 通知前端更新状态显示
          this._notifyNote(noteId, 'update-status', 'completed');
          // 延迟关闭窗口，让用户看到状态变化
          setTimeout(() => {
            const note = this.stickyManager.notes.get(noteId);
            if (note && note.win && !note.win.isDestroyed()) {
              note.win.close();
            }
          }, 500);
        }
      },
      {
        label: '进行中',
        click: async () => {
          await updateTask(taskId, { status: 'in_progress', is_show_desk: 1 });
          this._notifyNote(noteId, 'update-status', 'in_progress');
        }
      },
      {
        label: '待办',
        click: async () => {
          await updateTask(taskId, { status: 'pending', is_show_desk: 1 });
          this._notifyNote(noteId, 'update-status', 'pending');
        }
      },
      {
        label: '逾期',
        click: async () => {
          await updateTask(taskId, { status: 'overdue', is_show_desk: 1 });
          this._notifyNote(noteId, 'update-status', 'overdue');
        }
      }
    ];
  }

  _notifyNote(noteId, eventName, data) {
    const note = this.stickyManager.notes.get(noteId);
    if (note && note.win && !note.win.isDestroyed()) {
      note.win.webContents.send(eventName, data);
    }
  }

  buildPriorityMenu(noteId, taskId) {
    return Menu.buildFromTemplate(this._buildPrioritySubmenu(noteId, taskId));
  }

  buildStatusMenu(noteId, taskId) {
    return Menu.buildFromTemplate(this._buildStatusSubmenu(noteId, taskId));
  }
}

module.exports = { StickyMenu };
