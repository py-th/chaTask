// src/main/ipc/sticky.js
const { ipcMain, BrowserWindow, clipboard } = require('electron');
const { updateTask, getTaskById, getTasksBySenderName, saveTimelineNote, deleteTimelineNote } = require('../../database/repositories/taskRepository');
const { saveReminderRule, deleteReminderRulesByTaskId, deleteReminderLogsByTaskId, getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');
const { StickyMenu } = require('../menus');
const { showConfirmDialog } = require('../windows/confirmDialog');
const path = require('path');

function registerStickyHandlers(mainWindow, stickyManager, screenshotUtils, reminderService) {
  const stickyMenu = new StickyMenu(mainWindow, stickyManager, screenshotUtils);
  
  // 通知主窗口刷新任务列表
  function notifyMainWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('refresh-task-list');
    }
  }

  function sendToastToMainWindow(type, message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-toast', { type, message });
    }
  }

  function refreshTimelineForSender(taskId, stickyManager, reminderService) {
    try {
      const task = getTaskById(taskId);
      if (!task || !task.sender_name) return;
      // 遍历所有便签，找到属于该联系人的时间轴便签并刷新
      for (const [id, note] of stickyManager.notes.entries()) {
        if (note.isTimeline && note.senderName === task.sender_name && note.win && !note.win.isDestroyed()) {
          const tasks = getTasksBySenderName(note.senderName);
          const html = stickyManager.generateTimelineHTML(tasks, note.senderName, note.senderAvatar, id);
          note.win.loadURL(`data:text/html,${encodeURIComponent(html)}`);
          break;
        }
      }
    } catch (err) {
      console.error('[Timeline] 刷新时间轴提醒信息失败:', err);
    }
  }

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
    const result = stickyManager.createNote(task);
    notifyMainWindow();
    return result;
  });

  ipcMain.on('update-note-content', async (event, { id, content, taskId }) => {
    await updateTask(taskId, { content });
    notifyMainWindow();
    const note = stickyManager.notes.get(id);
    if (note) note.taskId = taskId;
  });

  ipcMain.on('delete-note', (event, id) => stickyManager.deleteNote(id));
  
  ipcMain.on('hide-note', (event, { id, taskId }) => {
    updateTask(taskId, { is_show_desk: 0 });
    notifyMainWindow();
    // 先尝试用 id 查找，如果找不到则用 taskId 查找
    let noteId = id;
    if (!stickyManager.notes.has(id)) {
      // 根据 taskId 查找对应的便签
      for (const [key, note] of stickyManager.notes.entries()) {
        if (note.taskId === taskId) {
          noteId = key;
          break;
        }
      }
    }
    stickyManager.deleteNote(noteId);
  });

  ipcMain.on('toggle-pin', async (event, { id, taskId, pinned }) => {
    const note = stickyManager.notes.get(id);
    if (note) {
      const newPinned = !note.win.isAlwaysOnTop();
      note.win.setAlwaysOnTop(newPinned);
      await updateTask(taskId, { is_pinned: newPinned ? 1 : 0 });
      notifyMainWindow();
    }
  });

  ipcMain.on('set-priority', async (event, { noteId, taskId }) => {
    const menu = stickyMenu.buildPriorityMenu(noteId, taskId);
    menu.popup();
  });

  ipcMain.on('set-due-date', async (event, { noteId, taskId, date }) => {
    await updateTask(taskId, { due_date: date });
    notifyMainWindow();
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
      const menu = await stickyMenu.buildContextMenu(noteId, taskId, isCurrentlyPinned);
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

    // 如果没有传递 noteId，通过 taskId 查找对应的便签
    if (!noteId) {
      for (const [id, note] of stickyManager.notes.entries()) {
        if (note.taskId === taskId) {
          noteId = id;
          break;
        }
      }
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
      notifyMainWindow();
      sendToastToMainWindow('success', '提醒规则已保存');

      // 输出提醒规则日志
      console.log('========== 提醒规则已保存 ==========');
      console.log(`任务ID: ${targetTaskId}`);
      console.log(`重复类型: ${data.repeatType}`);
      console.log(`提醒时间: ${data.reminderTime}`);
      console.log(`提前提醒: ${data.advanceMinutes}分钟`);
      console.log(`提醒方式: ${data.reminderWay}`);
      console.log(`提醒开关: ${data.reminderEnabled ? '开启' : '关闭'}`);
      if (data.startDate) console.log(`开始日期: ${data.startDate}`);
      if (data.endDate) console.log(`结束日期: ${data.endDate}`);
      if (data.repeatConfig) console.log(`重复配置: ${JSON.stringify(data.repeatConfig)}`);
      if (data.customDates && data.customDates.length > 0) console.log(`自选日期: ${JSON.stringify(data.customDates)}`);
      const savedRule = getReminderRuleByTaskId(targetTaskId);
      if (savedRule) {
        console.log(`数据库记录: repeat_type=${savedRule.repeat_type}, repeat_config=${savedRule.repeat_config}, start_date=${savedRule.start_date}, end_date=${savedRule.end_date}, custom_dates=${savedRule.custom_dates}`);
      }
      if (data.reminderEnabled && reminderService) {
        const nextText = reminderService.getNextReminderText(savedRule);
        console.log(`便签显示文本: ${nextText}`);
      }
      console.log('====================================');

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
          if (note.isTimeline) {
            // 时间轴便签：局部更新，避免整页刷新闪烁
            note.win.webContents.send('timeline-update-reminder', { taskId: targetTaskId, reminderText: nextText });
          } else {
            // 单个便签
            note.win.webContents.send('update-reminder-info', nextText);
          }
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
      sendToastToMainWindow('error', '保存提醒规则失败');
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
      notifyMainWindow();
      sendToastToMainWindow('success', '提醒规则已删除');

      const note = stickyManager.notes.get(targetNoteId);
      if (note && note.win && !note.win.isDestroyed()) {
        if (note.isTimeline) {
          // 时间轴便签：局部更新，避免整页刷新闪烁
          note.win.webContents.send('timeline-update-reminder', { taskId: targetTaskId, reminderText: null });
        } else {
          // 单个便签
          note.win.webContents.send('update-reminder-info', null);
        }
      }

      console.log('[Reminder] 提醒规则已删除');
    } catch (err) {
      console.error('[Reminder] 删除提醒规则失败:', err);
      sendToastToMainWindow('error', '删除提醒规则失败');
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
      // 通知主窗口刷新任务列表
      notifyMainWindow();
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
      const updateData = {
        style_config: JSON.stringify(styleConfig),
        opacity: styleConfig.opacity
      };
      
      // 如果用户设置了背景颜色，保存到 task.color 字段
      if (styleConfig.bgColor && styleConfig.bgColor.trim()) {
        updateData.color = styleConfig.bgColor;
        console.log('[Sticky] 保存背景颜色到 task.color:', styleConfig.bgColor);
      }
      
      await updateTask(taskId, updateData);
      console.log('[Sticky] 样式配置已保存:', styleConfig);
    } catch (err) {
      console.error('[Sticky] 保存样式配置失败:', err);
    }
  });

  // ========== 时间轴便签 IPC ==========

  // 打开时间轴便签
  ipcMain.on('open-timeline-note', async (event, { noteId, taskId }) => {
    try {
      const task = await getTaskById(taskId);
      if (!task) {
        sendToastToMainWindow('error', '找不到任务信息');
        return;
      }
      const senderName = task.sender_name;
      if (!senderName) {
        sendToastToMainWindow('error', '该任务没有关联联系人');
        return;
      }
      const tasks = getTasksBySenderName(senderName);
      if (tasks.length === 0) {
        sendToastToMainWindow('info', '该联系人暂无其他任务');
        return;
      }
      const noteId = stickyManager.createTimelineNote(tasks, senderName, task.sender_avatar);
      console.log(`[Timeline] 时间轴便签已创建: noteId=${noteId}, sender=${senderName}, tasks=${tasks.length}`);
    } catch (err) {
      console.error('[Timeline] 创建时间轴便签失败:', err);
      sendToastToMainWindow('error', '创建时间轴便签失败');
    }
  });

  // 时间轴中更新任务文本
  ipcMain.on('timeline-update-task-text', async (event, { noteId, taskId, content }) => {
    try {
      await updateTask(taskId, { content });
      notifyMainWindow();
      // 通知时间轴窗口更新显示
      const note = stickyManager.notes.get(noteId);
      if (note && note.win && !note.win.isDestroyed()) {
        note.win.webContents.send('timeline-update-task-display', { taskId, content });
      }
    } catch (err) {
      console.error('[Timeline] 更新任务文本失败:', err);
    }
  });

  // 时间轴中设置截止日期
  ipcMain.on('timeline-set-due-date', async (event, { noteId, taskId, dueDate }) => {
    try {
      await updateTask(taskId, { due_date: dueDate || null });
      notifyMainWindow();
      console.log(`[Timeline] 截止日期已更新: taskId=${taskId}, dueDate=${dueDate || '无'}`);
    } catch (err) {
      console.error('[Timeline] 设置截止日期失败:', err);
    }
  });

  // 时间轴右键菜单
  ipcMain.on('timeline-context-menu', async (event, { noteId, taskId, senderName }) => {
    const { Menu } = require('electron');
    const template = [];

    const note = stickyManager.notes.get(noteId);
    const isPinned = note && note.win && !note.win.isDestroyed() ? note.win.isAlwaysOnTop() : false;

    if (taskId) {
      // 点击了某条任务
      template.push({
        label: '重复提醒',
        click: () => {
          openReminderDialog(noteId, taskId);
        }
      });
      template.push({
        label: '删除此任务',
        click: async () => {
          const confirmed = await showConfirmDialog(
            stickyManager.notes.get(noteId)?.win,
            {
              title: '确认删除',
              message: '确定要删除这个任务吗？',
              detail: '删除后任务将移动到回收站，您可以在回收站中恢复。',
              type: 'warning',
              confirmText: '删除',
              cancelText: '取消'
            }
          );
          if (confirmed) {
            deleteReminderRulesByTaskId(taskId);
            deleteReminderLogsByTaskId(taskId);
            await updateTask(taskId, { is_deleted: 1, is_show_desk: 0 });
            notifyMainWindow();
            const note = stickyManager.notes.get(noteId);
            if (note && note.win && !note.win.isDestroyed()) {
              note.win.webContents.send('timeline-remove-task', taskId);
            }
          }
        }
      });
      template.push({ type: 'separator' });
    }

    // 置顶
    template.push({
      label: isPinned ? '取消置顶' : '置顶',
      click: () => {
        const n = stickyManager.notes.get(noteId);
        if (n && n.win && !n.win.isDestroyed()) {
          const newPinned = !isPinned;
          n.win.setAlwaysOnTop(newPinned);
          // 同步到数据库
          try {
            const [x, y] = n.win.getPosition();
            saveTimelineNote(n.senderName, n.senderAvatar, n.styleConfig, newPinned, x, y);
          } catch (err) {
            console.error('[Timeline] 保存置顶状态到数据库失败:', err);
          }
        }
      }
    });

    template.push({ type: 'separator' });

    // 透明度
    template.push({
      label: '透明度',
      submenu: [100, 90, 80, 70, 60, 50].map(percent => ({
        label: `${percent}%`,
        click: () => {
          const n = stickyManager.notes.get(noteId);
          if (n && n.win && !n.win.isDestroyed()) {
            n.win.webContents.send('timeline-update-opacity', percent / 100);
          }
        }
      }))
    });

    // 背景颜色
    const bgColors = [
      { label: '白色', color: 'rgba(255, 255, 255, 0.92)' },
      { label: '米黄', color: 'rgba(255, 251, 235, 0.92)' },
      { label: '浅蓝', color: 'rgba(235, 245, 255, 0.92)' },
      { label: '浅绿', color: 'rgba(235, 255, 240, 0.92)' },
      { label: '浅粉', color: 'rgba(255, 240, 245, 0.92)' },
      { label: '浅紫', color: 'rgba(248, 240, 255, 0.92)' },
      { label: '浅灰', color: 'rgba(248, 248, 248, 0.92)' }
    ];

    template.push({
      label: '背景颜色',
      submenu: bgColors.map(item => ({
        label: item.label,
        click: () => {
          const n = stickyManager.notes.get(noteId);
          if (n && n.win && !n.win.isDestroyed()) {
            n.win.webContents.send('timeline-update-bgcolor', item.color);
          }
        }
      }))
    });

    template.push({ type: 'separator' });

    // 排序
    template.push({
      label: '排序',
      submenu: [
        {
          label: '日期降序',
          click: () => {
            const n = stickyManager.notes.get(noteId);
            if (n && n.win && !n.win.isDestroyed()) {
              n.win.webContents.send('timeline-sort-tasks', 'desc');
              // 保存排序方式到数据库
              n.sortOrder = 'desc';
              try {
                const [x, y] = n.win.getPosition();
                saveTimelineNote(n.senderName, n.senderAvatar, n.styleConfig,
                  n.win.isAlwaysOnTop(), x, y, 'desc');
              } catch (err) {
                console.error('[Timeline] 保存排序方式失败:', err);
              }
            }
          }
        },
        {
          label: '日期升序',
          click: () => {
            const n = stickyManager.notes.get(noteId);
            if (n && n.win && !n.win.isDestroyed()) {
              n.win.webContents.send('timeline-sort-tasks', 'asc');
              // 保存排序方式到数据库
              n.sortOrder = 'asc';
              try {
                const [x, y] = n.win.getPosition();
                saveTimelineNote(n.senderName, n.senderAvatar, n.styleConfig,
                  n.win.isAlwaysOnTop(), x, y, 'asc');
              } catch (err) {
                console.error('[Timeline] 保存排序方式失败:', err);
              }
            }
          }
        }
      ]
    });

    template.push({ type: 'separator' });

    template.push({
      label: '刷新时间轴',
      click: async () => {
        const n = stickyManager.notes.get(noteId);
        if (n && n.win && !n.win.isDestroyed()) {
          const tasks = getTasksBySenderName(n.senderName);
          const html = stickyManager.generateTimelineHTML(tasks, n.senderName, n.senderAvatar, noteId);
          n.win.loadURL(`data:text/html,${encodeURIComponent(html)}`);
        }
      }
    });

    // 便签管理器
    template.push({
      label: '便签管理器',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });

    template.push({
      label: '关闭时间轴',
      click: () => {
        stickyManager.deleteNote(noteId);
      }
    });

    const menu = Menu.buildFromTemplate(template);
    menu.popup();
  });

  // 保存时间轴便签样式
  ipcMain.on('save-timeline-style', (event, { noteId, styleConfig }) => {
    const note = stickyManager.notes.get(noteId);
    if (note) {
      note.styleConfig = Object.assign({}, note.styleConfig, styleConfig);
      console.log('[Timeline] 样式已保存:', noteId, note.styleConfig);
      // 同步到数据库
      try {
        const win = note.win;
        const [x, y] = win.getPosition();
        saveTimelineNote(note.senderName, note.senderAvatar, note.styleConfig, win.isAlwaysOnTop(), x, y);
      } catch (err) {
        console.error('[Timeline] 保存样式到数据库失败:', err);
      }
    }
  });

  function openReminderDialog(noteId, taskId) {
    if (reminderDialogWindows.has(taskId)) {
      const existingWin = reminderDialogWindows.get(taskId);
      if (!existingWin.isDestroyed()) {
        existingWin.close();
      }
      reminderDialogWindows.delete(taskId);
    }

    const existingRule = getReminderRuleByTaskId(taskId);

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

    const dialogPath = path.join(__dirname, '../templates/repeatRemindDialog.html');
    dialogWin.loadFile(dialogPath);

    reminderDialogWindows.set(taskId, dialogWin);

    dialogWin.on('closed', () => {
      reminderDialogWindows.delete(taskId);
    });

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

    dialogWin.taskId = taskId;
    dialogWin.noteId = noteId;
  }

  // 时间轴中打开提醒设置
  ipcMain.on('timeline-open-reminder', async (event, { noteId, taskId }) => {
    openReminderDialog(noteId, taskId);
  });
}

module.exports = { registerStickyHandlers };
