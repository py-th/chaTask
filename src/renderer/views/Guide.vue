<template>
  <div class="guide-page">
    <div class="guide-header">
      <h2>📖 操作指引</h2>
      <p>快速了解如何使用 ChaTask 的各项功能</p>
    </div>

    <div class="guide-section card">
      <h3>🚀 快速入门</h3>
      <div class="guide-steps">
        <div class="guide-step">
          <div class="step-num">1</div>
          <div class="step-content">
            <strong>截图识别</strong>
            <p>打开IM聊天窗口（微信/飞书/钉钉），按下 <kbd>Ctrl+Alt+S</kbd> 进入截图模式，框选需要转换的消息区域，AI自动识别发送者、消息内容和时间。</p>
          </div>
        </div>
        <div class="guide-step">
          <div class="step-num">2</div>
          <div class="step-content">
            <strong>确认信息</strong>
            <p>确认AI识别出的发送者信息后，系统自动创建任务并在桌面生成便签。</p>
          </div>
        </div>
        <div class="guide-step">
          <div class="step-num">3</div>
          <div class="step-content">
            <strong>管理任务</strong>
            <p>在任务列表中查看、编辑、筛选和批量管理所有任务。右键桌面便签可快速设置优先级、状态和提醒规则。</p>
          </div>
        </div>
      </div>
    </div>

    <div class="guide-section card">
      <h3>⌨️ 快捷键速查</h3>
      <div class="shortcut-list">
        <div class="shortcut-item">
          <span><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd></span>
          <span>截图识别消息</span>
        </div>
        <div class="shortcut-item">
          <span><kbd>Win</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd></span>
          <span>系统截图（剪贴板模式）</span>
        </div>
      </div>
    </div>

    <div class="guide-section card">
      <h3>💡 桌面便签技巧</h3>
      <ul>
        <li>OCR识别不准确 → 设置中心切换到云端OCR提高识别精度</li>
        <li>拖拽便签到屏幕边缘 → 自动折叠成小头像图标，双击头像自动贴边</li>
        <li>点击折叠的头像 → 展开便签查看详情</li>
        <li>右键便签 → 快速设置优先级、状态和提醒</li>
        <li>在任务看板中可查看所有任务的统计和趋势</li>
        <li>已完成和已删除的任务不能创建桌面便签和提醒设置</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.guide-page {
  max-width: 800px;
  margin: 0 auto;
}

.guide-header {
  margin-bottom: 24px;
}

.guide-header h2 {
  font-size: var(--font-size-2xl);
  margin-bottom: 8px;
}

.guide-header p {
  color: var(--color-text-secondary);
}

.guide-section {
  padding: 20px;
  margin-bottom: 16px;
}

.guide-section h3 {
  margin-bottom: 16px;
  font-size: var(--font-size-lg);
}

.guide-steps {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.guide-step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.step-content strong {
  display: block;
  margin-bottom: 4px;
}

.step-content p {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-light);
}

.shortcut-item:last-child {
  border-bottom: none;
}

.guide-section ul {
  list-style: none;
  padding: 0;
}

.guide-section ul li {
  padding: 6px 0;
  padding-left: 20px;
  position: relative;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.guide-section ul li::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: var(--color-primary);
}
</style>