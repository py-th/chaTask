// src/database/db.js
const Database = require('better-sqlite3');
const { app } = require('electron');
const path = require('path');

const dbPath = path.join(app.getPath('userData'), 'tasks.db');
const db = new Database(dbPath);

// 删除旧表（开发环境） - 生产环境需要迁移，这里简化
// 注意：会丢失数据，仅用于开发
/* db.exec(`DROP TABLE IF EXISTS tasks`);
db.exec(`DROP TABLE IF EXISTS contacts`); */

// 任务表 - 新结构
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,                    -- UUID 唯一标识
    source TEXT DEFAULT 'manual',           -- 来源: wechat/feishu/dingtalk/manual
    sender_avatar TEXT,                     -- 发送者头像 base64
    sender_name TEXT,                       -- 发送者名称
    content TEXT NOT NULL,                  -- 任务内容
    source_time TEXT,                       -- 消息发出时间
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, -- 任务创建时间
    due_date TEXT,                          -- 截止日期
    reminder_time TEXT,                     -- 提醒时间
    priority TEXT DEFAULT 'none',           -- 优先级: high/medium/low/none
    status TEXT DEFAULT 'active',           -- 状态: active/in_progress/completed/archived
    color TEXT,                             -- 便签背景色
    is_pinned INTEGER DEFAULT 0,            -- 是否置顶 (0/1)
    is_show_desk INTEGER DEFAULT 1,         -- 是否显示在桌面 (0/1)
    position_x INTEGER,                     -- 便签位置 X
    position_y INTEGER,                     -- 便签位置 Y
    tags TEXT,                              -- 标签 JSON 数组
    attachments TEXT,                       -- 附件 JSON 数组
    is_completed INTEGER DEFAULT 0,         -- 是否完成 (兼容旧字段) (0/1)
    is_archived INTEGER DEFAULT 0,          -- 是否归档 (0/1)
    is_deleted INTEGER DEFAULT 0            -- 是否删除（回收站）(0/1)
  )
`);

// 列迁移：检查并添加新列（兼容旧数据库）
try {
  const tableInfo = db.prepare("PRAGMA table_info(tasks)").all();
  const columns = tableInfo.map(col => col.name);
  
  // 添加 is_deleted 列
  if (!columns.includes('is_deleted')) {
    console.log('[db] 迁移：添加 is_deleted 列到 tasks 表');
    db.exec(`ALTER TABLE tasks ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    console.log('[db] 迁移完成：is_deleted 列已添加');
  }
  
  // 添加 reminder_enabled 列（提醒开关）
  if (!columns.includes('reminder_enabled')) {
    console.log('[db] 迁移：添加 reminder_enabled 列到 tasks 表');
    db.exec(`ALTER TABLE tasks ADD COLUMN reminder_enabled INTEGER DEFAULT 0`);
    console.log('[db] 迁移完成：reminder_enabled 列已添加');
  }
  
  // 添加 reminder_rule_id 列（关联提醒规则）
  if (!columns.includes('reminder_rule_id')) {
    console.log('[db] 迁移：添加 reminder_rule_id 列到 tasks 表');
    db.exec(`ALTER TABLE tasks ADD COLUMN reminder_rule_id TEXT`);
    console.log('[db] 迁移完成：reminder_rule_id 列已添加');
  }
  
  // 添加 opacity 列（透明度，默认1.0）
  if (!columns.includes('opacity')) {
    console.log('[db] 迁移：添加 opacity 列到 tasks 表');
    db.exec(`ALTER TABLE tasks ADD COLUMN opacity REAL DEFAULT 1.0`);
    console.log('[db] 迁移完成：opacity 列已添加');
  }

  // 添加 style_config 列（样式设置JSON）
  if (!columns.includes('style_config')) {
    console.log('[db] 迁移：添加 style_config 列到 tasks 表');
    db.exec(`ALTER TABLE tasks ADD COLUMN style_config TEXT DEFAULT '{}'`);
    console.log('[db] 迁移完成：style_config 列已添加');
  }
} catch (err) {
  console.error('[db] 列迁移失败:', err.message);
}

// 提醒规则表
db.exec(`
  CREATE TABLE IF NOT EXISTS reminder_rules (
    id TEXT PRIMARY KEY,                    -- UUID 唯一标识
    task_id TEXT NOT NULL,                  -- 关联任务ID
    repeat_type TEXT DEFAULT 'once',        -- 重复类型: once/daily/weekly/monthly/custom
    repeat_config TEXT,                     -- 重复配置 JSON（每周哪几天、每月哪几天等）
    custom_dates TEXT,                      -- 自选日期列表 JSON 数组
    reminder_time TEXT,                     -- 提醒时间 HH:MM
    start_date TEXT,                        -- 开始日期
    end_date TEXT,                          -- 结束日期（NULL表示永不结束）
    advance_minutes INTEGER DEFAULT 0,      -- 提前提醒分钟数
    reminder_way TEXT DEFAULT 'popup',      -- 提醒方式: popup/sound/silent
    is_enabled INTEGER DEFAULT 1,           -- 是否启用 (0/1)
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`);

// 提醒记录表（记录每次提醒触发）
db.exec(`
  CREATE TABLE IF NOT EXISTS reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL,                  -- 关联规则ID
    task_id TEXT NOT NULL,                  -- 关联任务ID
    scheduled_time TEXT,                    -- 计划提醒时间
    triggered_at TEXT,                      -- 实际触发时间
    status TEXT DEFAULT 'pending',          -- 状态: pending/dismissed/snoozed/completed
    snooze_minutes INTEGER,                 -- 延时分钟数
    FOREIGN KEY (rule_id) REFERENCES reminder_rules(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )
`);

// 联系人表
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    avatar_hash TEXT,
    avatar_base64 TEXT,
    source TEXT DEFAULT 'manual',           -- 联系人来源
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
