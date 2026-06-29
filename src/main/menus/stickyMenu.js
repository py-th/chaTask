const { Menu } = require('electron');
const { updateTask, getTaskById, getTasksBySenderName } = require('../../database/repositories/taskRepository');
const { deleteReminderRulesByTaskId, deleteReminderLogsByTaskId } = require('../../database/repositories/reminderRepository');
const { showConfirmDialog } = require('../windows/confirmDialog');

class StickyMenu {
  constructor(mainWindow, stickyManager, screenshotUtils) {
    this.mainWindow = mainWindow;
    this.stickyManager = stickyManager;
    this.screenshotUtils = screenshotUtils;
  }

  // 通知主窗口刷新任务列表
  notifyMainWindowUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('refresh-task-list');
    }
  }

  async buildContextMenu(noteId, taskId, isPinned, isFolded = false) {
    const pinLabel = isPinned ? '取消置顶' : '置顶';

    // 检查该联系人是否有至少2条任务
    let showTimeline = false;
    try {
      const task = await getTaskById(taskId);
      if (task && task.sender_name) {
        const tasks = getTasksBySenderName(task.sender_name);
        showTimeline = tasks.length >= 2;
      }
    } catch (err) {
      console.error('[StickyMenu] 检查任务数量失败:', err);
    }

    const template = [
      {
        label: pinLabel,
        click: async () => {
          const newPinnedState = !isPinned;
          const note = this.stickyManager.notes.get(noteId);
          if (note && !note.win.isDestroyed()) {
            note.win.setAlwaysOnTop(newPinnedState);
          }
          await updateTask(taskId, { is_pinned: newPinnedState ? 1 : 0 });
          this.notifyMainWindowUpdate();
        }
      }
    ];

    template.push(
      {
        label: '隐藏 🙈',
        click: async (_, win) => {
          await updateTask(taskId, { is_show_desk: 0 });
          if (win && !win.isDestroyed()) {
            win.close();
          }
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '删除',
        click: async (_, win) => {
          const confirmed = await showConfirmDialog(win, {
            title: '确认删除',
            message: '确定要删除这个任务吗？',
            detail: '删除后任务将移动到回收站，您可以在回收站中恢复。',
            type: 'warning',
            confirmText: '删除',
            cancelText: '取消'
          });

          if (confirmed) {
            // 清理该任务的提醒规则和日志
            deleteReminderRulesByTaskId(taskId);
            deleteReminderLogsByTaskId(taskId);
            // 标记为删除（移动到回收站）
            await updateTask(taskId, { is_deleted: 1, is_show_desk: 0 });
            if (win && !win.isDestroyed()) {
              win.close();
            }
            this.notifyMainWindowUpdate();
          }
        }
      }
    );

    // 折叠状态下隐藏与内容/样式相关、在折叠小窗口中无意义的选项
    if (!isFolded) {
      template.push(
        { type: 'separator' },
        {
          label: '贴边',
          submenu: [
            { label: '顶部', click: () => this._snapNoteEdge(noteId, 'top') },
            { label: '左边', click: () => this._snapNoteEdge(noteId, 'left') },
            { label: '右边', click: () => this._snapNoteEdge(noteId, 'right') }
          ]
        },
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
        }
      );
    }

    template.push(
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
      }
    );

    if (showTimeline) {
      template.push({
        label: '时间轴',
        click: async () => {
          try {
            const task = await getTaskById(taskId);
            if (!task || !task.sender_name) return;
            const tasks = getTasksBySenderName(task.sender_name);
            if (tasks.length > 0) {
              this.stickyManager.createTimelineNote(tasks, task.sender_name, task.sender_avatar);
              // 隐藏原便签（该任务已在时间轴中显示）
              await updateTask(taskId, { is_show_desk: 0 });
              const note = this.stickyManager.notes.get(noteId);
              if (note && note.win && !note.win.isDestroyed()) {
                note.win.close();
              }
              this.notifyMainWindowUpdate();
            }
          } catch (err) {
            console.error('[StickyMenu] 创建时间轴失败:', err);
          }
        }
      });
    }

    if (!isFolded) {
      template.push(
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
        }
      );
    }

    template.push(
      { type: 'separator' },
      {
        label: '便签管理器',
        click: () => {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this.mainWindow.isMinimized()) {
              this.mainWindow.restore();
            }
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        }
      },
      {
        label: '工具箱',
        click: () => {
          // 后续功能扩展
          console.log('桌面倒计时，番茄时钟，定时关机');
        }
      }
    );

    return Menu.buildFromTemplate(template);
  }

  _buildPrioritySubmenu(noteId, taskId) {
    return [
      {
        label: '高',
        click: async () => {
          await updateTask(taskId, { priority: 'high', color: null });
          this._notifyNote(noteId, 'update-priority', 'high');
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '中',
        click: async () => {
          await updateTask(taskId, { priority: 'medium', color: null });
          this._notifyNote(noteId, 'update-priority', 'medium');
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '低',
        click: async () => {
          await updateTask(taskId, { priority: 'low', color: null });
          this._notifyNote(noteId, 'update-priority', 'low');
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '无',
        click: async () => {
          await updateTask(taskId, { priority: 'none', color: null });
          this._notifyNote(noteId, 'update-priority', 'none');
          this.notifyMainWindowUpdate();
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
          this.notifyMainWindowUpdate();
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
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '待办',
        click: async () => {
          await updateTask(taskId, { status: 'pending', is_show_desk: 1 });
          this._notifyNote(noteId, 'update-status', 'pending');
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '逾期',
        click: async () => {
          await updateTask(taskId, { status: 'overdue', is_show_desk: 1 });
          this._notifyNote(noteId, 'update-status', 'overdue');
          this.notifyMainWindowUpdate();
        }
      }
    ];
  }

  _snapNoteEdge(noteId, edge) {
    const note = this.stickyManager.notes.get(noteId);
    if (note && note.win && !note.win.isDestroyed()) {
      this.stickyManager.foldNote(note.win, noteId, edge);
    }
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
