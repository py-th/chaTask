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
              <input type="checkbox" v-model="settings.general.autoLaunch" @change="onAutoLaunchChange" />
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">截图确认模式</span>
              <span class="setting-desc">识别成功后何时弹出确认对话框</span>
            </div>
            <select v-model="settings.screenshot.confirmMode" @change="saveSettings">
              <option value="on_mismatch">仅匹配不到联系人时</option>
              <option value="always">每次都确认</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">外观主题</span>
              <span class="setting-desc">切换主界面的颜色主题</span>
            </div>
            <select v-model="settings.general.theme" @change="onThemeChange">
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="system">跟随系统</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">不在任务栏显示便签</span>
              <span class="setting-desc">桌面便签窗口不显示在任务栏中（重启便签后生效）</span>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settings.sticky.skipTaskbar" @change="saveSettings" />
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
              <span class="setting-desc">新建便签的默认透明度 ({{ settings.sticky.defaultOpacity }}%)</span>
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
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">贴边检测阈值</span>
              <span class="setting-desc">距离屏幕边缘多少像素触发折叠 ({{ settings.sticky.edgeSnapThreshold }}px)</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              v-model.number="settings.sticky.edgeSnapThreshold"
              @change="saveSettings"
            />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">贴边头像大小</span>
              <span class="setting-desc">贴边折叠时显示的头像尺寸 ({{ settings.sticky.foldedAvatarSize }}px)</span>
            </div>
            <input
              type="range"
              min="30"
              max="60"
              v-model.number="settings.sticky.foldedAvatarSize"
              @change="saveSettings"
            />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">默认贴边位置</span>
              <span class="setting-desc">双击头像折叠时贴向屏幕的位置</span>
            </div>
            <select v-model="settings.sticky.foldedEdge" @change="saveSettings">
              <option value="top">顶部</option>
              <option value="right">右边</option>
              <option value="left">左边</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">任务文本最长显示长度</span>
              <span class="setting-desc">超过该长度自动折叠，点击展开后显示全部 ({{ settings.sticky.taskTextMaxLength }} 字符)</span>
            </div>
            <input
              type="range"
              min="50"
              max="1000"
              step="50"
              v-model.number="settings.sticky.taskTextMaxLength"
              @change="saveSettings"
            />
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'ocr'">
        <h3 class="settings-section-title">截图&OCR识别</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">截图方式</span>
              <span class="setting-desc">选择截图触发方式（切换后需重启生效）</span>
            </div>
            <select v-model="settings.screenshot.mode" @change="saveSettings">
              <option value="shortcut">快捷键截图 (Ctrl+Alt+S)</option>
              <option value="clipboard">剪贴板监听 (Win+Shift+S)</option>
            </select>
          </div>
          <div v-if="settings.screenshot.mode === 'clipboard'" class="setting-row">
            <div class="setting-info">
              <span class="setting-name">剪贴板轮询间隔</span>
              <span class="setting-desc">检测新截图的间隔时间 ({{ settings.screenshot.clipboardInterval }}ms)</span>
            </div>
            <select v-model.number="settings.screenshot.clipboardInterval" @change="saveSettings">
              <option :value="500">500ms</option>
              <option :value="1000">1000ms</option>
              <option :value="2000">2000ms</option>
              <option :value="3000">3000ms</option>
            </select>
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">OCR 引擎</span>
              <span class="setting-desc">本地使用 PaddleOCR，云端调用第三方 OCR API</span>
            </div>
            <select v-model="settings.ocr.engine" @change="saveSettings">
              <option value="paddle">本地 (PaddleOCR)</option>
              <option value="baidu">百度云 OCR</option>
              <option value="tencent">腾讯云 OCR</option>
              <option value="aliyun">阿里云 OCR</option>
            </select>
          </div>
          
          <template v-if="settings.ocr.engine === 'baidu'">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">API Key</span>
                <span class="setting-desc">百度云 OCR API Key</span>
              </div>
              <input type="text" v-model="settings.ocr.baidu.apiKey" @change="saveSettings" placeholder="请输入 API Key" />
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">Secret Key</span>
                <span class="setting-desc">百度云 OCR Secret Key</span>
              </div>
              <input type="password" v-model="settings.ocr.baidu.secretKey" @change="saveSettings" placeholder="请输入 Secret Key" />
            </div>
          </template>
          <template v-if="settings.ocr.engine === 'aliyun'">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">AccessKey ID</span>
                <span class="setting-desc">阿里云 RAM 用户 AccessKey ID</span>
              </div>
              <input type="text" v-model="settings.ocr.aliyun.accessKeyId" @change="saveSettings" placeholder="请输入 AccessKey ID" />
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">AccessKey Secret</span>
                <span class="setting-desc">阿里云 RAM 用户 AccessKey Secret</span>
              </div>
              <input type="password" v-model="settings.ocr.aliyun.accessKeySecret" @change="saveSettings" placeholder="请输入 AccessKey Secret" />
            </div>
          </template>
          <template v-if="settings.ocr.engine === 'tencent'">
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">SecretId</span>
                <span class="setting-desc">腾讯云 API 密钥 SecretId</span>
              </div>
              <input type="text" v-model="settings.ocr.tencent.secretId" @change="saveSettings" placeholder="请输入 SecretId" />
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-name">SecretKey</span>
                <span class="setting-desc">腾讯云 API 密钥 SecretKey</span>
              </div>
              <input type="password" v-model="settings.ocr.tencent.secretKey" @change="saveSettings" placeholder="请输入 SecretKey" />
            </div>
          </template>
          
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
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">超时时间</span>
              <span class="setting-desc">云端请求超时时间 ({{ settings.ocr.timeout }}ms)</span>
            </div>
            <select v-model.number="settings.ocr.timeout" @change="saveSettings">
              <option :value="5000">5秒</option>
              <option :value="10000">10秒</option>
              <option :value="15000">15秒</option>
              <option :value="30000">30秒</option>
            </select>
          </div>
        </div>
      </template>

      <template v-if="currentSection === 'ai'">
        <h3 class="settings-section-title">AI 识别设置</h3>
        <div class="settings-group card">
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">YOLO 置信度阈值</span>
              <span class="setting-desc">控制头像/文本检测灵敏度 ({{ (settings.yolo.confThreshold * 100).toFixed(0) }}%)</span>
            </div>
            <input
              type="range"
              min="10"
              max="90"
              v-model.number="yoloConfPercent"
              @change="onYoloConfChange"
            />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">头像哈希匹配阈值</span>
              <span class="setting-desc">汉明距离阈值，越小越严格 ({{ settings.matching.avatarHashThreshold }})</span>
            </div>
            <input
              type="range"
              min="3"
              max="20"
              v-model.number="settings.matching.avatarHashThreshold"
              @change="saveSettings"
            />
          </div>
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">颜色相似度阈值</span>
              <span class="setting-desc">辅助验证头像匹配 ({{ (settings.matching.avatarColorThreshold * 100).toFixed(0) }}%)</span>
            </div>
            <input
              type="range"
              min="30"
              max="95"
              v-model.number="colorThresholdPercent"
              @change="onColorThresholdChange"
            />
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
                @change="onShortcutChange('screenshot')"
                placeholder="Ctrl+Alt+S"
                class="shortcut-input"
              />
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
                @change="onShortcutChange('showWindow')"
                placeholder="Ctrl+Shift+A"
                class="shortcut-input"
              />
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
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-name">检查间隔</span>
              <span class="setting-desc">提醒调度器检查频率 ({{ settings.reminder.checkInterval / 1000 }}秒)</span>
            </div>
            <select v-model.number="settings.reminder.checkInterval" @change="saveSettings">
              <option :value="15000">15秒</option>
              <option :value="30000">30秒</option>
              <option :value="60000">60秒</option>
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
              <span class="setting-name">重置设置</span>
              <span class="setting-desc">将所有设置恢复为默认值</span>
            </div>
            <button class="btn btn-outline" @click="resetSettings">🔄 重置</button>
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
        <h3 class="settings-section-title">关于 ChaTask</h3>
        <div class="settings-group card">
          <div class="about-info">
            <div class="about-row">
              <span>应用名称</span>
              <span>ChaTask - 智能任务便签</span>
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
import { ref, reactive, computed, onMounted } from 'vue'

