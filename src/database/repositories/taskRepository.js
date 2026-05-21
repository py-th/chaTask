// src/database/repositories/taskRepository.js
const db = require('../db');
const { v4: uuidv4 } = require('uuid'); // 需要安装 uuid: npm install uuid

// 插入任务（新结构）
function insertTask(task) {
  const id = task.id || uuidv4();
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, source, sender_avatar, sender_name, content, source_time, created_at,
      due_date, reminder_time, priority, status, color, is_pinned, is_show_desk,
      position_x, position_y, tags, attachments, is_completed, is_archived
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = task.createdAt ? (task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt) : new Date().toISOString();
  return stmt.run(
    id,
    task.source || 'manual',
    task.senderAvatar || '',
    task.senderName || '',
    task.content,
    task.sourceTime ? (task.sourceTime instanceof Date ? task.sourceTime.toISOString() : task.sourceTime) : null,
    createdAt,
    task.dueDate || null,
    task.reminderTime || null,
    task.priority || 'none',
    task.status || 'active',
    task.color || null,
    task.isPinned ? 1 : 0,
    task.isShowDesk !== undefined ? (task.isShowDesk ? 1 : 0) : 1,
    task.positionX || null,
    task.positionY || null,
    task.tags ? JSON.stringify(task.tags) : null,
    task.attachments ? JSON.stringify(task.attachments) : null,
    task.isCompleted ? 1 : 0,
    task.isArchived ? 1 : 0
  );
}
// 获取所有正常任务（未删除、未归档、未完成）
function getAllTasks() {
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE is_archived = 0 AND is_deleted = 0 AND is_completed = 0 
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

// 获取已完成任务
function getCompletedTasks() {
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE is_completed = 1 AND is_deleted = 0 
    ORDER BY created_at DESC
  `);
  return stmt.all();
}

// 获取回收站任务（已删除）
function getDeletedTasks() {
  const stmt = db.prepare(`
    SELECT * FROM tasks WHERE is_deleted = 1 ORDER BY created_at DESC
  `);
  return stmt.all();
}

// 获取需要显示在桌面的任务
function getDeskTasks() {
  const stmt = db.prepare(`
    SELECT * FROM tasks 
    WHERE is_show_desk = 1 AND is_deleted = 0 AND is_completed = 0
    ORDER BY created_at DESC
  `);
  return stmt.all();
}
// 更新任务
function updateTask(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  const stmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(values);
}
// 获取单个任务
function getTaskById(id) {
  const stmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  return stmt.get(id);
}

module.exports = { insertTask, getAllTasks, getCompletedTasks, getDeletedTasks, getDeskTasks, updateTask, getTaskById };