// src/main/services/reminderService.js
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const {
  getAllEnabledRules,
  createReminderLog,
  updateReminderLog,
  getPendingReminderLogs,
  getLatestReminderLog,
  deleteReminderLogsByTaskId
} = require('../../database/repositories/reminderRepository');
const { updateTask } = require('../../database/repositories/taskRepository');

class ReminderService {
  constructor(stickyManager) {
    this.stickyManager = stickyManager;
    this.checkInterval = null;
    this.popupWindows = new Map(); // taskId -> BrowserWindow
  }

  // 启动提醒调度器
  start() {
    if (this.checkInterval) return;

    // 每分钟检查一次
    this.checkInterval = setInterval(() => {
      this.checkReminders();
    }, 60000);

    // 立即检查一次
    this.checkReminders();

    console.log('[ReminderService] 提醒调度器已启动');
  }

  // 停止提醒调度器
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // 关闭所有弹窗
    for (const win of this.popupWindows.values()) {
      if (!win.isDestroyed()) win.close();
    }
    this.popupWindows.clear();

    console.log('[ReminderService] 提醒调度器已停止');
  }

  // 检查所有提醒
  async checkReminders() {
    try {
      const rules = getAllEnabledRules();
      const now = new Date();

      for (const rule of rules) {
        const nextTime = this.calculateNextReminder(rule);
        if (!nextTime) continue;

        // 检查是否已经有相同时间的 pending 提醒记录
        const pendingLogs = getPendingReminderLogs(rule.task_id);
        const hasPendingForThisTime = pendingLogs.some(log => {
          const logTime = new Date(log.scheduled_time);
          return Math.abs(logTime.getTime() - nextTime.getTime()) < 60000;
        });

        // 如果已经有这个时间的 pending 记录，跳过（防止重复触发）
        if (hasPendingForThisTime) continue;

        // 如果下次提醒时间在1分钟内，触发提醒
        const diffMs = nextTime.getTime() - now.getTime();
        if (diffMs <= 60000) {
          this.triggerReminder(rule, nextTime);
        }
      }
    } catch (err) {
      console.error('[ReminderService] 检查提醒失败:', err);
    }
  }

  // 解析日期字符串为本地时间（避免UTC偏移问题）
  parseDateLocal(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(dateStr);
  }

  // 计算下次提醒时间
  calculateNextReminder(rule) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [hours, minutes] = (rule.reminder_time || '09:00').split(':').map(Number);

    switch (rule.repeat_type) {
      case 'once': {
        // 单次：使用开始日期
        if (!rule.start_date) return null;
        const date = this.parseDateLocal(rule.start_date);
        date.setHours(hours, minutes, 0, 0);
        return date > now ? date : null;
      }

      case 'daily': {
        // 每天：今天或明天的指定时间
        let nextDate = new Date(today);
        nextDate.setHours(hours, minutes, 0, 0);

        if (nextDate <= now) {
          nextDate.setDate(nextDate.getDate() + 1);
        }

        // 检查结束日期
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
        // 每周：根据配置的星期几
        const config = rule.repeat_config ? JSON.parse(rule.repeat_config) : {};
        const weekdays = config.weekdays || [1]; // 默认周一

        // 从今天开始找下一个匹配的星期（最多找14天，跨周）
        for (let i = 0; i < 14; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() + i);
          const dayOfWeek = checkDate.getDay() || 7; // 周日=7

          if (weekdays.includes(dayOfWeek)) {
            checkDate.setHours(hours, minutes, 0, 0);
            if (checkDate > now) {
              // 检查结束日期
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
        // 每月：根据配置的日期
        const config = rule.repeat_config ? JSON.parse(rule.repeat_config) : {};
        const monthDays = config.monthDays || [1]; // 默认每月1号

        // 从本月开始找（最多找24个月）
        for (let monthOffset = 0; monthOffset < 24; monthOffset++) {
          const checkDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

          for (const day of monthDays.sort((a, b) => a - b)) {
            checkDate.setDate(day);
            checkDate.setHours(hours, minutes, 0, 0);

            if (checkDate > now) {
              // 检查结束日期
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
        // 自选日期：从配置的日期列表中找下一个
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

  // 触发提醒
  async triggerReminder(rule, scheduledTime) {
    const taskId = rule.task_id;

    // 创建提醒记录
    createReminderLog({
      ruleId: rule.id,
      taskId: taskId,
      scheduledTime: scheduledTime.toISOString(),
      triggeredAt: new Date().toISOString(),
      status: 'pending'
    });

    // 找到对应的便签窗口
    const note = this.findNoteByTaskId(taskId);

    // 开始头像闪烁
    this.startAvatarBlink(taskId);

    // 创建独立弹窗窗口（屏幕中央）
    this.createPopupWindow(rule, scheduledTime, note);
  }

  // 创建独立提醒弹窗窗口
  createPopupWindow(rule, scheduledTime, note) {
    const taskId = rule.task_id;

    // 如果已有弹窗，先关闭
    if (this.popupWindows.has(taskId)) {
      const existing = this.popupWindows.get(taskId);
      if (!existing.isDestroyed()) existing.close();
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

      // 发送数据到弹窗
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
      this.popupWindows.delete(taskId);
    });

    this.popupWindows.set(taskId, popupWin);
  }

  // 开始头像闪烁
  startAvatarBlink(taskId) {
    const note = this.findNoteByTaskId(taskId);
    if (!note || !note.win || note.win.isDestroyed()) return;

    note.win.webContents.send('start-avatar-blink');
  }

  // 停止头像闪烁
  stopAvatarBlink(taskId) {
    const note = this.findNoteByTaskId(taskId);
    if (!note || !note.win || note.win.isDestroyed()) return;

    note.win.webContents.send('stop-avatar-blink');
  }

  // 处理提醒结果
  async handleReminderAction(taskId, action, data = {}) {
    const pendingLogs = getPendingReminderLogs(taskId);
    if (pendingLogs.length === 0) return;

    const latestLog = pendingLogs[0];

    switch (action) {
      case 'complete': {
        // 标记任务完成
        await updateTask(taskId, {
          status: 'completed',
          is_completed: 1,
          is_show_desk: 0
        });

        // 更新提醒记录
        updateReminderLog(latestLog.id, {
          status: 'completed',
          triggered_at: new Date().toISOString()
        });

        // 停止闪烁
        this.stopAvatarBlink(taskId);

        // 关闭弹窗
        this.closePopupWindow(taskId);

        // 关闭便签
        const note = this.findNoteByTaskId(taskId);
        if (note && note.win && !note.win.isDestroyed()) {
          setTimeout(() => note.win.close(), 500);
        }
        break;
      }

      case 'snooze': {
        // 延时提醒
        const snoozeMinutes = data.minutes || 2;
        const snoozeTime = new Date();
        snoozeTime.setMinutes(snoozeTime.getMinutes() + snoozeMinutes);

        // 更新当前提醒记录为 snoozed
        updateReminderLog(latestLog.id, {
          status: 'snoozed',
          snooze_minutes: snoozeMinutes,
          triggered_at: new Date().toISOString()
        });

        // 创建新的延时提醒记录（pending 状态）
        createReminderLog({
          ruleId: latestLog.rule_id,
          taskId: taskId,
          scheduledTime: snoozeTime.toISOString(),
          triggeredAt: new Date().toISOString(),
          status: 'pending'
        });

        // 关闭弹窗
        this.closePopupWindow(taskId);

        // 停止闪烁（延时后到新时间会再次触发）
        this.stopAvatarBlink(taskId);
        break;
      }

      case 'dismiss': {
        // 忽略提醒
        updateReminderLog(latestLog.id, {
          status: 'dismissed',
          triggered_at: new Date().toISOString()
        });

        // 停止闪烁
        this.stopAvatarBlink(taskId);

        // 关闭弹窗
        this.closePopupWindow(taskId);
        break;
      }

      case 'reconfig': {
        // 重新设置：将所有 pending 记录标记为 dismissed
        for (const log of pendingLogs) {
          updateReminderLog(log.id, {
            status: 'dismissed',
            triggered_at: new Date().toISOString()
          });
        }

        // 停止闪烁
        this.stopAvatarBlink(taskId);

        // 关闭弹窗
        this.closePopupWindow(taskId);

        // 打开设置对话框
        const note = this.findNoteByTaskId(taskId);
        if (note && note.win && !note.win.isDestroyed()) {
          note.win.webContents.send('show-repeat-remind-picker');
        }
        break;
      }
    }
  }

  // 关闭弹窗窗口
  closePopupWindow(taskId) {
    if (this.popupWindows.has(taskId)) {
      const win = this.popupWindows.get(taskId);
      if (!win.isDestroyed()) {
        win.close();
      }
      this.popupWindows.delete(taskId);
    }
  }

  // 根据任务ID查找便签
  findNoteByTaskId(taskId) {
    for (const [noteId, note] of this.stickyManager.notes.entries()) {
      if (note.taskId === taskId) {
        return { ...note, id: noteId };
      }
    }
    return null;
  }

  // 获取下次提醒时间的显示文本
  getNextReminderText(rule) {
    const nextTime = this.calculateNextReminder(rule);
    if (!nextTime) return null;

    const now = new Date();
    const diffDays = Math.floor((nextTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

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
        return `每天 ${timeText}`;
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
