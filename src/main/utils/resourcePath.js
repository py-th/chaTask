// src/main/utils/resourcePath.js
// 资源路径解析工具 —— 兼容开发与生产环境，消除 mainWindow.js 与 tray.js 中的重复定义
const path = require('path');
const fs = require('fs');

/**
 * 获取资源文件路径，兼容开发环境（public/）与生产环境（resources/）
 * @param  {...string} relativePaths - 相对于资源根目录的路径片段
 * @returns {string} 资源文件的绝对路径
 */
function getResourcePath(...relativePaths) {
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, ...relativePaths);
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }
  const devPath = path.join(process.cwd(), 'public', ...relativePaths);
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  return path.join(process.cwd(), 'public', ...relativePaths);
}

module.exports = { getResourcePath };