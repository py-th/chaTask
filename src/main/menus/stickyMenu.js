const { Menu } = require('electron');
const { updateTask, getTaskById, getTasksBySenderName, getTimelineNoteBySenderName } = require('../../database/repositories/taskRepository');
const { deleteReminderRulesByTaskId, deleteReminderLogsByTaskId } = require('../../database/repositories/reminderRepository');
const { showConfirmDialog } = require('../windows/confirmDialog');
const { FEATURES, FEATURE_NAMES, isFeatureEnabled, showPremiumPrompt } = require('../services/featureGate');
const { getAllSkins } = require('../services/skinService');

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
            type: 'danger',
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
        }
      );
    }

    template.push(
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
// 折叠状态下隐藏与内容/样式相关、在折叠小窗口中无意义的选项
    if (!isFolded) {
      template.push(
        {
          label: '复制文本',
          click: () => {
            const note = this.stickyManager.notes.get(noteId);
            if (note && note.win && !note.win.isDestroyed()) {
              note.win.webContents.send('copy-task-text');
            }
          }
        }
      );

      template.push(
        { type: 'separator' },
        {
          label: '皮肤样式',
          submenu: [
        {
          label: '样式设置',
          click: () => {
            const note = this.stickyManager.notes.get(noteId);
            if (note && note.win && !note.win.isDestroyed()) {
              note.win.webContents.send('show-style-panel');
            }
          }
        },
        {
          label: '皮肤模板',
          submenu: getAllSkins('single').map(skin => {
            const isLocked = skin.isPremium && !isFeatureEnabled(FEATURES.SKIN_TEMPLATES);
            return {
              label: `${skin.name} ${isLocked ? '🔒' : ''}`,
              click: (_, win) => {
                const note = this.stickyManager.notes.get(noteId);
                if (isLocked) {
                  showPremiumPrompt(win, FEATURE_NAMES[FEATURES.SKIN_TEMPLATES]);
                  return;
                }
                if (note && note.win && !note.win.isDestroyed()) {
                  note.win.webContents.send('update-style-config', skin.style);
                }
              }
            };
          })
        }
      ]
    }
    )
  };
    if (!isFolded) {
      template.push(
        {
          label: '截取任务',
          click: async () => {
            if (this.screenshotUtils) {
              await this.screenshotUtils.startDoubleScreenshot();
            }
          }
        }
      )
    };

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
      // 后续功能扩展
          {
          label: '工具箱',
          submenu: [
            ...(await this._buildTimelineToolItem(noteId, taskId, showTimeline)),
            {
              label: `桌面倒计时 ${isFeatureEnabled(FEATURES.TOOLBOX_COUNTDOWN) ? '' : '🔒'}`,
              click: (_, win) => {
                if (isFeatureEnabled(FEATURES.TOOLBOX_COUNTDOWN)) {
                  console.log('桌面倒计时', taskId);
                } else {
                  showPremiumPrompt(win, FEATURE_NAMES[FEATURES.TOOLBOX_COUNTDOWN]);
                }
              }
            },
            {
              label: `番茄时钟 ${isFeatureEnabled(FEATURES.TOOLBOX_POMODORO) ? '' : '🔒'}`,
              click: (_, win) => {
                if (isFeatureEnabled(FEATURES.TOOLBOX_POMODORO)) {
                  console.log('番茄时钟', taskId);
                } else {
                  showPremiumPrompt(win, FEATURE_NAMES[FEATURES.TOOLBOX_POMODORO]);
                }
              }
            },
            {
              label: `定时关机 ${isFeatureEnabled(FEATURES.TOOLBOX_SHUTDOWN) ? '' : '🔒'}`,
              click: (_, win) => {
                if (isFeatureEnabled(FEATURES.TOOLBOX_SHUTDOWN)) {
                  console.log('定时关机', taskId);
                } else {
                  showPremiumPrompt(win, FEATURE_NAMES[FEATURES.TOOLBOX_SHUTDOWN]);
                }
              }
            }
          ]
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

  async _buildTimelineToolItem(noteId, taskId, showTimeline) {
    try {
      const task = await getTaskById(taskId);
      if (!task || !task.sender_name) return [];

      const senderName = task.sender_name;
      const visibleNote = this.stickyManager.findTimelineNoteBySenderName(senderName);
      if (visibleNote) {
        return [{
          label: '关闭时间轴',
          click: () => {
            this.stickyManager.closeTimelineNote(senderName);
            this.notifyMainWindowUpdate();
          }
        }];
      }

      const record = getTimelineNoteBySenderName(senderName);
      if (record) {
        return [{
          label: '打开时间轴',
          click: () => {
            this.stickyManager.openTimelineNote(senderName);
            this.notifyMainWindowUpdate();
          }
        }];
      }

      if (showTimeline) {
        return [{
          label: '创建时间轴',
          click: async () => {
            try {
              const tasks = getTasksBySenderName(senderName);
              if (tasks.length > 0) {
                this.stickyManager.createTimelineNote(tasks, senderName, task.sender_avatar);
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
        }];
      }

      return [];
    } catch (err) {
      console.error('[StickyMenu] 构建时间轴工具项失败:', err);
      return [];
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

  buildTimelineStatusMenu(noteId, taskId) {
    return Menu.buildFromTemplate([
      {
        label: '完成',
        click: async () => {
          const completedAt = new Date().toISOString();
          await updateTask(taskId, {
            status: 'completed',
            is_completed: 1,
            completed_at: completedAt
          });
          deleteReminderRulesByTaskId(taskId);
          deleteReminderLogsByTaskId(taskId);
          this._notifyNote(noteId, 'timeline-update-task', { taskId, status: 'completed' });
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '进行中',
        click: async () => {
          await updateTask(taskId, { status: 'in_progress', is_completed: 0, completed_at: null });
          this._notifyNote(noteId, 'timeline-update-task', { taskId, status: 'in_progress', is_completed: 0 });
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '待办',
        click: async () => {
          await updateTask(taskId, { status: 'pending', is_completed: 0, completed_at: null });
          this._notifyNote(noteId, 'timeline-update-task', { taskId, status: 'pending', is_completed: 0 });
          this.notifyMainWindowUpdate();
        }
      },
      {
        label: '逾期',
        click: async () => {
          await updateTask(taskId, { status: 'overdue', is_completed: 0, completed_at: null });
          this._notifyNote(noteId, 'timeline-update-task', { taskId, status: 'overdue', is_completed: 0 });
          this.notifyMainWindowUpdate();
        }
      }
    ]);
  }
}

module.exports = { StickyMenu };
