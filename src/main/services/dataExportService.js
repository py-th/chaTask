// src/main/services/dataExportService.js
// 本地数据导出/导入服务：为将来订阅版云端迁移预留标准化 JSON 格式。
const { dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const db = require('../../database/db');
const { loadUserSettings, saveUserSettings } = require('../configManager');

const EXPORT_VERSION = '1.0';
const EXPORT_SCHEMA_VERSION = 1;

// 导出/导入的表顺序（导入时按此顺序插入，删除时按相反顺序）
const DATA_TABLES = [
  'tasks',
  'contacts',
  'timeline_notes',
  'reminder_rules',
  'reminder_logs'
];

function quoteIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`;
}

function getTableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map(c => c.name);
}

/**
 * 读取所有本地数据，返回标准格式的 JSON 对象。
 * 结构稳定，未来云端迁移时可直接上传该对象。
 */
function buildExportPayload() {
  const settings = loadUserSettings();
  const tables = {};

  for (const table of DATA_TABLES) {
    const columns = getTableColumns(table);
    const colList = columns.map(quoteIdentifier).join(', ');
    tables[table] = db.prepare(`SELECT ${colList} FROM ${quoteIdentifier(table)}`).all();
  }

  return {
    version: EXPORT_VERSION,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    settings,
    tables
  };
}

function sanitizeImportedSettings(settings) {
  if (!settings || typeof settings !== 'object') return {};
  const copy = JSON.parse(JSON.stringify(settings));
  // 清理已移除的云端同步与云端 OCR 配置
  delete copy.cloudSync;
  if (copy.ocr) {
    delete copy.ocr.baidu;
    delete copy.ocr.aliyun;
    delete copy.ocr.tencent;
    delete copy.ocr.timeout;
    copy.ocr.engine = 'paddle';
  }
  return copy;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('无效的数据文件格式');
  }

  const tables = {};
  if (payload.tables && typeof payload.tables === 'object') {
    for (const table of DATA_TABLES) {
      const rows = payload.tables[table];
      tables[table] = Array.isArray(rows) ? rows : [];
    }
  } else {
    // 兼容旧版导出格式（tasks/contacts 在顶层）
    for (const table of DATA_TABLES) {
      tables[table] = [];
    }
    if (Array.isArray(payload.tasks)) tables.tasks = payload.tasks;
    if (Array.isArray(payload.contacts)) tables.contacts = payload.contacts;
  }

  return {
    settings: payload.settings || null,
    tables
  };
}

function buildInsertSql(tableName, columns) {
  const colList = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  return `INSERT OR REPLACE INTO ${quoteIdentifier(tableName)} (${colList}) VALUES (${placeholders})`;
}

/**
 * 将标准格式数据写入本地数据库。
 * 采用先清空再写入的方式，确保导入结果是完整的恢复而非合并。
 */
function applyImportPayload(payload) {
  const { settings, tables } = normalizePayload(payload);
  const counts = {};

  const importTransaction = db.transaction(() => {
    // 1. 按反向顺序清空表，避免外键约束冲突
    for (const table of [...DATA_TABLES].reverse()) {
      db.prepare(`DELETE FROM ${quoteIdentifier(table)}`).run();
    }

    // 2. 按正向顺序写入数据
    for (const table of DATA_TABLES) {
      const rows = tables[table];
      const tableColumns = getTableColumns(table);
      counts[table] = 0;

      if (!Array.isArray(rows) || rows.length === 0) continue;

      // 按行动态构建列集合：只插入行中存在的字段，让缺失字段使用数据库默认值
      for (const row of rows) {
        const columns = tableColumns.filter(c => Object.prototype.hasOwnProperty.call(row, c));
        if (columns.length === 0) continue;

        const sql = buildInsertSql(table, columns);
        const values = columns.map(c => row[c] !== undefined ? row[c] : null);
        db.prepare(sql).run(values);
        counts[table]++;
      }
    }

    // 3. 写入设置
    if (settings) {
      saveUserSettings(sanitizeImportedSettings(settings));
    }
  });

  importTransaction();
  return counts;
}

async function exportAllData(parentWindow) {
  try {
    const payload = buildExportPayload();
    const defaultName = `chatask-export-${new Date().toISOString().slice(0, 10)}.json`;

    const result = await dialog.showSaveDialog(parentWindow, {
      title: '导出数据',
      defaultPath: path.join(app.getPath('desktop'), defaultName),
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });

    if (result.canceled) {
      return { success: false, error: '用户取消导出' };
    }

    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    console.error('[DataExport] 导出数据失败:', err);
    return { success: false, error: err.message };
  }
}

async function importAllData(parentWindow) {
  try {
    const result = await dialog.showOpenDialog(parentWindow, {
      title: '导入数据',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: '用户取消导入' };
    }

    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    const payload = JSON.parse(raw);

    if (payload.schemaVersion && payload.schemaVersion > EXPORT_SCHEMA_VERSION) {
      console.warn(`[DataExport] 导入文件 schema 版本 ${payload.schemaVersion} 高于当前支持版本 ${EXPORT_SCHEMA_VERSION}，尝试继续导入`);
    }

    const counts = applyImportPayload(payload);

    return {
      success: true,
      taskCount: counts.tasks || 0,
      contactCount: counts.contacts || 0,
      reminderRuleCount: counts.reminder_rules || 0,
      reminderLogCount: counts.reminder_logs || 0,
      timelineNoteCount: counts.timeline_notes || 0
    };
  } catch (err) {
    console.error('[DataExport] 导入数据失败:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  buildExportPayload,
  applyImportPayload,
  exportAllData,
  importAllData,
  EXPORT_VERSION,
  EXPORT_SCHEMA_VERSION,
  DATA_TABLES
};
