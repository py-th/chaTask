function formatDate(dateStr) {
  if (!dateStr) return '未设置';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function formatDateTime(dateStr) {
  if (!dateStr) return '未知';
  return new Date(dateStr).toLocaleString('zh-CN');
}

function formatTime(dateStr) {
  if (!dateStr) return '未知';
  return new Date(dateStr).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function isOverdue(dueDateStr) {
  if (!dueDateStr) return false;
  const dueDate = new Date(dueDateStr);
  const now = new Date();
  return dueDate < now && dueDate.toDateString() !== now.toDateString();
}

function getDaysRemaining(dueDateStr) {
  if (!dueDateStr) return null;
  const dueDate = new Date(dueDateStr);
  const now = new Date();
  const diffTime = dueDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getRelativeTime(dateStr) {
  if (!dateStr) return '未知';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return formatDate(dateStr);
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const date = dateStr ? new Date(dateStr) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

module.exports = {
  formatDate,
  formatDateTime,
  formatTime,
  isOverdue,
  getDaysRemaining,
  getRelativeTime,
  getTodayString,
  addDays
};