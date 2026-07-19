// src/main/services/reminderService.js
const { BrowserWindow, screen, Notification, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  getAllEnabledRules,
  createReminderLog,
  updateReminderLog,
  getPendingReminderLogs,
  getLatestReminderLog,
  deleteReminderRulesByTaskId,
  deleteReminderLogsByTaskId,
  deleteOldReminderLogs,
  getAllPendingSnoozeLogs
} = require('../../database/repositories/reminderRepository');
const { updateTask, getTaskById } = require('../../database/repositories/taskRepository');
const { getTaskService, syncStickyNoteUpdate } = require('../ipc/task');

function getNotificationIconPath() {
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'resource', 'tray_icon32.png');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }
  const devPath = path.join(process.cwd(), 'public', 'resource', 'tray_icon32.png');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return null;
}

function getStickyIconPath() {
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'resource', 'tray_icon48.png');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }
  const devPath = path.join(process.cwd(), 'public', 'resource', 'tray_icon48.png');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  if (process.resourcesPath) {
    const prodPath32 = path.join(process.resourcesPath, 'resource', 'tray_icon32.png');
    if (fs.existsSync(prodPath32)) {
      return prodPath32;
    }
  }
  const devPath32 = path.join(process.cwd(), 'public', 'resource', 'tray_icon32.png');
  if (fs.existsSync(devPath32)) {
    return devPath32;
  }
  return null;
}

let notificationIconPath = getNotificationIconPath();

class ReminderService {
  constructor(stickyManager, config) {
    this.stickyManager = stickyManager;
    this.config = config || {};
    this.checkInterval = null;
    this.popupWindows = new Map();
    this.lastCleanupDate = null;
  }

