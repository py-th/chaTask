<template>
  <div class="calendar-view">
    <div class="calendar-header">
      <button class="btn btn-sm btn-outline" @click="prevMonth">◀</button>
      <h3>{{ currentYear }}年 {{ currentMonth + 1 }}月</h3>
      <button class="btn btn-sm btn-outline" @click="nextMonth">▶</button>
      <button class="btn btn-sm btn-outline" @click="goToday">今天</button>
    </div>

    <div class="calendar-grid">
      <div v-for="day in weekdayLabels" :key="day" class="calendar-weekday">{{ day }}</div>

      <div
        v-for="(cell, idx) in calendarCells"
        :key="idx"
        :class="['calendar-cell', {
          today: cell.isToday,
          'other-month': !cell.isCurrentMonth,
          'has-tasks': cell.tasks.length > 0,
          expired: cell.hasExpired
        }]"
        @click="cell.tasks.length > 0 && selectDay(cell)"
      >
        <div class="cell-date">{{ cell.day }}</div>
        <div v-if="cell.tasks.length > 0" class="cell-avatars">
          <img
            v-for="(task, i) in cell.tasks.slice(0, 3)"
            :key="task.id"
            :src="task.sender_avatar || defaultAvatar"
            :class="['cell-avatar', i > 0 ? 'avatar-stack' : '']"
            :style="{ zIndex: 3 - i }"
            :title="task.sender_name"
          />
          <span v-if="cell.tasks.length > 3" class="cell-more">+{{ cell.tasks.length - 3 }}</span>
        </div>
      </div>
    </div>

    <div v-if="selectedDay" class="day-detail-panel card">
      <div class="day-detail-header">
        <h4>{{ selectedDay.dateStr }} 的任务</h4>
        <button class="btn btn-xs btn-outline" @click="selectedDay = null">✕</button>
      </div>
      <div v-if="selectedDay.tasks.length === 0" class="empty-state">
        <p>当天没有任务</p>
      </div>
      <div v-else class="day-tasks">
        <div v-for="task in selectedDay.tasks" :key="task.id" class="day-task-item" @contextmenu="showContextMenu($event, task)">
          <img :src="task.sender_avatar || defaultAvatar" class="day-task-avatar" />
          <div class="day-task-info">
            <strong>{{ task.sender_name || '未知' }}</strong>: {{ task.content }}
          </div>
          <span :class="['tag', getPriorityTag(task.priority)]">{{ priorityText(task.priority) }}</span>
          <button class="btn btn-xs btn-outline" @click="createSticky(task)">📌</button>
        </div>
      </div>
    </div>

    <TaskContextMenu
      :visible="contextMenuVisible"
      :position="contextMenuPosition"
      :task="contextMenuTask"
      @hide="hideContextMenu"
      @action="handleContextMenuAction"
    />
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import TaskContextMenu from '../components/common/TaskContextMenu.vue'

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

// 右键菜单状态
const contextMenuVisible = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const contextMenuTask = ref(null)

function showContextMenu(event, task) {
  event.preventDefault()
  contextMenuTask.value = task
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuVisible.value = true
}

function hideContextMenu() {
  contextMenuVisible.value = false
  contextMenuTask.value = null
}

async function handleContextMenuAction({ type, task }) {
  switch (type) {
    case 'detail':
      await loadTasks()
      break
    case 'addToDesktop':
      await contextCreateSticky(task)
      break
    case 'hideFromDesktop':
      await contextHideSticky(task)
      break
    case 'reminder':
      // 提醒设置 - 调用重复提醒对话框
      window.electronAPI.openReminderDialog(task.id)
      break
    case 'restore':
      await contextRestoreTask(task)
      break
    case 'delete':
      await contextSoftDeleteTask(task)
      break
    case 'permanentDelete':
      await contextPermanentDeleteTask(task)
      break
  }
}

async function contextCreateSticky(task) {
  const content = `[${task.sender_name || '未知'}] ${task.content}`
  if (task.sender_avatar) {
    await window.electronAPI.createStickyNote({ content, avatar: task.sender_avatar, taskId: task.id })
    await window.electronAPI.updateTask(task.id, { is_show_desk: 1 })
    await loadTasks()
  }
}

async function contextHideSticky(task) {
  await window.electronAPI.updateTask(task.id, { is_show_desk: 0 })
  window.electronAPI.send('hide-note', { id: task.id, taskId: task.id })
  await loadTasks()
}

async function contextRestoreTask(task) {
  await window.electronAPI.updateTask(task.id, { is_deleted: 0 })
  await loadTasks()
}

