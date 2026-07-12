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
    parent_id TEXT,                         -- 父任务ID（支持子任务）
    source TEXT DEFAULT 'unknow',           -- 来源: wechat/feishu/dingtalk/unknow
    sender_avatar TEXT,                     -- 发送者头像 base64
    sender_name TEXT,                       -- 发送者名称
    content TEXT NOT NULL,                  -- 任务内容
    source_time TEXT,                       -- 消息发出时间
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, -- 任务创建时间
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP, -- 最后更新时间
    due_date TEXT,                          -- 截止日期
    reminder_time TEXT,                     -- 提醒时间
    priority TEXT DEFAULT 'none',           -- 优先级: high/medium/low/none
    status TEXT DEFAULT 'active',           -- 状态: active/in_progress/completed/archived
    color TEXT,                             -- 便签背景色
    is_pinned INTEGER DEFAULT 0,            -- 是否置顶 (0/1)
    is_show_desk INTEGER DEFAULT 1,         -- 是否显示在桌面 (0/1)
    position_x INTEGER,                     -- 便签位置 X
    position_y INTEGER,                     -- 便签位置 Y
    sort_order INTEGER DEFAULT 0,           -- 排序序号（用于自定义排序）
    tags TEXT,                              -- 标签 JSON 数组
    attachments TEXT,                       -- 附件 JSON 数组
    is_completed INTEGER DEFAULT 0,         -- 是否完成 (兼容旧字段) (0/1)
    is_archived INTEGER DEFAULT 0,          -- 是否归档 (0/1)
    is_deleted INTEGER DEFAULT 0,            -- 是否删除（回收站）(0/1)
    reminder_enabled INTEGER DEFAULT 0,     -- 提醒开关 (0/1)
    reminder_rule_id TEXT,                  -- 关联提醒规则ID
    opacity REAL DEFAULT 1.0,               -- 透明度
    style_config TEXT DEFAULT '{}',         -- 样式设置JSON
    completed_at TEXT                       -- 任务完成时间
  )
`);

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
    source TEXT DEFAULT 'unknow',           -- 联系人来源
    remark TEXT,                            -- 备注
    task_count INTEGER DEFAULT 0,           -- 关联任务数量
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// 时间轴便签表
db.exec(`
  CREATE TABLE IF NOT EXISTS timeline_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_name TEXT NOT NULL UNIQUE,       -- 联系人名称
    sender_avatar TEXT,                     -- 联系人头像
    style_config TEXT DEFAULT '{}',         -- 样式配置 JSON
    is_pinned INTEGER DEFAULT 0,            -- 是否置顶
    is_visible INTEGER DEFAULT 1,           -- 是否显示（1=显示, 0=隐藏）
    sort_order TEXT DEFAULT 'asc',         -- 排序方式 ('asc'=升序, 'desc'=降序)
    position_x INTEGER,                     -- 窗口位置 X
    position_y INTEGER,                     -- 窗口位置 Y
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

module.exports = db;
