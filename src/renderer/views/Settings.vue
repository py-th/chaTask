<template>
  <div class="settings-layout">
    <div class="settings-sidebar">
      <div
        v-for="section in sections"
        :key="section.key"
        :class="['settings-nav-item', { active: currentSection === section.key }]"
        @click="currentSection = section.key"
      >
        <span class="settings-nav-icon">{{ section.icon }}</span>
        <span>{{ section.label }}</span>
      </div>
    </div>

    <div class="settings-content">
      <template v-if="currentSection === 'general'">
        <h3 class="settings-section-title">基础设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">开机自启动</span>
              <span class="setting-desc">程序在系统启动时自动运行</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.general.autoLaunch" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">关闭时最小化到托盘</span>
              <span class="setting-desc">关闭窗口时隐藏到系统托盘而不是退出</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.general.minimizeToTray" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'sticky'">
        <h3 class="settings-section-title">便签设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">默认透明度</span>
              <span class="setting-desc">新建便签的默认透明度 ({{ settings.sticky.defaultOpacity }})</span>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              v-model.number="settings.sticky.defaultOpacity"
              @change="saveSettings"
            />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">贴边自动折叠</span>
              <span class="setting-desc">拖拽便签到屏幕边缘时自动折叠</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.sticky.edgeSnap" @change="saveSettings" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'screenshot'">
        <h3 class="settings-section-title">截图设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">截图方式</span>
              <span class="setting-desc">选择截图触发方式</span>
            </div>
            <select v-model="settings.screenshot.mode" @change="saveSettings">
              <option value="shortcut">快捷键截图 (Ctrl+Alt+S)</option>
              <option value="clipboard">剪贴板监听 (Win+Shift+S)</option>
            </select>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'ocr'">
        <h3 class="settings-section-title">OCR 识别设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">OCR 引擎</span>
              <span class="setting-desc">本地使用 PaddleOCR，云端调用百度 OCR API</span>
            </div>
            <select v-model="settings.ocr.mode" @change="saveSettings">
              <option value="local">本地 (PaddleOCR)</option>
              <option value="cloud">云端 (百度 OCR)</option>
            </select>
          </div>
          <div v-if="settings.ocr.mode === 'cloud'" class="setting-row">
            <div class="setting-info">
              <span class="setting-name">API Key</span>
              <span class="setting-desc">百度 OCR API 密钥</span>
            </div>
            <input
              type="text"
              v-model="settings.ocr.cloudApiKey"
              @change="saveSettings"
              placeholder="输入 API Key"
            />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">识别语言</span>
              <span class="setting-desc">OCR 文字识别语言</span>
            </div>
            <select v-model="settings.ocr.language" @change="saveSettings">
              <option value="ch">中文</option>
              <option value="en">英文</option>
              <option value="ch_en">中英混合</option>
            </select>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'shortcuts'">
        <h3 class="settings-section-title">快捷键设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">截图识别</span>
              <span class="setting-desc">触发 IM 消息截图识别（当前: {{ settings.shortcuts.screenshot || 'Ctrl+Alt+S' }}）</span>
            </div>
            <div class="shortcut-input-group">
              <input
                type="text"
                v-model="settings.shortcuts.screenshot"
                @change="saveSettings"
                placeholder="Ctrl+Alt+S"
                class="shortcut-input"
              />
              <button class="btn btn-xs btn-outline" @click="startRecordShortcut('screenshot')">录制</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">显示主窗口</span>
              <span class="setting-desc">快速打开主窗口（当前: {{ settings.shortcuts.showWindow || 'Ctrl+Shift+A' }}）</span>
            </div>
            <div class="shortcut-input-group">
              <input
                type="text"
                v-model="settings.shortcuts.showWindow"
                @change="saveSettings"
                placeholder="Ctrl+Shift+A"
                class="shortcut-input"
              />
              <button class="btn btn-xs btn-outline" @click="startRecordShortcut('showWindow')">录制</button>
            </div>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'reminder'">
        <h3 class="settings-section-title">提醒设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">默认提醒时间</span>
              <span class="setting-desc">新建提醒时的默认时间</span>
            </div>
            <input type="time" v-model="settings.reminder.defaultTime" @change="saveSettings" />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">默认提前提醒</span>
              <span class="setting-desc">提前多少分钟提醒 ({{ settings.reminder.advanceMinutes }}分钟)</span>
            </div>
            <select v-model.number="settings.reminder.advanceMinutes" @change="saveSettings">
              <option :value="0">不提前</option>
              <option :value="5">5分钟</option>
              <option :value="10">10分钟</option>
              <option :value="15">15分钟</option>
              <option :value="30">30分钟</option>
            </select>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'data'">
        <h3 class="settings-section-title">数据管理</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">导出数据</span>
              <span class="setting-desc">将所有任务、联系人和设置导出为 JSON 文件</span>
            </div>
            <button class="btn btn-outline" @click="exportData">📤 导出</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">导入数据</span>
              <span class="setting-desc">从 JSON 文件恢复任务、联系人和设置</span>
            </div>
            <button class="btn btn-outline" @click="importData">📥 导入</button>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">清空所有数据</span>
              <span class="setting-desc">删除所有任务和联系人（不可恢复）</span>
            </div>
            <button class="btn btn-danger" @click="clearAllData">🗑️ 清空</button>
          </div>
        </div>

        <h3 class="settings-section-title" style="margin-top: 24px;">备份与同步</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">云同步</span>
              <span class="setting-desc">启用后将自动同步数据到云端</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.cloudSync.enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">提供商</span>
              <span class="setting-desc">选择云存储服务提供商</span>
            </div>
            <select v-model="settings.cloudSync.provider" :disabled="!settings.cloudSync.enabled">
              <option value="baidu">百度云</option>
              <option value="aliyun">阿里云</option>
              <option value="onedrive">OneDrive</option>
              <option value="webdav">WebDAV</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">自动备份</span>
              <span class="setting-desc">每天自动备份数据到云端</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.cloudSync.autoBackup" :disabled="!settings.cloudSync.enabled" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">手动操作</span>
              <span class="setting-desc">立即执行备份或恢复操作</span>
            </div>
            <div class="btn-group">
              <button class="btn btn-outline" :disabled="!settings.cloudSync.enabled">📤 立即备份</button>
              <button class="btn btn-outline" :disabled="!settings.cloudSync.enabled">📥 恢复备份</button>
            </div>
          </div>
        </div>
        <div v-if="dataMessage" :class="['data-msg', dataMsgType]">{{ dataMessage }}</div>
      </template>

      <template v-if="currentSection === 'about'">
        <h3 class="settings-section-title">关于 ChatAsk</h3>
        <div class="settings-group card">
          <div class="about-info">
            <div class="about-row">
              <span>应用名称</span>
              <span>ChatAsk - 智能任务便签</span>
            </div>
            <div class="about-row">
              <span>版本号</span>
              <span>v1.0.0</span>
            </div>
            <div class="about-row">
              <span>技术栈</span>
              <span>Electron + Vue 3 + SQLite + ONNX</span>
            </div>
            <div class="about-row">
              <span>核心功能</span>
              <span>IM消息截图 → AI识别 → 任务创建 → 桌面便签</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

