// src/renderer/utils/featureGate.js
// 功能开关（阶段 0：基础版，所有 Pro 功能均锁定）
// 从共享常量导入，与主进程保持一致
import { FEATURES, FEATURE_NAMES } from '../shared/constants.js';

export { FEATURES, FEATURE_NAMES };

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
