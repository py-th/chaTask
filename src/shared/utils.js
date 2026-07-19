// src/shared/utils.js
// 项目共享工具函数 —— 主进程与渲染进程共用，消除跨文件重复定义

/**
 * HTML 转义 —— 防止 XSS，将特殊字符转为 HTML 实体
 * @param {string} str - 待转义的字符串
 * @returns {string} 转义后的安全字符串
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"'/]/g, (char) => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
      '/': '&#x2F;'
    };
    return escapeMap[char] || char;
  });
}

module.exports = {
  escapeHtml
};