const sections = [
  { key: 'general', icon: '⚙️', label: '基础设置' },
  { key: 'sticky', icon: '📌', label: '便签设置' },
  { key: 'screenshot', icon: '📸', label: '截图设置' },
  { key: 'ocr', icon: '🔍', label: 'OCR 设置' },
  { key: 'shortcuts', icon: '⌨️', label: '快捷键' },
  { key: 'reminder', icon: '🔔', label: '提醒设置' },
  { key: 'data', icon: '☁️', label: '数据管理' },
  { key: 'about', icon: 'ℹ️', label: '关于' }
]

const currentSection = ref('general')
const dataMessage = ref('')
const dataMsgType = ref('success')

const settings = reactive({
  general: { autoLaunch: false, minimizeToTray: true },
  sticky: { defaultOpacity: 100, edgeSnap: true },
  screenshot: { mode: 'shortcut' },
  ocr: { mode: 'local', cloudApiKey: '', language: 'ch' },
  shortcuts: { screenshot: 'Ctrl+Alt+S', showWindow: 'Ctrl+Shift+A' },
  reminder: { defaultTime: '09:00', advanceMinutes: 0 },
  cloudSync: { enabled: false, provider: 'baidu', autoBackup: false }
})

async function saveSettings() {
  try {
    await window.electronAPI.saveSettings({ ...settings })
  } catch (err) {
    console.error('保存设置失败:', err)
  }
}

