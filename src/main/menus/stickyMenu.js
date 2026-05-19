const { Menu } = require('electron');
const { updateTask } = require('../../database/repositories/taskRepository');

class StickyMenu {
  constructor(stickyManager) {
    this.stickyManager = stickyManager;
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
      { type: 'separator' },
      {
        label: '隐藏 🙈',
        click: (_, win) => {
          if (win && !win.isDestroyed()) {
            win.close();
          }
        }
      },
      {
        label: '删除便签',
        click: async (_, win) => {
          await updateTask(taskId, { is_show_desk: 0 });
          if (win && !win.isDestroyed()) {
            win.close();
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
      { type: 'separator' },
      {
        label: '重复&提醒',
        click: () => {
          const note = this.stickyManager.notes.get(noteId);
          if (note && note.win && !note.win.isDestroyed()) {
            note.win.webContents.send('show-repeat-remind-picker');
          }
        }
      },
      {
        label: '样式',
        submenu: [
          {
            label: '字体',
            click: () => {
              console.log('字体格式设置', taskId);
            }
          },
          {
            label: '便签背景色',
            click: () => {
              console.log('便签背景色设置', taskId);
            }
          },
          {
            label: '便签透明度',
            click: () => {
              console.log('便签透明度设置', taskId);
            }
          },
          {
            label: '文字加粗',
            click: () => {
              console.log('文字加粗设置', taskId);
            }
          },
          {
            label: '文字颜色',
            click: () => {
              console.log('文字颜色设置', taskId);
            }
          }
        ]
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
      }
    ]);
  }

  _buildPrioritySubmenu(noteId, taskId) {
    return [
      {
        label: '高',
        click: async () => {
          await updateTask(taskId, { priority: 'high' });
          this._notifyNote(noteId, 'update-priority', 'high');
        }
      },
      {
        label: '中',
        click: async () => {
          await updateTask(taskId, { priority: 'medium' });
          this._notifyNote(noteId, 'update-priority', 'medium');
        }
      },
      {
        label: '低',
        click: async () => {
          await updateTask(taskId, { priority: 'low' });
          this._notifyNote(noteId, 'update-priority', 'low');
        }
      }
    ];
  }

  _buildStatusSubmenu(noteId, taskId) {
    return [
      {
        label: '完成',
        click: async () => {
          await updateTask(taskId, { status: 'completed', is_show_desk: 0 });
          const note = this.stickyManager.notes.get(noteId);
          if (note && note.win && !note.win.isDestroyed()) {
            note.win.close();
          }
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

module.exports = StickyMenu;