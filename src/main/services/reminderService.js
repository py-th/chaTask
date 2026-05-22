// src/main/services/reminderService.js
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const {
  getAllEnabledRules,
  createReminderLog,
  updateReminderLog,
  getPendingReminderLogs,
  getLatestReminderLog,
  deleteReminderLogsByTaskId,
  getAllPendingSnoozeLogs
} = require('../../database/repositories/reminderRepository');
const { updateTask, getTaskById } = require('../../database/repositories/taskRepository');

class ReminderService {
  constructor(stickyManager) {
    this.stickyManager = stickyManager;
    this.checkInterval = null;
    this.popupWindows = new Map();
  }

  start() {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkReminders();
    }, 30000);

    this.checkReminders();

    console.log('[ReminderService] 提醒调度器已启动 (间隔30秒)');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    for (const win of this.popupWindows.values()) {
      if (!win.isDestroyed()) win.close();
    }
    this.popupWindows.clear();

    console.log('[ReminderService] 提醒调度器已停止');
  }

  async checkReminders() {
    try {
      const now = new Date();

      const rules = getAllEnabledRules();
      for (const rule of rules) {
        const nextTime = this.calculateNextReminder(rule);
        if (!nextTime) continue;

        const pendingLogs = getPendingReminderLogs(rule.task_id);
        const hasPendingForThisTime = pendingLogs.some(log => {
          const logTime = new Date(log.scheduled_time);
          return Math.abs(logTime.getTime() - nextTime.getTime()) < 60000;
        });

        if (hasPendingForThisTime) continue;

        const diffMs = nextTime.getTime() - now.getTime();
        if (diffMs <= 60000) {
          this.triggerReminder(rule, nextTime);
        }
      }

      const snoozeLogs = getAllPendingSnoozeLogs();
      for (const log of snoozeLogs) {
        const scheduledTime = new Date(log.scheduled_time);
        const diffMs = scheduledTime.getTime() - now.getTime();

        if (diffMs <= 60000) {
          this.triggerSnoozeReminder(log);
        }
      }
    } catch (err) {
      console.error('[ReminderService] 检查提醒失败:', err);
    }
  }

  parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
  }

  calculateNextReminder(rule) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [hours, minutes] = (rule.reminder_time || '09:00').split(':').map(Number);

    const startDate = rule.start_date ? this.parseDateLocal(rule.start_date) : null;

    switch (rule.repeat_type) {
      case 'once': {
        if (!rule.start_date) return null;
        const date = this.parseDateLocal(rule.start_date);
        date.setHours(hours, minutes, 0, 0);
        return date > now ? date : null;
      }

      case 'daily': {
        let nextDate = new Date(today);
        nextDate.setHours(hours, minutes, 0, 0);

        if (nextDate <= now) {
          nextDate.setDate(nextDate.getDate() + 1);
        }

        if (startDate) {
          const startDateTime = new Date(startDate);
          startDateTime.setHours(hours, minutes, 0, 0);
          if (nextDate < startDateTime) {
            nextDate = new Date(startDateTime);
          }
        }

        if (rule.end_date) {
          const endDate = this.parseDateLocal(rule.end_date);
          endDate.setHours(23, 59, 59, 999);
          if (nextDate > endDate) {
            return null;
          }
        }

        return nextDate;
      }

      case 'weekly': {
        const config = rule.repeat_config ? JSON.parse(rule.repeat_config) : {};
        const weekdays = config.weekdays || [1];

        for (let i = 0; i < 14; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() + i);
          const dayOfWeek = checkDate.getDay() || 7;

          if (weekdays.includes(dayOfWeek)) {
            checkDate.setHours(hours, minutes, 0, 0);
            if (checkDate > now) {
              if (startDate) {
                const startDateTime = new Date(startDate);
                startDateTime.setHours(hours, minutes, 0, 0);
                if (checkDate < startDateTime) {
                  continue;
                }
              }

              if (rule.end_date) {
                const endDate = this.parseDateLocal(rule.end_date);
                endDate.setHours(23, 59, 59, 999);
                if (checkDate > endDate) {
                  return null;
                }
              }
              return checkDate;
            }
          }
        }
        return null;
      }

      case 'monthly': {
        const config = rule.repeat_config ? JSON.parse(rule.repeat_config) : {};
        const monthDays = config.monthDays || [1];

        for (let monthOffset = 0; monthOffset < 24; monthOffset++) {
          const checkDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

          for (const day of monthDays.sort((a, b) => a - b)) {
            const lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
            const actualDay = Math.min(day, lastDayOfMonth);
            checkDate.setDate(actualDay);
            checkDate.setHours(hours, minutes, 0, 0);

            if (checkDate > now) {
              if (startDate) {
                const startDateTime = new Date(startDate);
                startDateTime.setHours(0, 0, 0, 0);
                if (checkDate < startDateTime) {
                  continue;
                }
              }

              if (rule.end_date) {
                const endDate = this.parseDateLocal(rule.end_date);
                endDate.setHours(23, 59, 59, 999);
                if (checkDate > endDate) {
                  return null;
                }
              }
              return checkDate;
            }
          }
        }
        return null;
      }

      case 'custom': {
        const customDates = rule.custom_dates ? JSON.parse(rule.custom_dates) : [];

        for (const dateStr of customDates.sort()) {
          const date = this.parseDateLocal(dateStr);
          date.setHours(hours, minutes, 0, 0);

          if (date > now) {
            return date;
          }
        }
        return null;
      }

      default:
        return null;
    }
  }

  async triggerReminder(rule, scheduledTime) {
    const taskId = rule.task_id;

    const task = getTaskById(taskId);
    if (!task || task.is_completed === 1 || task.is_deleted === 1) {
      console.log(`[ReminderService] 任务 ${taskId} 已完成或已删除，跳过提醒`);
      return;
    }

    createReminderLog({
      ruleId: rule.id,
      taskId: taskId,
      scheduledTime: scheduledTime.toISOString(),
      triggeredAt: new Date().toISOString(),
      status: 'pending'
    });

    const note = this.findNoteByTaskId(taskId);

    this.startAvatarBlink(taskId);

    this.createPopupWindow(rule, scheduledTime, note);
  }

  async triggerSnoozeReminder(log) {
    const taskId = log.task_id;

    if (this.popupWindows.has(taskId)) {
      const existing = this.popupWindows.get(taskId);
      if (existing && !existing.isDestroyed()) {
        return;
      }
      this.popupWindows.delete(taskId);
    }

    const task = getTaskById(taskId);
    if (!task || task.is_completed === 1 || task.is_deleted === 1) {
      updateReminderLog(log.id, {
        status: 'dismissed',
        triggered_at: new Date().toISOString()
      });
      this.stopAvatarBlink(taskId);
      return;
    }

    updateReminderLog(log.id, {
      triggered_at: new Date().toISOString()
    });

    const note = this.findNoteByTaskId(taskId);

    this.createPopupWindow({
      task_id: taskId,
      task_content: log.task_content,
      sender_name: log.sender_name,
      sender_avatar: log.sender_avatar
    }, new Date(log.scheduled_time), note);
  }

  createPopupWindow(rule, scheduledTime, note) {
    const taskId = rule.task_id;

    if (this.popupWindows.has(taskId)) {
      const existing = this.popupWindows.get(taskId);
      if (!existing.isDestroyed()) {
        existing.removeAllListeners('closed');
        existing.close();
      }
      this.popupWindows.delete(taskId);
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    const popupWidth = 400;
    const popupHeight = 500;
    const x = Math.round((screenWidth - popupWidth) / 2);
    const y = Math.round((screenHeight - popupHeight) / 2);

    const popupWin = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const popupPath = path.join(__dirname, '../templates/reminderPopup.html');
    popupWin.loadFile(popupPath);

    popupWin.once('ready-to-show', () => {
      popupWin.show();
      popupWin.focus();

      popupWin.webContents.send('show-reminder-popup', {
        taskId: rule.task_id,
        noteId: note ? note.id : null,
        taskContent: rule.task_content,
        senderName: rule.sender_name,
        senderAvatar: rule.sender_avatar,
        scheduledTime: scheduledTime.toISOString()
      });
    });

    popupWin.on('closed', () => {
      if (this.popupWindows.get(taskId) === popupWin) {
        this.popupWindows.delete(taskId);
      }
    });

    this.popupWindows.set(taskId, popupWin);
  }

  startAvatarBlink(taskId) {
    const note = this.findNoteByTaskId(taskId);
    if (!note || !note.win || note.win.isDestroyed()) return;

    note.win.webContents.send('start-avatar-blink');
  }

  stopAvatarBlink(taskId) {
    const note = this.findNoteByTaskId(taskId);
    if (!note || !note.win || note.win.isDestroyed()) return;

    note.win.webContents.send('stop-avatar-blink');
  }

  minimizePopupWindow(taskId) {
    if (this.popupWindows.has(taskId)) {
      const win = this.popupWindows.get(taskId);
      if (!win.isDestroyed()) {
        win.minimize();
      }
    }
  }

  async handleReminderAction(taskId, action, data = {}) {
    const task = getTaskById(taskId);
    if (!task || task.is_completed === 1 || task.is_deleted === 1) {
      console.log(`[ReminderService] 任务 ${taskId} 状态异常，忽略操作`);
      this.stopAvatarBlink(taskId);
      this.closePopupWindow(taskId);
      return;
    }

    const pendingLogs = getPendingReminderLogs(taskId);
    if (pendingLogs.length === 0) return;

    const latestLog = pendingLogs[0];

    switch (action) {
      case 'complete': {
        await updateTask(taskId, {
          status: 'completed',
          is_completed: 1,
          is_show_desk: 0
        });

        for (const log of pendingLogs) {
          updateReminderLog(log.id, {
            status: 'completed',
            triggered_at: new Date().toISOString()
          });
        }

        this.stopAvatarBlink(taskId);

        this.closePopupWindow(taskId);

        const note = this.findNoteByTaskId(taskId);
        if (note && note.win && !note.win.isDestroyed()) {
          setTimeout(() => note.win.close(), 500);
        }
        break;
      }

      case 'snooze': {
        const snoozeMinutes = data.minutes || 3;
        const snoozeTime = new Date();
        snoozeTime.setMinutes(snoozeTime.getMinutes() + snoozeMinutes);

        updateReminderLog(latestLog.id, {
          status: 'snoozed',
          snooze_minutes: snoozeMinutes,
          triggered_at: new Date().toISOString()
        });

        createReminderLog({
          ruleId: latestLog.rule_id,
          taskId: taskId,
          scheduledTime: snoozeTime.toISOString(),
          triggeredAt: new Date().toISOString(),
          status: 'pending',
          snoozeMinutes: snoozeMinutes
        });

        this.closePopupWindow(taskId);
        break;
      }

      case 'dismiss': {
        updateReminderLog(latestLog.id, {
          status: 'dismissed',
          triggered_at: new Date().toISOString()
        });

        this.stopAvatarBlink(taskId);

        this.closePopupWindow(taskId);
        break;
      }

      case 'reconfig': {
        for (const log of pendingLogs) {
          updateReminderLog(log.id, {
            status: 'dismissed',
            triggered_at: new Date().toISOString()
          });
        }

        this.stopAvatarBlink(taskId);

        this.closePopupWindow(taskId);

        this.openReminderSettings(taskId);
        break;
      }
    }
  }

  openReminderSettings(taskId) {
    const note = this.findNoteByTaskId(taskId);
    if (note && note.win && !note.win.isDestroyed()) {
      note.win.webContents.send('show-repeat-remind-picker');
      return;
    }

    const { getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');

    const existingRule = getReminderRuleByTaskId(taskId);
    const dialogPath = path.join(__dirname, '../templates/repeatRemindDialog.html');

    const dialogWin = new BrowserWindow({
      width: 400,
      height: 580,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      movable: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload/index.js')
      }
    });

    dialogWin.loadFile(dialogPath);

    dialogWin.taskId = taskId;
    dialogWin.noteId = null;

    dialogWin.webContents.on('did-finish-load', () => {
      if (existingRule) {
        dialogWin.webContents.send('load-reminder-data', {
          repeatType: existingRule.repeat_type,
          reminderTime: existingRule.reminder_time,
          startDate: existingRule.start_date,
          endDate: existingRule.end_date,
          advanceMinutes: existingRule.advance_minutes,
          reminderWay: existingRule.reminder_way,
          reminderEnabled: existingRule.is_enabled === 1,
          repeatConfig: existingRule.repeat_config ? JSON.parse(existingRule.repeat_config) : null,
          customDates: existingRule.custom_dates ? JSON.parse(existingRule.custom_dates) : null
        });
      }
    });
  }

  closePopupWindow(taskId) {
    if (this.popupWindows.has(taskId)) {
      const win = this.popupWindows.get(taskId);
      if (!win.isDestroyed()) {
        win.close();
      }
      this.popupWindows.delete(taskId);
    }
  }

  findNoteByTaskId(taskId) {
    for (const [noteId, note] of this.stickyManager.notes.entries()) {
      if (note.taskId === taskId) {
        return { ...note, id: noteId };
      }
    }
    return null;
  }

  getNextReminderText(rule) {
    const nextTime = this.calculateNextReminder(rule);
    if (!nextTime) return null;

    const now = new Date();
    const diffMs = nextTime.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let dateText;
    if (diffDays === 0) {
      dateText = '今天';
    } else if (diffDays === 1) {
      dateText = '明天';
    } else if (diffDays === 2) {
      dateText = '后天';
    } else {
      dateText = `${nextTime.getMonth() + 1}月${nextTime.getDate()}日`;
    }

    const timeText = `${String(nextTime.getHours()).padStart(2, '0')}:${String(nextTime.getMinutes()).padStart(2, '0')}`;

    switch (rule.repeat_type) {
      case 'once':
        return `单次 ${dateText} ${timeText}`;
      case 'daily':
        return `每天 ${dateText} ${timeText}`;
      case 'weekly':
        return `每周 ${dateText} ${timeText}`;
      case 'monthly':
        return `每月 ${dateText} ${timeText}`;
      case 'custom':
        return `自选 ${dateText} ${timeText}`;
      default:
        return `${dateText} ${timeText}`;
    }
  }
}

module.exports = ReminderService;