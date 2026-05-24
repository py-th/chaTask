<template>
  <div class="quadrant-view">
    <div class="quadrant-grid">
      <div
        v-for="q in quadrants"
        :key="q.id"
        :class="['quadrant', q.id]"
        @dragover.prevent
        @dragenter.prevent="onDragEnter($event, q.id)"
        @dragleave="onDragLeave($event)"
        @drop="onDrop($event, q.id)"
      >
        <div class="quadrant-header">
          <span class="quadrant-icon">{{ q.icon }}</span>
          <div class="quadrant-info">
            <h4>{{ q.label }}</h4>
            <span class="quadrant-desc">{{ q.desc }}</span>
          </div>
          <span class="quadrant-count">{{ q.tasks.length }}</span>
        </div>

        <div class="quadrant-body">
          <div
            v-for="task in q.tasks"
            :key="task.id"
            class="quadrant-task"
            draggable="true"
            @dragstart="onDragStart($event, task)"
            @dragend="onDragEnd"
          >
            <img :src="task.sender_avatar || defaultAvatar" class="qt-avatar" />
            <div class="qt-content">
              <div class="qt-text">
                <strong>{{ task.sender_name || '未知' }}</strong>: {{ task.content }}
              </div>
              <div class="qt-meta">
                <span v-if="task.due_date" class="qt-due">⏰ {{ formatDue(task.due_date) }}</span>
                <span v-else class="qt-no-due">未设截止</span>
                <span :class="['tag', getPriorityTag(task.priority)]">{{ priorityText(task.priority) }}</span>
              </div>
            </div>
          </div>

          <div v-if="q.tasks.length === 0" class="quadrant-empty">
            <span>拖拽任务到此处</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

const allTasks = ref([])
const draggingTask = ref(null)
const dragOverQuadrant = ref(null)

const quadrantDefs = [
  { id: 'q1', label: '重要且紧急', desc: '立即处理', icon: '🔴', color: '#FF4D4F' },
  { id: 'q2', label: '重要不紧急', desc: '计划安排', icon: '🟠', color: '#FAAD14' },
  { id: 'q3', label: '不重要不紧急', desc: '尽量减少', icon: '🟢', color: '#52C41A' },
  { id: 'q4', label: '紧急不重要', desc: '委派他人', icon: '🔵', color: '#1890FF' }
]

function isUrgent(task) {
  if (task.status === 'overdue') return true
  if (!task.due_date) return false
  const due = new Date(task.due_date)
  const now = new Date()
  const diffHours = (due - now) / (1000 * 60 * 60)
  return diffHours <= 24
}

function isImportant(task) {
  return task.priority === 'high'
}

function getQuadrant(task) {
  const urgent = isUrgent(task)
  const important = isImportant(task)

  if (important && urgent) return 'q1'
  if (important && !urgent) return 'q2'
  if (!important && !urgent) return 'q3'
  return 'q4'
}

const quadrants = computed(() => {
  return quadrantDefs.map(def => ({
    ...def,
    tasks: allTasks.value.filter(t => {
      if (t.is_completed === 1 || t.is_deleted === 1) return false
      return getQuadrant(t) === def.id
    })
  }))
})

function onDragStart(e, task) {
  draggingTask.value = task
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', task.id)
}

function onDragEnd() {
  draggingTask.value = null
  dragOverQuadrant.value = null
}

function onDragEnter(e, quadrantId) {
  dragOverQuadrant.value = quadrantId
}

function onDragLeave(e) {
}

async function onDrop(e, quadrantId) {
  dragOverQuadrant.value = null
  if (!draggingTask.value) return

  const task = draggingTask.value
  let updates = {}

  switch (quadrantId) {
    case 'q1':
      updates = { priority: 'high', due_date: new Date(Date.now() + 3600000).toISOString() }
      break
    case 'q2':
      updates = { priority: 'high', due_date: task.due_date || new Date(Date.now() + 7 * 86400000).toISOString() }
      break
    case 'q3':
      updates = { priority: 'low', due_date: null }
      break
    case 'q4':
      updates = { priority: 'low', due_date: new Date(Date.now() + 3600000).toISOString() }
      break
  }

  try {
    await window.electronAPI.updateTask(task.id, updates)
    const idx = allTasks.value.findIndex(t => t.id === task.id)
    if (idx >= 0) {
      allTasks.value[idx] = { ...allTasks.value[idx], ...updates }
      allTasks.value = [...allTasks.value]
    }
  } catch (err) {
    console.error('更新任务失败:', err)
  }

  draggingTask.value = null
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

function formatDue(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(async () => {
  try {
    const [normal] = await Promise.all([
      window.electronAPI.getAllTasks()
    ])
    allTasks.value = normal.filter(t => t.is_completed !== 1 && t.is_deleted !== 1)
  } catch (err) {
    console.error('加载四象限数据失败:', err)
  }
})
</script>

<style scoped>
.quadrant-view {
  height: 100%;
}

.quadrant-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 12px;
  height: calc(100vh - var(--header-height) - var(--statusbar-height) - 120px);
  min-height: 460px;
}

.quadrant {
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border-light);
  background: var(--color-bg-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.quadrant.q1 { border-top: 3px solid #FF4D4F; }
.quadrant.q2 { border-top: 3px solid #FAAD14; }
.quadrant.q3 { border-top: 3px solid #52C41A; }
.quadrant.q4 { border-top: 3px solid #1890FF; }

.quadrant-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.quadrant-icon {
  font-size: 20px;
}

.quadrant-info {
  flex: 1;
}

.quadrant-info h4 {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin-bottom: 2px;
}

.quadrant-desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.quadrant-count {
  background: var(--color-bg);
  border-radius: 10px;
  padding: 2px 10px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
}

.quadrant-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quadrant-body::-webkit-scrollbar {
  width: 4px;
}

.quadrant-body::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 2px;
}

.quadrant-task {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  cursor: grab;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
}

.quadrant-task:hover {
  box-shadow: var(--shadow-sm);
  border-color: var(--color-border-light);
}

.quadrant-task:active {
  cursor: grabbing;
  opacity: 0.7;
}

.qt-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.qt-content {
  flex: 1;
  min-width: 0;
}

.qt-text {
  font-size: var(--font-size-sm);
  line-height: 1.4;
  margin-bottom: 4px;
  word-break: break-all;
}

.qt-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.qt-due {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
}

.qt-no-due {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.quadrant-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  border: 2px dashed var(--color-border-light);
  border-radius: var(--radius-sm);
  margin: 8px;
  min-height: 60px;
}
</style>