async function contextSoftDeleteTask(task) {
  const confirmed = await window.$confirm({
    title: '确认删除',
    message: '确定要删除这个任务吗？',
    detail: '删除后任务将移动到回收站，您可以在回收站中恢复。',
    type: 'warning',
    confirmText: '删除'
  })
  if (!confirmed) return
  await window.electronAPI.updateTask(task.id, { is_deleted: 1, is_show_desk: 0 })
  await loadTasks()
}

async function contextPermanentDeleteTask(task) {
  const confirmed = await window.$confirm({
    title: '确认彻底删除',
    message: '确定要彻底删除这个任务吗？',
    detail: '此操作不可恢复，请谨慎操作！',
    type: 'danger',
    confirmText: '彻底删除'
  })
  if (!confirmed) return
  await window.electronAPI.deleteTask(task.id)
  await loadTasks()
}

const today = new Date()
const currentYear = ref(today.getFullYear())
const currentMonth = ref(today.getMonth())
const selectedDay = ref(null)

const taskMap = ref({})
const allTasks = ref([])

const calendarCells = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      day,
      dateStr,
      isCurrentMonth: false,
      isToday: false,
      hasExpired: false,
      tasks: taskMap.value[dateStr] || []
    })
  }

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const tasks = taskMap.value[dateStr] || []
    cells.push({
      day,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      hasExpired: tasks.some(t => t.status === 'overdue'),
      tasks
    })
  }

  const remaining = 42 - cells.length
  for (let day = 1; day <= remaining; day++) {
    const dateStr = `${year}-${String(month + 2).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      day,
      dateStr,
      isCurrentMonth: false,
      isToday: false,
      hasExpired: false,
      tasks: taskMap.value[dateStr] || []
    })
  }

  return cells
})

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  } else {
    currentMonth.value--
  }
  selectedDay.value = null
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  } else {
    currentMonth.value++
  }
  selectedDay.value = null
}

function goToday() {
  currentYear.value = today.getFullYear()
  currentMonth.value = today.getMonth()
  selectedDay.value = null
}

function selectDay(cell) {
  selectedDay.value = cell
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

async function createSticky(task) {
  const content = `[${task.sender_name || '未知'}] ${task.content}`
  if (task.sender_avatar) {
    await window.electronAPI.createStickyNote({ content, avatar: task.sender_avatar, taskId: task.id })
    await window.electronAPI.updateTask(task.id, { is_show_desk: 1 })
  }
}

function buildTaskMap() {
  const map = {}
  allTasks.value.forEach(task => {
    if (task.due_date) {
      const dateStr = task.due_date.slice(0, 10)
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(task)
    }
  })
  taskMap.value = map
}

onMounted(async () => {
  try {
    const [normal] = await Promise.all([
      window.electronAPI.getAllTasks()
    ])
    allTasks.value = normal.filter(t => t.is_completed !== 1)
    buildTaskMap()
  } catch (err) {
    console.error('加载日历数据失败:', err)
    window.$toast.error('加载日历数据失败')
  }
})
</script>

<style scoped>
.calendar-view {
  max-width: 820px;
  margin: 0 auto;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
}

.calendar-header h3 {
  font-size: var(--font-size-xl);
  min-width: 140px;
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.calendar-weekday {
  text-align: center;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 8px 0;
}

.calendar-cell {
  aspect-ratio: 1;
  padding: 6px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  cursor: default;
  transition: all var(--transition-fast);
  display: flex;
  flex-direction: column;
  min-height: 80px;
}

.calendar-cell.other-month {
  opacity: 0.35;
}

.calendar-cell.today {
  border-color: var(--color-primary);
  background: rgba(74, 144, 217, 0.06);
}

.calendar-cell.today .cell-date {
  background: var(--color-primary);
  color: #fff;
}

.calendar-cell.has-tasks {
  cursor: pointer;
}

.calendar-cell.has-tasks:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

.calendar-cell.expired .cell-date {
  color: var(--color-danger);
}

.cell-date {
  font-size: var(--font-size-sm);
  font-weight: 600;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-bottom: 4px;
}

.cell-avatars {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
}

.cell-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--color-bg-card);
}

.avatar-stack {
  margin-left: -8px;
}

.cell-more {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-left: 2px;
}

.day-detail-panel {
  margin-top: 16px;
  padding: 16px;
}

.day-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.day-detail-header h4 {
  font-size: var(--font-size-base);
}

.day-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.day-task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-light);
}

.day-task-item:last-child {
  border-bottom: none;
}

.day-task-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.day-task-info {
  flex: 1;
  font-size: var(--font-size-sm);
}
</style>