<template>
  <div class="app-layout">
    <div class="app-body">
      <Sidebar
        :active-view="currentView"
        :pending-count="statusCounts.pending"
        :overdue-count="statusCounts.overdue"
        @navigate="switchView"
      />

      <div class="app-main">
        <div class="app-header">
          <div class="header-left">
            <span class="header-icon">{{ viewMeta.icon }}</span>
            <h2 class="header-title">{{ viewMeta.title }}</h2>
          </div>
          <div class="header-right">
            <span v-if="processing" class="processing-indicator">
              ⏳ AI模型分析中...
            </span>
            <button class="btn btn-primary btn-sm" @click="quickScreenshot">
              📸 截图识别
            </button>
          </div>
        </div>

        <div class="app-content">
          <component :is="currentComponent" :key="currentView" ref="currentViewRef" />

          <fieldset v-if="latestScreenshot" class="screenshot-preview card">
            <legend>截图预览：提取到 {{ lastResult.rawResults?.avatarText?.messageCount || 0 }} 条消息</legend>
            <img :src="latestScreenshot" style="max-width: 300px; max-height: 200px;" />
            <div v-if="lastResult" class="preview-stats">
              <p>头像/文本模型：{{ lastResult.rawDetections?.avatars || 0 }} 个头像，{{ lastResult.rawDetections?.texts || 0 }} 个文本框</p>
              <p>发送者/日期模型：{{ lastResult.rawResults?.senderDate?.senderCount || 0 }} 个发送者，{{ lastResult.rawResults?.senderDate?.dateCount || 0 }} 个日期</p>
              <p v-if="lastResult.screenshotInfo">来源窗口: {{ lastResult.screenshotInfo.windowName }}</p>
            </div>
          </fieldset>
        </div>
      </div>
    </div>

    <StatusBar
      :total="statusCounts.total"
      :pending="statusCounts.pending"
      :overdue="statusCounts.overdue"
      :today-completed="statusCounts.todayCompleted"
      :screenshot-mode="screenshotMode"
    />

    <ConfirmDialog ref="confirmDialogRef" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'

import Sidebar from './components/common/Sidebar.vue'
import StatusBar from './components/common/StatusBar.vue'
import ConfirmDialog from './components/common/ConfirmDialog.vue'
import Dashboard from './views/Dashboard.vue'
import TaskList from './views/TaskList.vue'
import TaskTimeline from './views/TaskTimeline.vue'
import TaskCalendar from './views/TaskCalendar.vue'
import TaskQuadrant from './views/TaskQuadrant.vue'
import ContactList from './views/ContactList.vue'
import Settings from './views/Settings.vue'
import Guide from './views/Guide.vue'

const viewComponents = {
  dashboard: Dashboard,
  tasklist: TaskList,
  timeline: TaskTimeline,
  calendar: TaskCalendar,
  quadrant: TaskQuadrant,
  contacts: ContactList,
  settings: Settings,
  guide: Guide
}

const viewMetaMap = {
  dashboard: { icon: '📊', title: '任务看板' },
  tasklist:  { icon: '📋', title: '任务列表' },
  timeline:  { icon: '📅', title: '任务时间轴' },
  calendar:  { icon: '🗓️', title: '任务日历' },
  quadrant:  { icon: '🎯', title: '任务四象限' },
  contacts:  { icon: '👥',  title: '联系人' },
  settings:  { icon: '⚙️',  title: '设置中心' },
  guide:     { icon: '📖',  title: '操作指引' }
}

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

const currentView = ref('dashboard')
const currentComponent = computed(() => viewComponents[currentView.value] || Dashboard)
const viewMeta = computed(() => viewMetaMap[currentView.value] || viewMetaMap.dashboard)
const confirmDialogRef = ref(null)

// 全局确认对话框方法
async function $confirm(options) {
  if (!confirmDialogRef.value) {
    console.error('ConfirmDialog 未挂载')
    return false
  }
  return await confirmDialogRef.value.show(options)
}

// 暴露到全局，方便各组件调用
window.$confirm = $confirm

const statusCounts = reactive({
  total: 0,
  pending: 0,
  overdue: 0,
  todayCompleted: 0
})

const screenshotMode = ref('shortcut')
const processing = ref(false)
const latestScreenshot = ref(null)
const lastResult = ref(null)

let unsubscribeIntegrated = null

function switchView(viewId) {
  currentView.value = viewId
}

async function quickScreenshot() {
  try {
    await window.electronAPI.startDoubleScreenshot()
  } catch (err) {
    console.error('启动截图失败:', err)
  }
}

