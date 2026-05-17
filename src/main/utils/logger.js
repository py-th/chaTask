// src/main/utils/logger.js
const log = (level, ...args) => console[level](`[${new Date().toISOString()}]`, ...args);
module.exports = {
  info: (...args) => log('log', ...args),
  warn: (...args) => log('warn', ...args),
  error: (...args) => log('error', ...args)
};