// src/main/ipc/sticky.js
const { ipcMain, BrowserWindow, clipboard } = require('electron');
const { updateTask, getTaskById } = require('../../database/repositories/taskRepository');
const { saveReminderRule, deleteReminderRulesByTaskId, deleteReminderLogsByTaskId, getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');
const { StickyMenu } = require('../menus');
const path = require('path');

function registerStickyHandlers(stickyManager, screenshotUtils, reminderService) {
  const stickyMenu = new StickyMenu(stickyManager, screenshotUtils);

  let currentDraggingNoteId = null;
  let reminderDialogWindows = new Map(); // taskId -> dialogWindow

  ipcMain.on('start-sticky-drag', (event, noteId, startScreenX, startScreenY) => {
    const note = stickyManager.notes.get(noteId);
    if (!note || note.win.isDestroyed()) return;

    // 可能触发展开（内部会同步改变窗口位置）
    stickyManager.startDrag(noteId);

    // 重新获取展开后的窗口位置
    const [winX, winY] = note.win.getPosition();
    if (!global.dragState) global.dragState = {};
    global.dragState[noteId] = { startScreenX, startScreenY, winX, winY };
});

ipcMain.on('sticky-drag-move', (event, noteId, screenX, screenY) => {
    const state = global.dragState?.[noteId];
    if (!state) return;
    const note = stickyManager.notes.get(noteId);
    if (!note || note.win.isDestroyed()) return;

    const newX = screenX - state.startScreenX + state.winX;
    const newY = screenY - state.startScreenY + state.winY;
    note.win.setPosition(newX, newY);
});

ipcMain.on('sticky-drag-end', (event, noteId) => {
    if (global.dragState) delete global.dragState[noteId];
    stickyManager.endDrag(noteId);
});

  ipcMain.handle('create-sticky-note', async (event, { content, avatar, taskId }) => {
    const task = await getTaskById(taskId);
    return stickyManager.createNote(task);
  });

  ipcMain.on('update-note-content', async (event, { id, content, taskId }) => {
    await updateTask(taskId, { content });
    const note = stickyManager.notes.get(id);
    if (note) note.taskId = taskId;
  });

  ipcMain.on('delete-note', (event, id) => stickyManager.deleteNote(id));
  
  ipcMain.on('hide-note', (event, { id, taskId }) => {
    updateTask(taskId, { is_show_desk: 0 });
    stickyManager.deleteNote(id);
  });

  ipcMain.on('toggle-pin', async (event, { id, taskId, pinned }) => {
    const note = stickyManager.notes.get(id);
    if (note) {
      const newPinned = !note.win.isAlwaysOnTop();
      note.win.setAlwaysOnTop(newPinned);
      await updateTask(taskId, { is_pinned: newPinned ? 1 : 0 });
    }
  });

  ipcMain.on('set-priority', async (event, { noteId, taskId }) => {
    const menu = stickyMenu.buildPriorityMenu(noteId, taskId);
    menu.popup();
  });

  ipcMain.on('set-due-date', async (event, { noteId, taskId, date }) => {
    await updateTask(taskId, { due_date: date });
    const note = stickyManager.notes.get(noteId);
    if (note && note.win && !note.win.isDestroyed()) {
      note.win.webContents.send('update-due-date', date);
    }
  });

  ipcMain.on('set-status', async (event, { noteId, taskId }) => {
    const menu = stickyMenu.buildStatusMenu(noteId, taskId);
    menu.popup();
  });

  ipcMain.on('show-note-context-menu', async (event, { noteId, taskId }) => {
    try {
      const task = await getTaskById(taskId);
      if (!task) throw new Error('Task not found');
      const isCurrentlyPinned = task.is_pinned === 1;
      const menu = stickyMenu.buildContextMenu(noteId, taskId, isCurrentlyPinned);
      menu.popup();
    } catch (error) {
      console.error('生成右键菜单失败:', error);
    }
  });

  ipcMain.on('fold-note-request', (event, id) => {
    const note = stickyManager.notes.get(id);
    if (note) stickyManager.foldNote(note.win, id);
  });

  ipcMain.on('unfold-note-request', (event, id) => {
    const note = stickyManager.notes.get(id);
    if (note) stickyManager.unfoldNote(note.win, id);
  });

  ipcMain.on('resize-sticky', (event, { id, height }) => stickyManager.resizeNote(id, height));

  // ========== 提醒功能 IPC ==========
  
  // 打开提醒设置对话框
  ipcMain.on('open-reminder-dialog', async (event, { noteId, taskId }) => {
    // 如果已经有对话框打开，先关闭
    if (reminderDialogWindows.has(taskId)) {
      const existingWin = reminderDialogWindows.get(taskId);
      if (!existingWin.isDestroyed()) {
        existingWin.close();
      }
      reminderDialogWindows.delete(taskId);
    }
    
    // 获取现有规则
    const existingRule = getReminderRuleByTaskId(taskId);
    
    // 创建对话框窗口
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
    
    // 加载对话框HTML
    const dialogPath = path.join(__dirname, '../templates/repeatRemindDialog.html');
    dialogWin.loadFile(dialogPath);
    
    // 保存窗口引用
    reminderDialogWindows.set(taskId, dialogWin);
    
    // 窗口关闭时清理
    dialogWin.on('closed', () => {
      reminderDialogWindows.delete(taskId);
    });
    
    // 等待加载完成后发送现有数据
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
    
    // 保存当前taskId和noteId到窗口，供后续使用
    dialogWin.taskId = taskId;
    dialogWin.noteId = noteId;
  });
  
  // 保存提醒规则
  ipcMain.on('save-reminder-rule', async (event, data) => {
    // 找到对应的dialog窗口
    let targetTaskId = null;
    let targetNoteId = null;
    
    for (const [taskId, win] of reminderDialogWindows.entries()) {
      if (win.webContents === event.sender) {
        targetTaskId = taskId;
        targetNoteId = win.noteId;
        break;
      }
    }
    
    if (!targetTaskId) {
      console.error('找不到对应的任务ID');
      return;
    }
    
    try {
      // 保存规则到数据库
      const ruleId = saveReminderRule({
        taskId: targetTaskId,
        repeatType: data.repeatType,
        repeatConfig: data.repeatConfig,
        customDates: data.customDates,
        reminderTime: data.reminderTime,
        startDate: data.startDate,
        endDate: data.endDate,
        advanceMinutes: data.advanceMinutes,
        reminderWay: data.reminderWay,
        isEnabled: data.reminderEnabled
      });
      
      // 更新任务的提醒开关
      await updateTask(targetTaskId, { 
        reminder_enabled: data.reminderEnabled ? 1 : 0,
        reminder_rule_id: ruleId
      });
      
      // 更新便签上的提醒信息显示
      if (reminderService) {
        const note = stickyManager.notes.get(targetNoteId);
        if (note && note.win && !note.win.isDestroyed()) {
          let nextText = null;
          if (data.reminderEnabled) {
            const rule = getReminderRuleByTaskId(targetTaskId);
            if (rule) {
              nextText = reminderService.getNextReminderText(rule);
            }
          }
          note.win.webContents.send('update-reminder-info', nextText);
        }
      }
      
      // 关闭对话框
      const dialogWin = reminderDialogWindows.get(targetTaskId);
      if (dialogWin && !dialogWin.isDestroyed()) {
        dialogWin.close();
        reminderDialogWindows.delete(targetTaskId);
      }
      
      console.log('[Reminder] 提醒规则已保存:', ruleId);
    } catch (err) {
      console.error('[Reminder] 保存提醒规则失败:', err);
    }
  });
  
  // 删除提醒规则
  ipcMain.on('delete-reminder-rule', async (event) => {
    let targetTaskId = null;
    let targetNoteId = null;
    
    for (const [taskId, win] of reminderDialogWindows.entries()) {
      if (win.webContents === event.sender) {
        targetTaskId = taskId;
        targetNoteId = win.noteId;
        break;
      }
    }
    
    if (!targetTaskId) return;
    
    try {
      deleteReminderRulesByTaskId(targetTaskId);
      deleteReminderLogsByTaskId(targetTaskId);
      
      await updateTask(targetTaskId, { 
        reminder_enabled: 0,
        reminder_rule_id: null
      });
      
      const note = stickyManager.notes.get(targetNoteId);
      if (note && note.win && !note.win.isDestroyed()) {
        note.win.webContents.send('update-reminder-info', null);
      }
      
      console.log('[Reminder] 提醒规则已删除');
    } catch (err) {
      console.error('[Reminder] 删除提醒规则失败:', err);
    }
  });
  
  // 关闭提醒对话框
  ipcMain.on('close-reminder-dialog', (event) => {
    for (const [taskId, win] of reminderDialogWindows.entries()) {
      if (win.webContents === event.sender) {
        if (!win.isDestroyed()) {
          win.close();
        }
        reminderDialogWindows.delete(taskId);
        break;
      }
    }
  });
  
  // 处理提醒动作
  ipcMain.handle('reminder-action', async (event, { taskId, action, noteId, minutes }) => {
    if (reminderService) {
      await reminderService.handleReminderAction(taskId, action, { minutes });
    }

    if (action === 'complete') {
      const note = stickyManager.notes.get(noteId);
      if (note && note.win && !note.win.isDestroyed()) {
        note.win.webContents.send('stop-avatar-blink');
      }
    }

    return { success: true };
  });

  // 最小化提醒弹窗
  ipcMain.on('minimize-reminder-popup', (event) => {
    // 从发送者找到对应的弹窗窗口
    for (const [taskId, win] of reminderService.popupWindows.entries()) {
      if (win.webContents === event.sender) {
        reminderService.minimizePopupWindow(taskId);
        break;
      }
    }
  });

  // 最小化提醒设置对话框
  ipcMain.on('minimize-reminder-dialog', (event) => {
    for (const [taskId, win] of reminderDialogWindows.entries()) {
      if (win.webContents === event.sender) {
        if (!win.isDestroyed()) {
          win.minimize();
        }
        break;
      }
    }
  });

  // 复制便签文本到剪贴板
  ipcMain.on('copy-note-text', (event, text) => {
    clipboard.writeText(text);
    console.log('[Sticky] 文本已复制到剪贴板');
  });

  // 保存样式配置（替换旧的透明度设置）
  ipcMain.on('save-style-config', async (event, { taskId, styleConfig }) => {
    try {
      await updateTask(taskId, {
        style_config: JSON.stringify(styleConfig),
        opacity: styleConfig.opacity
      });
    } catch (err) {
      console.error('[Sticky] 保存样式配置失败:', err);
    }
  });
}

module.exports = { registerStickyHandlers };