async function refreshStatus() {
  try {
    const [allTasks, completedTasks] = await Promise.all([
      window.electronAPI.getAllTasks(),
      window.electronAPI.getCompletedTasks()
    ])
    const total = allTasks.length
    const pending = allTasks.filter(t => t.status === 'pending').length
    const overdue = allTasks.filter(t => t.status === 'overdue').length
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayCompleted = completedTasks.filter(t => {
      return t.created_at && t.created_at.slice(0, 10) === todayStr
    }).length

    Object.assign(statusCounts, { total, pending, overdue, todayCompleted })
  } catch (err) {
    console.error('刷新状态统计失败:', err)
  }
}

async function onIntegratedExtractionResult(data) {
  processing.value = false

  if (!data.success) {
    await window.$confirm({
      title: '识别失败',
      message: `原因: ${data.error || '模型未检测到有效内容'}`,
      detail: '建议: 确保截图包含完整的聊天信息',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
    return
  }

  lastResult.value = data
  if (data.localImageBase64) {
    latestScreenshot.value = `data:image/png;base64,${data.localImageBase64}`
  }

  if (!data.messages || data.messages.length === 0) {
    await window.$confirm({
      title: '识别失败',
      message: '未识别到有效的消息内容',
      detail: '请确保截图包含完整的聊天信息后重试',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
    return
  }

  for (const message of data.messages) {
    if (message.isNewContact) {
      try {
        await window.electronAPI.saveContact({
          name: message.senderName,
          avatarHash: message.avatarHash || '',
          avatarBase64: message.avatarBase64 || ''
        })
      } catch (err) {
        console.error('保存联系人失败:', err)
      }
    }
    await createTask(
      message.senderName,
      message.avatarBase64,
      message.text,
      message.confidence,
      message.direction,
      message.sourceTime
    )
  }
}

async function createTask(senderName, avatarBase64, displayContent, confidence, direction, sourceTime) {
  const task = {
    id: uuidv4(),
    content: displayContent.substring(0, 500),
    sourceTime: sourceTime || new Date().toISOString(),
    senderAvatar: avatarBase64,
    senderName: senderName,
    confidence: confidence,
    direction: direction,
    createdAt: new Date(),
    priority: 'none',
    status: 'pending',
    isShowDesk: 1
  }

  try {
    await window.electronAPI.saveTask(task)
    await refreshStatus()
    if (avatarBase64) {
      await window.electronAPI.createStickyNote({
        content: displayContent,
        avatar: avatarBase64 || defaultAvatar,
        taskId: task.id
      })
    }
  } catch (err) {
    console.error('创建任务失败:', err)
  }
}

let systemThemeListener = null

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

function watchSystemTheme(themeRef) {
  if (systemThemeListener) {
    systemThemeListener()
    systemThemeListener = null
  }
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (themeRef() === 'system') {
      applyTheme('system')
    }
  }
  mediaQuery.addEventListener('change', handler)
  systemThemeListener = () => mediaQuery.removeEventListener('change', handler)
}

onMounted(async () => {
  try {
    const settings = await window.electronAPI.getSettings()
    const theme = settings?.general?.theme || 'system'
    applyTheme(theme)
    watchSystemTheme(() => settings?.general?.theme || 'system')
  } catch (err) {
    applyTheme('system')
    watchSystemTheme(() => 'system')
  }

  await refreshStatus()

  unsubscribeIntegrated = window.electronAPI.onIntegratedExtractionResult((data) => {
    processing.value = true
    onIntegratedExtractionResult(data)
  })

  try {
    const screenshotConfig = await window.electronAPI.getScreenshotConfig()
    if (screenshotConfig) {
      screenshotMode.value = screenshotConfig.mode || 'shortcut'
    }
  } catch (err) {
    console.error('获取截图配置失败:', err)
  }
})

onUnmounted(() => {
  if (unsubscribeIntegrated) unsubscribeIntegrated()
  if (systemThemeListener) systemThemeListener()
})
</script>

<style>
@import './assets/styles/variables.css';
@import './assets/styles/common.css';
</style>

<style scoped>
.app-header {
  height: var(--header-height);
  min-height: var(--header-height);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-icon {
  font-size: 20px;
}

.header-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.processing-indicator {
  color: var(--color-info);
  font-size: var(--font-size-sm);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.screenshot-preview {
  margin-top: 16px;
  padding: 12px;
}

.screenshot-preview legend {
  font-weight: 600;
  padding: 0 8px;
}

.preview-stats {
  margin-top: 8px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.preview-stats p {
  margin: 2px 0;
}
</style>