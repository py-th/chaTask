// src/main/utils/clipboard.js
const { clipboard } = require('electron');

function getImageHash(imgBuffer) {
  const size = imgBuffer.length;
  const prefix = imgBuffer.slice(0, 100).toString('hex');
  return `${size}:${prefix}`;
}

function startClipboardWatcher(onImageCallback, interval = 1000) {
  let lastHash = null;

  // 初始化：忽略当前剪贴板中的图片
  const init = () => {
    try {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const imgBuffer = img.toPNG();
        lastHash = getImageHash(imgBuffer);
        console.log('[Clipboard] 初始化，忽略启动时剪贴板中的截图');
      }
    } catch (err) {
      console.error('[Clipboard] 初始化失败:', err);
    }
  };
  init();

  const watcher = setInterval(async () => {
    try {
      const img = clipboard.readImage();
      if (img.isEmpty()) return;
      const imgBuffer = img.toPNG();
      const currentHash = getImageHash(imgBuffer);
      if (currentHash === lastHash) return;
      lastHash = currentHash;
      await onImageCallback(imgBuffer);
    } catch (err) {
      console.error('[Clipboard] 错误:', err);
    }
  }, interval);
  return watcher;
}

module.exports = { startClipboardWatcher, getImageHash };