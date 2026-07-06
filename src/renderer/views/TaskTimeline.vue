<template>
  <div class="timeline-view">
    <div v-if="groups.length === 0" class="empty-state">
      <div class="empty-state-icon">📅</div>
      <p>暂无任务，试试截图创建任务吧~</p>
    </div>

    <div v-else class="timeline-list">
      <div v-for="group in groups" :key="group.label" class="timeline-group">
        <div class="timeline-group-header">
          <span class="group-dot" :style="{ background: group.color }"></span>
          <span class="group-label">{{ group.label }}</span>
          <span class="group-count">{{ group.tasks.length }}</span>
        </div>

        <div class="timeline-items">
          <div v-for="task in group.tasks" :key="task.id" class="timeline-item">
            <div class="timeline-line">
              <div class="line-dot" :style="{ background: getPriorityColor(task.priority) }"></div>
              <div class="line-connector"></div>
            </div>

            <div class="timeline-card card" @contextmenu="showContextMenu($event, task)">
              <div class="timeline-card-left">
                <img :src="task.sender_avatar || defaultAvatar" class="timeline-avatar" />
              </div>
              <div class="timeline-card-body">
                <div class="timeline-card-header">
                  <strong>{{ task.sender_name || '未知' }}</strong>
                  <span :class="['tag', getPriorityTag(task.priority)]">{{ priorityText(task.priority) }}</span>
                  <span v-if="task.status === 'overdue'" class="tag tag-overdue">逾期</span>
                  <span v-if="task.status === 'in_progress'" class="tag tag-medium">进行中</span>
                </div>
                <div class="timeline-card-content">{{ task.content }}</div>
                <div class="timeline-card-footer">
                  <span v-if="task.due_date" class="timeline-due">
                    ⏰ {{ formatDueDate(task.due_date) }}
                  </span>
                  <span class="timeline-source">
                    🕐 {{ formatDate(task.created_at) }}
                  </span>
                </div>
              </div>
              <div class="timeline-card-actions">
                <button class="btn btn-xs btn-outline" @click="createSticky(task)">📌 便签</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

const allTasks = ref([])

function showContextMenu(event, task) {
  event.preventDefault()
  event.stopPropagation()
  window.electronAPI.showTaskContextMenu(task.id, event.clientX, event.clientY, 'timeline')
}

const groups = computed(() => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfterTomorrow = new Date(today); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + (7 - today.getDay()))
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const buckets = {
    overdue: { label: '已逾期', color: '#FF4D4F', tasks: [] },
    today: { label: '今天', color: '#FAAD14', tasks: [] },
    tomorrow: { label: '明天', color: '#1890FF', tasks: [] },
    thisWeek: { label: '本周', color: '#52C41A', tasks: [] },
    thisMonth: { label: '本月', color: '#722ED1', tasks: [] },
    later: { label: '更晚', color: '#86909C', tasks: [] },
    noDue: { label: '未设置截止日期', color: '#C0C4CC', tasks: [] }
  }

  allTasks.value.forEach(task => {
    if (task.status === 'overdue') {
      buckets.overdue.tasks.push(task)
      return
    }
    if (!task.due_date) {
      buckets.noDue.tasks.push(task)
      return
    }
    const due = new Date(task.due_date)
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())

    if (dueDay < today) {
      buckets.overdue.tasks.push(task)
    } else if (dueDay.getTime() === today.getTime()) {
      buckets.today.tasks.push(task)
    } else if (dueDay.getTime() === tomorrow.getTime()) {
      buckets.tomorrow.tasks.push(task)
    } else if (dueDay <= weekEnd) {
      buckets.thisWeek.tasks.push(task)
    } else if (dueDay <= monthEnd) {
      buckets.thisMonth.tasks.push(task)
    } else {
      buckets.later.tasks.push(task)
    }
  })

  return Object.values(buckets).filter(b => b.tasks.length > 0)
})

function getPriorityColor(p) {
  switch (p) {
    case 'high': return '#CF1322'
    case 'medium': return '#D46B08'
    case 'low': return '#389E0D'
    default: return '#C0C4CC'
  }
}

function getPriorityTag(p) {
  switch (p) {
    case 'high': return 'tag-high'
    case 'medium': return 'tag-medium'
    case 'low': return 'tag-low'
    default: return ''
  }
}

function priorityText(p) {
  switch (p) {
    case 'high': return '高'
    case 'medium': return '中'
    case 'low': return '低'
    default: return ''
  }
}

function formatDueDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

async function loadTasks() {
  try {
    const [normal, completed] = await Promise.all([
      window.electronAPI.getAllTasks(),
      window.electronAPI.getCompletedTasks()
    ])
    allTasks.value = [...normal, ...completed].filter(t => t.is_completed !== 1)
  } catch (err) {
    console.error('加载任务时间轴失败:', err)
    window.$toast.error('加载任务时间轴失败')
  }
}

async function createSticky(task) {
  const content = `[${task.sender_name || '未知'}] ${task.content}`
  if (task.sender_avatar) {
    await window.electronAPI.createStickyNote({ content, avatar: task.sender_avatar, taskId: task.id })
    await window.electronAPI.updateTask(task.id, { is_show_desk: 1 })
    await loadTasks()
  }
}

let unregisterRefresh = null

onMounted(async () => {
  await loadTasks()

  if (window.electronAPI && window.electronAPI.onRefreshTaskList) {
    unregisterRefresh = window.electronAPI.onRefreshTaskList(loadTasks)
  }
})

onUnmounted(() => {
  if (unregisterRefresh) {
    unregisterRefresh()
  }
})
</script>

<style scoped>
.timeline-view {
  max-width: 720px;
  margin: 0 auto;
}

.timeline-group {
  margin-bottom: 24px;
}

.timeline-group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-left: 8px;
}

.group-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.group-label {
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.group-count {
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: var(--font-size-sm);
}

.timeline-items {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  min-height: 60px;
}

.timeline-line {
  width: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.line-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 20px;
  flex-shrink: 0;
}

.line-connector {
  width: 2px;
  flex: 1;
  background: var(--color-border-light);
  margin: 4px 0;
}

.timeline-item:last-child .line-connector {
  display: none;
}

.timeline-card {
  flex: 1;
  margin-left: 8px;
  margin-bottom: 8px;
  padding: 14px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.timeline-card-left {
  flex-shrink: 0;
}

.timeline-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.timeline-card-body {
  flex: 1;
  min-width: 0;
}

.timeline-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.timeline-card-header strong {
  font-size: var(--font-size-base);
}

.timeline-card-content {
  font-size: var(--font-size-base);
  line-height: 1.6;
  margin-bottom: 6px;
  word-break: break-all;
}

.timeline-card-footer {
  display: flex;
  gap: 12px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.timeline-due {
  color: var(--color-primary);
}

.timeline-card-actions {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>