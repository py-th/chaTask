// src/shared/constants.js
// 项目共享常量 —— 主进程与渲染进程共用，消除跨文件重复定义

// ---- 默认头像 SVG ----
const DEFAULT_AVATAR_SVG_45 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";

const DEFAULT_AVATAR_SVG_40 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";

// ---- 任务优先级背景色 ----
const PRIORITY_COLORS = {
  high: '#ffcccc',
  medium: '#cce5ff',
  low: '#ccffcc',
  none: 'rgba(255,249,196,0.95)'
};

// ---- 任务状态 ----
const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue'
};

// ---- 功能开关 ID ----
const FEATURES = {
  TASK_VIEWS: 'taskViews',
  SKIN_TEMPLATES: 'skinTemplates',
  TOOLBOX_COUNTDOWN: 'toolboxCountdown',
  TOOLBOX_POMODORO: 'toolboxPomodoro',
  TOOLBOX_SHUTDOWN: 'toolboxShutdown'
};

// ---- 功能开关中文名 ----
const FEATURE_NAMES = {
  [FEATURES.TASK_VIEWS]: '任务视图',
  [FEATURES.SKIN_TEMPLATES]: '皮肤模板',
  [FEATURES.TOOLBOX_COUNTDOWN]: '桌面倒计时',
  [FEATURES.TOOLBOX_POMODORO]: '番茄时钟',
  [FEATURES.TOOLBOX_SHUTDOWN]: '定时关机'
};

// ---- 任务文本长度限制 ----
const DEFAULT_MAX_CONTENT_LENGTH = 200;

// ---- 便签默认尺寸 ----
const STICKY_NOTE_DEFAULTS = {
  width: 320,
  height: 'auto',
  minWidth: 260,
  maxWidth: 500
};

// ---- 时间轴便签默认尺寸 ----
const TIMELINE_NOTE_DEFAULTS = {
  width: 310,
  maxHeight: 500,
  minWidth: 260,
  maxWidth: 500
};

// ---- 贴边隐藏相关 ----
const EDGE_SNAP = {
  threshold: 50,          // 贴边检测阈值(px)
  autoHideDelay: 5000,    // 自动隐藏延迟(ms)
  avatarOpacity: 0.5,     // 折叠后头像透明度
  avatarOpacityTransition: 'opacity 0.2s ease',
  timelineFoldOpacityDelay: 60000  // 时间轴模式折叠后1分钟变半透明
};

// ---- 提醒相关 ----
const REMINDER = {
  logRetentionDays: 30,   // 提醒日志保留天数
  defaultSnoozeMinutes: [3, 10, 15, 30, 60]  // 默认延时选项(分钟)
};

// ---- 提醒方式映射 ----
const REMINDER_WAY_MAP = {
  popup: '弹窗',
  sound: '声音',
  silent: '静默'
};

// ---- 重复类型映射 ----
const REPEAT_TYPE_MAP = {
  once: '单次',
  daily: '每天',
  weekly: '每周',
  monthly: '每月',
  custom: '自定义'
};

// ---- 确认对话框图标映射 ----
const DIALOG_ICON_MAP = {
  warning: '⚠️',
  danger: '💣',
  info: 'ℹ️',
  success: '✅'
};

const constants = {
  DEFAULT_AVATAR_SVG_45,
  DEFAULT_AVATAR_SVG_40,
  PRIORITY_COLORS,
  TASK_STATUS,
  FEATURES,
  FEATURE_NAMES,
  DEFAULT_MAX_CONTENT_LENGTH,
  STICKY_NOTE_DEFAULTS,
  TIMELINE_NOTE_DEFAULTS,
  EDGE_SNAP,
  REMINDER,
  REMINDER_WAY_MAP,
  REPEAT_TYPE_MAP,
  DIALOG_ICON_MAP
};

// CommonJS 导出：主进程 require() 直接解构使用
module.exports = constants;