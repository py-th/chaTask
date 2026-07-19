// src/main/utils/logger.js
// 统一日志工具 —— 按 debug/info/warn/error 分级，输出带时间戳的结构化日志
// 同时持久化写入到日志文件（保留最近7天日志）
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const LOG_DIR = (() => {
  try { return path.join(app.getPath('userData'), 'logs'); } catch (e) { return path.join(process.cwd(), 'logs'); }
})();
const MAX_LOG_DAYS = 7;

// 确保日志目录存在
try { if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (e) {}

// 清理过期日志文件
function cleanOldLogs() {
  try {
    const cutoff = Date.now() - MAX_LOG_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(LOG_DIR);
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(LOG_DIR, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    }
  } catch (e) { /* 静默处理清理错误 */ }
}

// 获取当天的日志文件路径
function getLogFilePath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `chatask-${date}.log`);
}

// 写入日志文件
function writeToFile(level, message) {
  try {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(getLogFilePath(), line, 'utf8');
  } catch (e) { /* 静默处理文件写入错误 */ }
}

// 格式化日志消息
function formatMessage(args) {
  return args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'object') {
      try { return JSON.stringify(arg); } catch (e) { return String(arg); }
    }
    return String(arg);
  }).join(' ');
}

const log = (level, ...args) => {
  const message = formatMessage(args);
  console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}]`, ...args);
  // 仅 warn 和 error 级别写入文件，减少IO开销
  if (level === 'warn' || level === 'error') {
    writeToFile(level, message);
  }
};

// 启动时清理旧日志
cleanOldLogs();

module.exports = {
  debug: (...args) => log('log', ...args),
  info: (...args) => log('log', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args)
};