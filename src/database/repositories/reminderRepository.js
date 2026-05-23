// src/database/repositories/reminderRepository.js
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

// 创建或更新提醒规则
function saveReminderRule(rule) {
  const id = rule.id || uuidv4();
  const now = new Date().toISOString();

  const upsert = db.transaction(() => {
    db.prepare(`UPDATE reminder_rules SET is_enabled = 0 WHERE task_id = ?`).run(rule.taskId);

    db.prepare(`
      INSERT INTO reminder_rules (
        id, task_id, repeat_type, repeat_config, custom_dates,
        reminder_time, start_date, end_date, advance_minutes,
        reminder_way, is_enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        repeat_type = excluded.repeat_type,
        repeat_config = excluded.repeat_config,
        custom_dates = excluded.custom_dates,
        reminder_time = excluded.reminder_time,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        advance_minutes = excluded.advance_minutes,
        reminder_way = excluded.reminder_way,
        is_enabled = excluded.is_enabled,
        updated_at = excluded.updated_at
    `).run(
      id,
      rule.taskId,
      rule.repeatType || 'once',
      rule.repeatConfig ? JSON.stringify(rule.repeatConfig) : null,
      rule.customDates ? JSON.stringify(rule.customDates) : null,
      rule.reminderTime || '09:00',
      rule.startDate || null,
      rule.endDate || null,
      rule.advanceMinutes || 0,
      rule.reminderWay || 'popup',
      rule.isEnabled !== undefined ? (rule.isEnabled ? 1 : 0) : 1,
      now,
      now
    );
  });

  upsert();
  return id;
}

// 获取任务的提醒规则
function getReminderRuleByTaskId(taskId) {
  const stmt = db.prepare(`
    SELECT * FROM reminder_rules 
    WHERE task_id = ? AND is_enabled = 1
    ORDER BY created_at DESC LIMIT 1
  `);
  return stmt.get(taskId);
}

// 获取所有启用的提醒规则
function getAllEnabledRules() {
  const stmt = db.prepare(`
    SELECT r.*, t.content as task_content, t.sender_name, t.sender_avatar
    FROM reminder_rules r
    JOIN tasks t ON r.task_id = t.id
    WHERE r.is_enabled = 1 AND t.is_completed = 0 AND t.is_deleted = 0
  `);
  return stmt.all();
}

// 删除提醒规则
function deleteReminderRule(id) {
  const stmt = db.prepare('DELETE FROM reminder_rules WHERE id = ?');
  return stmt.run(id);
}

// 删除任务的所有提醒规则
function deleteReminderRulesByTaskId(taskId) {
  const stmt = db.prepare('DELETE FROM reminder_rules WHERE task_id = ?');
  return stmt.run(taskId);
}

// 删除任务的所有提醒记录
function deleteReminderLogsByTaskId(taskId) {
  const stmt = db.prepare('DELETE FROM reminder_logs WHERE task_id = ?');
  return stmt.run(taskId);
}

// 删除超过指定天数的历史提醒日志（仅删除非 pending 状态的日志）
function deleteOldReminderLogs(days) {
  const stmt = db.prepare(`
    DELETE FROM reminder_logs 
    WHERE status != 'pending' 
      AND substr(triggered_at, 1, 10) < date('now', '-' || ? || ' days')
  `);
  return stmt.run(days);
}

// 创建提醒记录
function createReminderLog(log) {
  const stmt = db.prepare(`
    INSERT INTO reminder_logs (
      rule_id, task_id, scheduled_time, triggered_at, status, snooze_minutes
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    log.ruleId,
    log.taskId,
    log.scheduledTime,
    log.triggeredAt || new Date().toISOString(),
    log.status || 'pending',
    log.snoozeMinutes || null
  );
}

// 更新提醒记录状态
function updateReminderLog(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  const stmt = db.prepare(`UPDATE reminder_logs SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(values);
}

// 获取任务的待处理提醒记录
function getPendingReminderLogs(taskId) {
  const stmt = db.prepare(`
    SELECT * FROM reminder_logs 
    WHERE task_id = ? AND status = 'pending'
    ORDER BY scheduled_time ASC
  `);
  return stmt.all(taskId);
}

// 获取最近的提醒记录
function getLatestReminderLog(taskId) {
  const stmt = db.prepare(`
    SELECT * FROM reminder_logs 
    WHERE task_id = ?
    ORDER BY triggered_at DESC LIMIT 1
  `);
  return stmt.get(taskId);
}

// 获取所有待处理的延时提醒记录（含关联任务信息）
function getAllPendingSnoozeLogs() {
  const stmt = db.prepare(`
    SELECT l.*, t.content as task_content, t.sender_name, t.sender_avatar,
           t.is_completed, t.is_deleted
    FROM reminder_logs l
    JOIN tasks t ON l.task_id = t.id
    WHERE l.status = 'pending' AND l.snooze_minutes IS NOT NULL
      AND t.is_completed = 0 AND t.is_deleted = 0
    ORDER BY l.scheduled_time ASC
  `);
  return stmt.all();
}

module.exports = {
  saveReminderRule,
  getReminderRuleByTaskId,
  getAllEnabledRules,
  deleteReminderRule,
  deleteReminderRulesByTaskId,
  deleteReminderLogsByTaskId,
  deleteOldReminderLogs,
  createReminderLog,
  updateReminderLog,
  getPendingReminderLogs,
  getLatestReminderLog,
  getAllPendingSnoozeLogs
};
