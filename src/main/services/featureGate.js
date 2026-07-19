// src/main/services/featureGate.js
// 功能开关服务（阶段 0：基础版，所有 Pro 功能均锁定）
const { showConfirmDialog } = require('../windows/confirmDialog');
const { FEATURES, FEATURE_NAMES } = require('../../shared/constants');

// 阶段 0：所有增值功能均未解锁，后续可接入订阅服务动态返回
function isFeatureEnabled(featureId) {
  return false;
}

// 在指定父窗口弹出 Pro 提示（桌面便签使用 confirmDialog.js 的自定义对话框）
function showPremiumPrompt(parentWindow, featureName) {
  if (!parentWindow || parentWindow.isDestroyed()) return;
  showConfirmDialog(parentWindow, {
    type: 'info',
    title: 'Pro 功能',
    message: `${featureName || '该功能'} 为 Pro 功能`,
    detail: '订阅后解锁该功能，敬请期待。',
    confirmText: '知道了',
    cancelText: ''
  });
}

module.exports = {
  FEATURES,
  FEATURE_NAMES,
  isFeatureEnabled,
  showPremiumPrompt
};
