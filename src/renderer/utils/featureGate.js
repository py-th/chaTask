// src/renderer/utils/featureGate.js
// 功能开关（阶段 0：基础版，所有 Pro 功能均锁定）

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

// 后续接入订阅时，只需把 isFeatureEnabled() 改为读取用户订阅状态即可，
// 所有加锁点无需改动。
export function isFeatureEnabled(featureId) {
  return false;
}

export async function showPremiumPrompt(featureName) {
  const name = featureName || '该功能';
  if (window.$confirm) {
    await window.$confirm({
      title: 'Pro 功能',
      message: `${name} 为 Pro 功能`,
      detail: '订阅后解锁该功能，敬请期待。',
      type: 'info',
      confirmText: '知道了',
      cancelText: ''
    });
  } else {
    window.alert(`${name} 为 Pro 功能，订阅后解锁。`);
  }
}
