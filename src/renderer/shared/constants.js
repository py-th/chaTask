// src/renderer/shared/constants.js
// 渲染进程专用 ESM 常量 —— 从 shared/constants.js 中提取渲染进程需要的值，避免 CJS/ESM 互操作问题

// 默认头像
export const DEFAULT_AVATAR_SVG_45 = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";

// 功能开关
export const FEATURES = {
  TASK_VIEWS: 'taskViews',
  SKIN_TEMPLATES: 'skinTemplates',
  TOOLBOX_COUNTDOWN: 'toolboxCountdown',
  TOOLBOX_POMODORO: 'toolboxPomodoro',
  TOOLBOX_SHUTDOWN: 'toolboxShutdown'
};

export const FEATURE_NAMES = {
  [FEATURES.TASK_VIEWS]: '任务视图',
  [FEATURES.SKIN_TEMPLATES]: '皮肤模板',
  [FEATURES.TOOLBOX_COUNTDOWN]: '桌面倒计时',
  [FEATURES.TOOLBOX_POMODORO]: '番茄时钟',
  [FEATURES.TOOLBOX_SHUTDOWN]: '定时关机'
};