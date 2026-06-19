// src/database/repositories/taskRepository.js
const db = require('../db');
const { v4: uuidv4 } = require('uuid'); // 需要安装 uuid: npm install uuid

// 插入任务（新结构）
function insertTask(task) {
  const id = task.id || uuidv4();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO tasks (
      id, parent_id, source, sender_avatar, sender_name, content, source_time, created_at, updated_at,
      due_date, reminder_time, priority, status, color, is_pinned, is_show_desk,
      position_x, position_y, sort_order, tags, attachments, is_completed, is_archived, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = task.createdAt ? (task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt) : now;
  return stmt.run(
    id,
    task.parentId || null,  // 父任务ID
    task.source || 'unknow',
    task.senderAvatar || '',
    task.senderName || '',
    task.content,
    task.sourceTime ? (task.sourceTime instanceof Date ? task.sourceTime.toISOString() : task.sourceTime) : null,
    createdAt,
    now,  // updated_at
    task.dueDate || null,
    task.reminderTime || null,
    task.priority || 'none',
    task.status || 'active',
    task.color || null,
    task.isPinned ? 1 : 0,
    task.isShowDesk !== undefined ? (task.isShowDesk ? 1 : 0) : 1,
    task.positionX || null,
    task.positionY || null,
    task.sortOrder || 0,  // 排序序号
    task.tags ? JSON.stringify(task.tags) : null,
    task.attachments ? JSON.stringify(task.attachments) : null,
    task.isCompleted ? 1 : 0,
    task.isArchived ? 1 : 0,
    task.completedAt || null
  );
}
// 获取所有正常任务（未删除、未归档、未完成）
function getAllTasks() {
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE is_archived = 0 AND is_deleted = 0 AND is_completed = 0 
    ORDER BY created_at DESC
  `).all();
  return attachReminderRules(tasks);
}

// 获取已完成任务
function getCompletedTasks() {
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE is_completed = 1 AND is_deleted = 0 
    ORDER BY created_at DESC
  `).all();
  return attachReminderRules(tasks);
}

// 为任务附加提醒规则
function attachReminderRules(tasks) {
  const { getReminderRuleByTaskId } = require('./reminderRepository');
  return tasks.map(task => {
    const rule = getReminderRuleByTaskId(task.id);
    if (rule) {
      return { ...task, reminderRule: rule };
    }
    return task;
  });
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
    // 跳过 updated_at，让数据库自动处理
    if (key === 'updated_at') continue;
    fields.push(`${key} = ?`);
    values.push(value);
  }
  // 自动添加 updated_at
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  const stmt = db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(values);
}
// 获取单个任务
function getTaskById(id) {
  const stmt = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  return stmt.get(id);
}

// 获取某联系人的所有任务（排除已删除），按创建时间升序
function getTasksBySenderName(senderName) {
  const tasks = db.prepare(`
    SELECT * FROM tasks 
    WHERE sender_name = ? AND is_deleted = 0
    ORDER BY created_at ASC
  `).all(senderName);
  return attachReminderRules(tasks);
}

// 彻底删除任务（不可恢复）
function deleteTask(id) {
  const stmt = db.prepare(`DELETE FROM tasks WHERE id = ?`);
  return stmt.run(id);
}

// ========== 时间轴便签持久化 ==========

function getTimelineNotes() {
  const stmt = db.prepare(`SELECT * FROM timeline_notes WHERE is_visible = 1 ORDER BY updated_at DESC`);
  return stmt.all();
}

// 获取某联系人的排序方式
function getTimelineSortOrder(senderName) {
  const stmt = db.prepare(`SELECT sort_order FROM timeline_notes WHERE sender_name = ?`);
  const result = stmt.get(senderName);
  return result ? result.sort_order : 'asc';
}

// 保存时间轴便签
function saveTimelineNote(senderName, senderAvatar, styleConfig, isPinned, positionX, positionY, sortOrder) {
  const now = new Date().toISOString();
  const configStr = typeof styleConfig === 'string' ? styleConfig : JSON.stringify(styleConfig || {});
  const order = sortOrder || 'asc';
  const stmt = db.prepare(`
    INSERT INTO timeline_notes (sender_name, sender_avatar, style_config, is_pinned, is_visible, sort_order, position_x, position_y, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(sender_name) DO UPDATE SET
      sender_avatar = excluded.sender_avatar,
      style_config = excluded.style_config,
      is_pinned = excluded.is_pinned,
      is_visible = 1,
      sort_order = excluded.sort_order,
      position_x = excluded.position_x,
      position_y = excluded.position_y,
      updated_at = excluded.updated_at
  `);
  return stmt.run(senderName, senderAvatar || '', configStr, isPinned ? 1 : 0, order, positionX || null, positionY || null, now, now);
}

function deleteTimelineNote(senderName) {
  const stmt = db.prepare(`DELETE FROM timeline_notes WHERE sender_name = ?`);
  return stmt.run(senderName);
}

function hideTimelineNote(senderName) {
  const stmt = db.prepare(`UPDATE timeline_notes SET is_visible = 0 WHERE sender_name = ?`);
  return stmt.run(senderName);
}

module.exports = { insertTask, getAllTasks, getCompletedTasks, getDeletedTasks, getDeskTasks, updateTask, getTaskById, getTasksBySenderName, deleteTask, getTimelineNotes, getTimelineSortOrder, saveTimelineNote, deleteTimelineNote, hideTimelineNote };