// src/main/ipc/sticky.js
const { ipcMain, Menu } = require('electron');
const { updateTask, getTaskById } = require('../../database/repositories/taskRepository');

function registerStickyHandlers(stickyManager) {

  // 窗口拖动
let currentDraggingNoteId = null;

ipcMain.on('start-sticky-drag', (event, noteId, startX, startY) => {
    currentDraggingNoteId = noteId;
    
    const note = stickyManager.notes.get(noteId);
    if (!note || note.win.isDestroyed()) return;

    // 获取当前窗口位置
    const [winX, winY] = note.win.getPosition();
    if (!global.dragState) this.dragState = new Map();
    global.dragState[noteId] = {
        startX, // 鼠标按下时在窗口内的 X
        startY, // 鼠标按下时在窗口内的 Y
        winX,   // 鼠标按下时窗口的 X
        winY    // 鼠标按下时窗口的 Y
    };
});

ipcMain.on('sticky-drag-move', (event, noteId, screenX, screenY) => {
    if (!global.dragState || !global.dragState[noteId]) return;

    const state = global.dragState[noteId];
    const note = stickyManager.notes.get(noteId);
    if (!note || note.win.isDestroyed()) return;
    const newX = screenX - state.startX;
    const newY = screenY - state.startY;
    note.win.setPosition(newX, newY);
});

ipcMain.on('sticky-drag-end', (event, noteId) => {
    if (global.dragState) {
        delete global.dragState[noteId];
    }
    currentDraggingNoteId = null;
});

  // 创建便签
  ipcMain.handle('create-sticky-note', async (event, { content, avatar, taskId }) => {
    // 获取完整任务信息
    const task = await getTaskById(taskId);
    return stickyManager.createNote(task);
  });

  ipcMain.on('update-note-content', async (event, { id, content, taskId }) => {
    await updateTask(taskId, { content });
    const note = stickyManager.notes.get(id);
    if (note) note.taskId = taskId;
  });

  //删除隐藏任务
  ipcMain.on('delete-note', (event, id) => stickyManager.deleteNote(id));
  ipcMain.on('hide-note', (event, { id, taskId }) => {
    // 隐藏便签：关闭窗口，并更新数据库 is_show_desk = 0
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
  // 设置优先级
  ipcMain.on('set-priority', async (event, { noteId, taskId }) => {
    // 弹出菜单让用户选择优先级
    const menu = Menu.buildFromTemplate([
      { label: '高', click: async () => {
        await updateTask(taskId, { priority: 'high' });
        // 刷新便签窗口样式（通过发送事件）
        const note = stickyManager.notes.get(noteId);
        if (note) note.win.webContents.send('update-priority', 'high');
      } },
      { label: '中', click: async () => {
        await updateTask(taskId, { priority: 'medium' });
        const note = stickyManager.notes.get(noteId);
        if (note) note.win.webContents.send('update-priority', 'medium');
      } },
      { label: '低', click: async () => {
        await updateTask(taskId, { priority: 'low' });
        const note = stickyManager.notes.get(noteId);
        if (note) note.win.webContents.send('update-priority', 'low');
      } }
    ]);
    menu.popup();
  });

  // 简化的截止日期处理器（仅更新数据库和通知前端）-工具栏
  ipcMain.on('set-due-date', async (event, { noteId, taskId, date }) => {
    await updateTask(taskId, { due_date: date });
    const note = stickyManager.notes.get(noteId);
    if (note && note.win && !note.win.isDestroyed()) {
      note.win.webContents.send('update-due-date', date);
    }
  });
// 便签窗口状态菜单-工具栏
  ipcMain.on('set-status', async (event, { noteId, taskId }) => {
    const menu = Menu.buildFromTemplate([
      { label: `完成1`, click: async () => {
        await updateTask(taskId, { status: 'completed', is_show_desk: 0 });
        stickyManager.deleteNote(noteId); // 完成则隐藏便签
      } },
      { label: '待办2', click: async () => {
        await updateTask(taskId, { status: 'pending', is_show_desk: 1 });
        const note = stickyManager.notes.get(noteId);
        if (note) note.win.webContents.send('update-status', 'pending');
      } },
      { label: '进行中3', click: async () => {
        await updateTask(taskId, { status: 'in_progress', is_show_desk: 1 });
        const note = stickyManager.notes.get(noteId);
        if (note) note.win.webContents.send('update-status', 'in_progress');
      } },
      { label: '逾期4', click: async () => {
        await updateTask(taskId, { status: 'overdue', is_show_desk: 1 });
        const note = stickyManager.notes.get(noteId);
        if (note) note.win.webContents.send('update-status', 'overdue');
      } }
    ]);
    menu.popup();
  });
  
  //整个便签窗口的鼠标右键菜单
  ipcMain.on('show-note-context-menu', async (event, { noteId, taskId }) => {
    try {
    const task = await getTaskById(taskId);
    if (!task) throw new Error('Task not found');
    const isCurrentlyPinned = task.is_pinned === 1; 
    const pinLabel = isCurrentlyPinned ? '取消置顶' : '置顶';

    const menu = Menu.buildFromTemplate([
      {
        label: pinLabel,//动态切换
        click: async () => {
          const newPinnedState = !isCurrentlyPinned; 
          const note = stickyManager.notes.get(noteId);
          if (note && !note.win.isDestroyed()) {
            note.win.setAlwaysOnTop(newPinnedState);
          }
          // 更新数据库 (is_pinned 存 1 或 0)
          await updateTask(taskId, { is_pinned: newPinnedState ? 1 : 0 });
        }
      },
      {
        label: '2.隐藏 🙈',
        click: () => {
          // 仅关闭便签窗口，不删除任务，不更新数据库
          const note = stickyManager.notes.get(noteId);
          if (note && !note.win.isDestroyed()) note.win.close();
          // 注意：此时不会从 stickyManager.notes 中移除，但窗口关闭后会自动触发 closed 事件清理
        }
      },
      {
        label: '3.优先级',
        submenu: [
          {
            label: '高',
            click: async () => {
              await updateTask(taskId, { priority: 'high' });
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.webContents.send('update-priority', 'high');
            }
          },
          {
            label: '中',
            click: async () => {
              await updateTask(taskId, { priority: 'medium' });
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.webContents.send('update-priority', 'medium');
            }
          },
          {
            label: '低',
            click: async () => {
              await updateTask(taskId, { priority: 'low' });
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.webContents.send('update-priority', 'low');
            }
          }
        ]
      },
      {
        label: '4.状态',
        submenu: [
          {
            label: '完成',
            click: async () => {
              await updateTask(taskId, { status: 'completed', is_show_desk: 0 });
              // 完成时关闭便签窗口
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.close();
            }
          },
          {
            label: '进行中',
            click: async () => {
              await updateTask(taskId, { status: 'in_progress', is_show_desk: 1 });
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.webContents.send('update-status', 'in_progress');
            }
          },
          {
            label: '待办',
            click: async () => {
              await updateTask(taskId, { status: 'pending', is_show_desk: 1 });
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.webContents.send('update-status', 'pending');
            }
          },
          {
            label: '逾期',
            click: async () => {
              await updateTask(taskId, { status: 'overdue', is_show_desk: 1 });
              const note = stickyManager.notes.get(noteId);
              if (note) note.win.webContents.send('update-status', 'overdue');
            }
          }
        ]
      },
      {
        label: `5.重复&提醒`,
        click: () => {
          // 发送消息给便签窗口，让它显示重复提醒设置表单
          const note = stickyManager.notes.get(noteId);
          if (note && note.win && !note.win.isDestroyed()) {
            note.win.webContents.send('show-repeat-remind-picker');
          }
        }
      },
      {
        label: '6.加入时间轴',
        click: () => {
          // 后续可扩展
          console.log('字体格式设置', taskId);
        }
      },
      {
        label: '7.样式',
        submenu: [
          {
            label: '字体',
            click: async () => {
              // 后续可扩展
              console.log('字体格式设置', taskId);
            }
          },
          {
            label: '便签背景色',
            click: async () => {
               // 后续可扩展
               console.log('字体格式设置', taskId);
            }
          },
          {
            label: '便签透明度',
            click: async () => {
               // 后续可扩展
               console.log('字体格式设置', taskId);
            }
          },
          {
            label: '文字加粗',
            click: async () => {
              // 后续可扩展
              console.log('字体格式设置', taskId);
            }
          },
          {
            label: '文字颜色',
            click: async () => {
              // 后续可扩展
              console.log('字体格式设置', taskId);
            }
          }          
        ]
      },
      {
        label: '8.皮肤模板',
        submenu: [
          {
            label: '经典',
            click: async () => {
              // 后续可扩展
              console.log('字体格式设置', taskId);
            }
          },
          {
            label: '简约',
            click: async () => {
               // 后续可扩展
               console.log('字体格式设置', taskId);
            }
          },
          {
            label: '可爱',
            click: async () => {
              // 后续可扩展
              console.log('字体格式设置', taskId);
            }
          }
        ]
      },
    ]);
    menu.popup();
  } catch (error) {
    console.error('生成右键菜单失败:', error);
    // 如果出错，给一个最简单的菜单防止崩溃
    const fallbackMenu = Menu.buildFromTemplate([{ label: '加载失败', enabled: false }]);
    fallbackMenu.popup();
  }
  });

//拖拽实现
  ipcMain.on('fold-note-request', (event, id) => {
    const note = stickyManager.notes.get(id);
    if (note) stickyManager.foldNote(note.win, id);
  });
  ipcMain.on('unfold-note-request', (event, id) => {
    const note = stickyManager.notes.get(id);
    if (note) stickyManager.unfoldNote(note.win, id);
  });
  ipcMain.on('resize-sticky', (event, { id, height }) => stickyManager.resizeNote(id, height));
  
}

module.exports = { registerStickyHandlers };