  start() {
    if (this.checkInterval) return;

    this.catchUpMissedReminders();

    const interval = this.config.checkInterval || 30000;
    this.checkInterval = setInterval(() => {
      this.checkReminders();
    }, interval);

    this.checkReminders();

    console.log(`[ReminderService] 提醒调度器已启动 (间隔${interval / 1000}秒)`);
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

      if (!this.lastCleanupDate || now.getTime() - this.lastCleanupDate.getTime() > 24 * 60 * 60 * 1000) {
        this._cleanupOldLogs();
        this.lastCleanupDate = now;
      }

      const rules = getAllEnabledRules();
      const snoozeLogs = getAllPendingSnoozeLogs();

      for (const rule of rules) {
        const baseTime = this.calculateNextReminder(rule);
        if (!baseTime) continue;

        const pendingLogs = getPendingReminderLogs(rule.task_id);

        if (rule.advance_minutes > 0) {
          const advanceTime = new Date(baseTime.getTime() - rule.advance_minutes * 60 * 1000);
          this._tryTrigger(rule, advanceTime, pendingLogs, now);

          if (snoozeLogs.some(log => log.task_id === rule.task_id)) {
            continue;
          }
        }

        this._tryTrigger(rule, baseTime, pendingLogs, now);
      }

      for (const log of snoozeLogs) {
        const scheduledTime = new Date(log.scheduled_time);
        const diffMs = scheduledTime.getTime() - now.getTime();

        if (diffMs <= (this.config.triggerWindowMs || 60000)) {
          if (this.popupWindows.has(log.task_id)) continue;
          this.triggerSnoozeReminder(log);
        }
      }
    } catch (err) {
      console.error('[ReminderService] 检查提醒失败:', err);
    }
  }

  _tryTrigger(rule, targetTime, pendingLogs, now) {
    if (this._hasTriggerForTime(pendingLogs, rule.task_id, targetTime)) return;

    if (rule.start_date) {
      const startDate = this.parseDateLocal(rule.start_date);
      if (targetTime < startDate) return;
    }

    const diffMs = targetTime.getTime() - now.getTime();
    const triggerWindow = this.config.triggerWindowMs || 60000;
    if (diffMs >= 0 && diffMs <= triggerWindow) {
      this.triggerReminder(rule, targetTime);
    }
  }

  _hasTriggerForTime(pendingLogs, taskId, targetTime) {
    const triggerWindow = this.config.triggerWindowMs || 60000;
    const hasPending = pendingLogs.some(log => {
      const logTime = new Date(log.scheduled_time);
      return Math.abs(logTime.getTime() - targetTime.getTime()) < triggerWindow;
    });
    if (hasPending) return true;

    const latestLog = getLatestReminderLog(taskId);
    if (latestLog) {
      const logTime = new Date(latestLog.scheduled_time);
      return Math.abs(logTime.getTime() - targetTime.getTime()) < triggerWindow;
    }
    return false;
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
        const months = config.months || [];

        for (let monthOffset = 0; monthOffset < 24; monthOffset++) {
          const checkDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

          if (months.length > 0) {
            const monthNum = checkDate.getMonth() + 1;
            if (!months.includes(monthNum)) continue;
          }

          for (const day of monthDays.sort((a, b) => a - b)) {
            const lastDayOfMonth = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0).getDate();
            const actualDay = Math.min(day, lastDayOfMonth);
            checkDate.setDate(actualDay);
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

    this.createPopupWindow(rule, scheduledTime, note, task.created_at);
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
    }, new Date(log.scheduled_time), note, task.created_at);
  }

  createPopupWindow(rule, scheduledTime, note, createdAt) {
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
      icon: getStickyIconPath(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload/index.js')
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
        scheduledTime: scheduledTime.toISOString(),
        reminderTime: rule.reminder_time,
        reminderWay: rule.reminder_way,
        repeatType: rule.repeat_type,
        createdAt: createdAt
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
        try {
          // 统一使用 taskService 完成任务：持久化、清理提醒、通知主窗口
          await getTaskService().completeTask(taskId);
          // 同步更新桌面便签（关闭单个便签、更新时间轴）
          syncStickyNoteUpdate(taskId, { status: 'completed', is_completed: 1, is_show_desk: 0 });
        } catch (err) {
          console.error('[ReminderService] 标记完成任务失败:', err);
        }

        this.stopAvatarBlink(taskId);
        this.closePopupWindow(taskId);
        break;
      }

      case 'snooze': {
        const snoozeMinutes = data.minutes || this.config.snoozeMinutes || 3;
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

        const timeStr = `${String(snoozeTime.getHours()).padStart(2, '0')}:${String(snoozeTime.getMinutes()).padStart(2, '0')}`;
        const notification = new Notification({
          title: '任务延迟提醒',
          body: `你的任务已延迟${snoozeMinutes}分钟，将在${timeStr}再次提醒`,
          silent: true
        });
        notification.show();

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

  _getTodayScheduledTime(rule) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [hours, minutes] = (rule.reminder_time || '09:00').split(':').map(Number);

    switch (rule.repeat_type) {
      case 'once': {
        if (!rule.start_date) return null;
        const ruleDate = this.parseDateLocal(rule.start_date);
        const ruleDay = new Date(ruleDate.getFullYear(), ruleDate.getMonth(), ruleDate.getDate());
        if (ruleDay.getTime() !== today.getTime()) return null;
        const scheduled = new Date(today);
        scheduled.setHours(hours, minutes, 0, 0);
        return scheduled;
      }

      case 'daily': {
        const scheduled = new Date(today);
        scheduled.setHours(hours, minutes, 0, 0);
        if (rule.start_date) {
          const startDate = this.parseDateLocal(rule.start_date);
          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          if (today.getTime() < startDay.getTime()) return null;
        }
        if (rule.end_date) {
          const endDate = this.parseDateLocal(rule.end_date);
          const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          if (today.getTime() > endDay.getTime()) return null;
        }
        return scheduled;
      }

      case 'weekly': {
        const config = rule.repeat_config ? JSON.parse(rule.repeat_config) : {};
        const weekdays = config.weekdays || [1];
        const dayOfWeek = today.getDay() || 7;
        if (!weekdays.includes(dayOfWeek)) return null;
        const scheduled = new Date(today);
        scheduled.setHours(hours, minutes, 0, 0);
        if (rule.start_date) {
          const startDate = this.parseDateLocal(rule.start_date);
          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          if (today.getTime() < startDay.getTime()) return null;
        }
        if (rule.end_date) {
          const endDate = this.parseDateLocal(rule.end_date);
          const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          if (today.getTime() > endDay.getTime()) return null;
        }
        return scheduled;
      }

      case 'monthly': {
        const config = rule.repeat_config ? JSON.parse(rule.repeat_config) : {};
        const monthDays = config.monthDays || [1];
        const months = config.months || [];
        const dayOfMonth = today.getDate();
        if (!monthDays.includes(dayOfMonth)) return null;
        if (months.length > 0) {
          const monthNum = today.getMonth() + 1;
          if (!months.includes(monthNum)) return null;
        }
        const scheduled = new Date(today);
        scheduled.setHours(hours, minutes, 0, 0);
        if (rule.start_date) {
          const startDate = this.parseDateLocal(rule.start_date);
          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          if (today.getTime() < startDay.getTime()) return null;
        }
        if (rule.end_date) {
          const endDate = this.parseDateLocal(rule.end_date);
          const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          if (today.getTime() > endDay.getTime()) return null;
        }
        return scheduled;
      }

      case 'custom': {
        const customDates = rule.custom_dates ? JSON.parse(rule.custom_dates) : [];
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        if (!customDates.includes(todayStr)) return null;
        const scheduled = new Date(today);
        scheduled.setHours(hours, minutes, 0, 0);
        return scheduled;
      }

      default:
        return null;
    }
  }

  catchUpMissedReminders() {
    try {
      const now = new Date();
      const rules = getAllEnabledRules();

      for (const rule of rules) {
        const todayScheduled = this._getTodayScheduledTime(rule);
        if (!todayScheduled) continue;
        if (todayScheduled >= now) continue;

        const pendingLogs = getPendingReminderLogs(rule.task_id);
        if (this._hasTriggerForTime(pendingLogs, rule.task_id, todayScheduled)) continue;

        console.log(`[ReminderService] 补发今日未触发的提醒: taskId=${rule.task_id}, time=${todayScheduled.toLocaleString()}`);
        this.triggerReminder(rule, todayScheduled);
      }
    } catch (err) {
      console.error('[ReminderService] 补发今日提醒失败:', err);
    }
  }

  _cleanupOldLogs() {
    try {
      const days = this.config.cleanupDays || 30;
      const result = deleteOldReminderLogs(days);
      if (result.changes > 0) {
        console.log(`[ReminderService] 已清理 ${result.changes} 条超过${days}天的历史提醒日志`);
      }
    } catch (err) {
      console.error('[ReminderService] 清理旧日志失败:', err);
    }
  }

  getNextReminderText(rule) {
    const nextTime = this.calculateNextReminder(rule);
    if (!nextTime) return null;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextMidnight = new Date(nextTime.getFullYear(), nextTime.getMonth(), nextTime.getDate());
    const diffDays = Math.round((nextMidnight.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

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