function startRecordShortcut(key) {
  dataMessage.value = '请在 3 秒内按下新的快捷键组合...'
  dataMsgType.value = 'info'
  setTimeout(() => { dataMessage.value = '' }, 3000)
}

async function exportData() {
  try {
    const result = await window.electronAPI.exportAllData()
    if (result.success) {
      dataMessage.value = `数据已导出到: ${result.filePath}`
      dataMsgType.value = 'success'
    } else {
      dataMessage.value = '导出失败: ' + (result.error || '未知错误')
      dataMsgType.value = 'error'
    }
    setTimeout(() => { dataMessage.value = '' }, 5000)
  } catch (err) {
    dataMessage.value = '导出失败: ' + err.message
    dataMsgType.value = 'error'
    setTimeout(() => { dataMessage.value = '' }, 5000)
  }
}

async function importData() {
  try {
    const result = await window.electronAPI.importAllData()
    if (result.success) {
      dataMessage.value = `成功导入 ${result.taskCount || 0} 个任务、${result.contactCount || 0} 个联系人`
      dataMsgType.value = 'success'
    } else {
      dataMessage.value = '导入失败: ' + (result.error || '未知错误')
      dataMsgType.value = 'error'
    }
    setTimeout(() => { dataMessage.value = '' }, 5000)
  } catch (err) {
    dataMessage.value = '导入失败: ' + err.message
    dataMsgType.value = 'error'
    setTimeout(() => { dataMessage.value = '' }, 5000)
  }
}

async function clearAllData() {
  if (!confirm('确定要清空所有数据吗？此操作不可恢复！')) return
  try {
    const result = await window.electronAPI.clearAllData()
    if (result.success) {
      dataMessage.value = '所有数据已清空'
      dataMsgType.value = 'success'
    }
    setTimeout(() => { dataMessage.value = '' }, 3000)
  } catch (err) {
    dataMessage.value = '清空失败: ' + err.message
    dataMsgType.value = 'error'
    setTimeout(() => { dataMessage.value = '' }, 5000)
  }
}

onMounted(async () => {
  try {
    const saved = await window.electronAPI.getSettings()
    if (saved) {
      const keys = ['general', 'sticky', 'screenshot', 'ocr', 'shortcuts', 'reminder', 'cloudSync']
      keys.forEach(k => {
        if (saved[k]) Object.assign(settings[k], saved[k])
      })
    }
  } catch (err) {
    console.error('加载设置失败:', err)
  }
})
</script>

<style scoped>
.settings-layout {
  display: flex;
  gap: 0;
  height: 100%;
}

.settings-sidebar {
  width: 180px;
  min-width: 180px;
  border-right: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.settings-nav-item:hover {
  background: var(--color-bg);
}

.settings-nav-item.active {
  background: var(--color-primary);
  color: #fff;
}

.settings-nav-icon {
  font-size: 16px;
}

.settings-content {
  flex: 1;
  padding: 0 20px 20px;
  overflow-y: auto;
}

.settings-section-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  margin-bottom: 16px;
  padding-top: 4px;
}

.settings-group {
  padding: 4px 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 60%;
}

.setting-name {
  font-weight: 500;
}

.setting-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.setting-row select,
.setting-row input[type="time"] {
  min-width: 160px;
}

.setting-row input[type="text"] {
  min-width: 180px;
}

.btn-group {
  display: flex;
  gap: 8px;
}

.shortcut-input-group {
  display: flex;
  gap: 6px;
  align-items: center;
}

.shortcut-input {
  width: 140px;
  text-align: center;
}

.toggle {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-border);
  border-radius: 12px;
  transition: var(--transition-fast);
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: var(--transition-fast);
}

.toggle input:checked + .toggle-slider {
  background: var(--color-primary);
}

.toggle input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.data-msg {
  margin-top: 12px;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.data-msg.success {
  background: #F6FFED;
  color: #389E0D;
  border: 1px solid #B7EB8F;
}

.data-msg.error {
  background: #FFF1F0;
  color: #CF1322;
  border: 1px solid #FFA39E;
}

.data-msg.info {
  background: #E6F7FF;
  color: #096DD9;
  border: 1px solid #91D5FF;
}

.about-info {
  display: flex;
  flex-direction: column;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border-light);
  font-size: var(--font-size-sm);
}

.about-row:last-child {
  border-bottom: none;
}

.about-row span:first-child {
  color: var(--color-text-secondary);
}
</style>