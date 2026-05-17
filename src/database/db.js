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
    priority TEXT DEFAULT 'medium',         -- 优先级: high/medium/low
    status TEXT DEFAULT 'active',           -- 状态: active/in_progress/completed/archived
    color TEXT,                             -- 便签背景色
    is_pinned INTEGER DEFAULT 0,            -- 是否置顶 (0/1)
    is_show_desk INTEGER DEFAULT 1,         -- 是否显示在桌面 (0/1)
    position_x INTEGER,                     -- 便签位置 X
    position_y INTEGER,                     -- 便签位置 Y
    tags TEXT,                              -- 标签 JSON 数组
    attachments TEXT,                       -- 附件 JSON 数组
    is_completed INTEGER DEFAULT 0,         -- 是否完成 (兼容旧字段) (0/1)
    is_archived INTEGER DEFAULT 0           -- 是否归档 (0/1)
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