const sections = [
  { key: 'general', icon: '⚙️', label: '基础设置' },
  { key: 'sticky', icon: '📌', label: '便签设置' },
  { key: 'ocr', icon: '🔍', label: '截图&OCR' },
  { key: 'ai', icon: '🤖', label: 'AI 设置' },
  { key: 'shortcuts', icon: '⌨️', label: '快捷键' },
  { key: 'reminder', icon: '🔔', label: '提醒设置' },
  { key: 'data', icon: '☁️', label: '数据管理' },
  { key: 'about', icon: 'ℹ️', label: '关于' }
]

const currentSection = ref('general')
const dataMessage = ref('')
const dataMsgType = ref('success')

const settings = reactive({
  general: { autoLaunch: false, minimizeToTray: true, theme: 'system' },
  sticky: { defaultOpacity: 100, edgeSnap: true, edgeSnapThreshold: 10, skipTaskbar: true, foldedAvatarSize: 45, foldedEdge: 'right', taskTextMaxLength: 200 },
  screenshot: { mode: 'shortcut', confirmMode: 'on_mismatch', clipboardInterval: 1000, clipboardMinWidth: 50, clipboardMaxWidth: 500, clipboardMinHeight: 20, clipboardMaxHeight: 300 },
  ocr: {
    engine: 'paddle',
    timeout: 10000,
    baidu: { apiKey: '', secretKey: '' },
    aliyun: { accessKeyId: '', accessKeySecret: '' },
    tencent: { secretId: '', secretKey: '' },
    language: 'ch'
  },
  yolo: { confThreshold: 0.5 },
  matching: { avatarHashThreshold: 8, avatarColorThreshold: 0.7 },
  shortcuts: { screenshot: 'Ctrl+Alt+S', showWindow: 'Ctrl+Shift+A' },
  reminder: { defaultTime: '09:00', advanceMinutes: 0, checkInterval: 30000 },
  cloudSync: { enabled: false, provider: 'baidu', autoBackup: false }
})

