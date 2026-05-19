// src/main/ipc/sticky.js
const { ipcMain } = require('electron');
const { updateTask, getTaskById } = require('../../database/repositories/taskRepository');
const { StickyMenu } = require('../menus');

function registerStickyHandlers(stickyManager) {
  const stickyMenu = new StickyMenu(stickyManager);

  let currentDraggingNoteId = null;

  ipcMain.on('start-sticky-drag', (event, noteId, startX, startY) => {
    currentDraggingNoteId = noteId;
    const note = stickyManager.notes.get(noteId);
    if (!note || note.win.isDestroyed()) return;

    const [winX, winY] = note.win.getPosition();
    if (!global.dragState) global.dragState = new Map();
    global.dragState[noteId] = { startX, startY, winX, winY };
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
    const menu = stickyMenu.buildPriorityMenu(taskId);
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
    const menu = stickyMenu.buildStatusMenu(taskId);
    menu.popup();
  });

  ipcMain.on('show-note-context-menu', async (event, { noteId, taskId }) => {
    try {
      const task = await getTaskById(taskId);
      if (!task) throw new Error('Task not found');
      const isCurrentlyPinned = task.is_pinned === 1;
      const menu = stickyMenu.buildContextMenu(taskId, isCurrentlyPinned);
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
}

module.exports = { registerStickyHandlers };