const yoloConfPercent = computed({
  get: () => Math.round(settings.yolo.confThreshold * 100),
  set: (val) => { settings.yolo.confThreshold = val / 100 }
})

const colorThresholdPercent = computed({
  get: () => Math.round(settings.matching.avatarColorThreshold * 100),
  set: (val) => { settings.matching.avatarColorThreshold = val / 100 }
})

async function saveSettings() {
  try {
    await window.electronAPI.saveSettings(JSON.parse(JSON.stringify(settings)))
  } catch (err) {
    console.error('保存设置失败:', err)
    window.$toast.error('保存设置失败')
  }
}

async function onAutoLaunchChange() {
  await saveSettings()
  try {
    await window.electronAPI.reloadAutoLaunch()
  } catch (err) {
    console.error('更新开机启动失败:', err)
    window.$toast.error('更新开机启动失败')
  }
}

async function onShortcutChange() {
  await saveSettings()
  try {
    await window.electronAPI.reloadShortcuts()
  } catch (err) {
    console.error('更新快捷键失败:', err)
    window.$toast.error('更新快捷键失败')
  }
}

function onYoloConfChange() {
  saveSettings()
}

function onColorThresholdChange() {
  saveSettings()
}

function applyTheme(theme) {
  const root = document.documentElement
  root.classList.remove('theme-dark')
  if (theme === 'dark') {
    root.classList.add('theme-dark')
  } else if (theme === 'system') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('theme-dark')
    }
  }
}

function onThemeChange() {
  applyTheme(settings.general.theme)
  saveSettings()
}

let systemThemeListener = null

function watchSystemTheme() {
  if (systemThemeListener) {
    systemThemeListener()
    systemThemeListener = null
  }
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (settings.general.theme === 'system') {
      applyTheme('system')
    }
  }
  mediaQuery.addEventListener('change', handler)
  systemThemeListener = () => mediaQuery.removeEventListener('change', handler)
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
    window.$toast.error('导出数据失败')
    setTimeout(() => { dataMessage.value = '' }, 5000)
  }
}

async function importData() {
  try {
    const result = await window.electronAPI.importAllData()
    if (result.success) {
      dataMessage.value = `成功导入 ${result.taskCount || 0} 个任务、${result.contactCount || 0} 个联系人`
      dataMsgType.value = 'success'
      await reloadSettings()
    } else {
      dataMessage.value = '导入失败: ' + (result.error || '未知错误')
      dataMsgType.value = 'error'
    }
    setTimeout(() => { dataMessage.value = '' }, 5000)
  } catch (err) {
    dataMessage.value = '导入失败: ' + err.message
    dataMsgType.value = 'error'
    window.$toast.error('导入数据失败')
    setTimeout(() => { dataMessage.value = '' }, 5000)
  }
}

async function resetSettings() {
  const confirmed = await window.$confirm({
    title: '恢复默认设置',
    message: '确定要将所有设置恢复为默认值吗？',
    detail: '此操作将重置所有个性化设置，任务数据不会受到影响。',
    type: 'warning',
    confirmText: '恢复'
  })
  if (!confirmed) return
  try {
    await window.electronAPI.resetSettings()
    dataMessage.value = '设置已恢复为默认值'
    dataMsgType.value = 'success'
    await reloadSettings()
    setTimeout(() => { dataMessage.value = '' }, 3000)
  } catch (err) {
    dataMessage.value = '重置失败: ' + err.message
    dataMsgType.value = 'error'
    window.$toast.error('重置设置失败')
  }
}

async function clearAllData() {
  const confirmed = await window.$confirm({
    title: '清空所有数据',
    message: '确定要清空所有数据吗？',
    detail: '此操作不可恢复，所有任务、联系人等数据将被永久删除！',
    type: 'danger',
    confirmText: '清空'
  })
  if (!confirmed) return
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
    window.$toast.error('清空数据失败')
    setTimeout(() => { dataMessage.value = '' }, 5000)
  }
}

async function reloadSettings() {
  try {
    const saved = await window.electronAPI.getSettings()
    if (saved) {
      const keys = ['general', 'sticky', 'screenshot', 'ocr', 'yolo', 'matching', 'shortcuts', 'reminder', 'cloudSync']
      keys.forEach(k => {
        if (saved[k]) Object.assign(settings[k], saved[k])
      })
    }
  } catch (err) {
    console.error('加载设置失败:', err)
    window.$toast.error('加载设置失败')
  }
}

onMounted(async () => {
  await reloadSettings()
  applyTheme(settings.general.theme)
  watchSystemTheme()
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

.setting-row input[type="text"],
.setting-row input[type="password"] {
  min-width: 180px;
}

.setting-row input[type="range"] {
  width: 140px;
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