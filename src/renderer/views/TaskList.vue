<template>
  <div class="tasklist-view">
    <div class="tasklist-toolbar">
      <div class="toolbar-search">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="搜索任务内容、发送者..."
          @input="onSearchInput"
        />
      </div>
      <div class="toolbar-actions">
        <select v-model="sortBy" @change="loadTasks">
          <option value="created_at_desc">创建时间(新→旧)</option>
          <option value="created_at_asc">创建时间(旧→新)</option>
          <option value="due_date_asc">截止日期(近→远)</option>
          <option value="due_date_desc">截止日期(远→近)</option>
        </select>
      </div>
    </div>

    <div class="quick-filters">
      <button
        v-for="f in quickFilters"
        :key="f.key"
        :class="['btn btn-sm', currentFilter === f.key ? 'btn-primary' : 'btn-outline']"
        @click="setFilter(f.key)"
      >
        {{ f.label }}
        <span class="filter-count">({{ getFilterCount(f.key) }})</span>
      </button>
    </div>

    <div class="tasklist-body">
      <div v-if="filteredTasks.length === 0" class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p>{{ searchKeyword ? '没有匹配的任务' : '暂无任务，试试截图吧~' }}</p>
      </div>

      <div v-else class="task-items">
        <div
          v-for="task in filteredTasks"
          :key="task.id"
          :class="['task-card', 'card', { selected: selectedIds.has(task.id), deleted: task.is_deleted === 1 }]"
        >
          <div class="task-card-main">
            <input
              type="checkbox"
              :checked="selectedIds.has(task.id)"
              @change="toggleSelect(task.id)"
              class="task-checkbox"
            />
            <img :src="task.sender_avatar || defaultAvatar" class="task-avatar" />
            <div class="task-card-info">
              <div class="task-card-text">
                <strong>{{ task.sender_name || '未知' }}</strong>: {{ task.content }}
              </div>
              <div class="task-card-meta">
                <span :class="getStatusTag(task)">{{ statusText(task.status) }}</span>
                <span :class="getPriorityTag(task)">{{ priorityText(task.priority) }}</span>
                <span v-if="task.due_date">📅 截止: {{ formatDate(task.due_date) }}</span>
                <span>🕐 {{ formatDate(task.created_at) }}</span>
                <span v-if="task.reminder_enabled === 1">🔔 已提醒</span>
              </div>
            </div>
            <div class="task-card-actions">
              <template v-if="currentFilter === 'deleted'">
                <button class="btn btn-sm btn-success" @click="restoreTask(task)">🔄 恢复</button>
                <button class="btn btn-sm btn-danger" @click="permanentDelete(task)">💣 彻底删除</button>
              </template>
              <template v-else-if="currentFilter === 'desktop'">
                <button class="btn btn-sm btn-outline" @click="removeFromDesktop(task)">📤 移除桌面</button>
              </template>
              <template v-else>
                <button class="btn btn-sm btn-outline" @click="createSticky(task)">📌 便签</button>
              </template>
              <button class="btn btn-sm btn-outline" @click="openDetail(task)">详情</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedIds.size > 0" class="batch-bar">
      <span>已选择 {{ selectedIds.size }} 项</span>
      <template v-if="currentFilter === 'deleted'">
        <button class="btn btn-sm btn-success" @click="batchRestore">🔄 批量恢复</button>
        <button class="btn btn-sm btn-danger" @click="batchPermanentDelete">💣 彻底删除</button>
      </template>
      <template v-else-if="currentFilter === 'desktop'">
        <button class="btn btn-sm btn-outline" @click="batchRemoveFromDesktop">📤 移除桌面</button>
      </template>
      <template v-else>
        <button class="btn btn-sm btn-outline" @click="batchComplete">✅ 批量完成</button>
        <button class="btn btn-sm btn-danger" @click="batchDelete">🗑️ 批量删除</button>
        <button class="btn btn-sm btn-outline" @click="batchSetPriority('high')">🔴 高优先</button>
        <button class="btn btn-sm btn-outline" @click="batchSetPriority('medium')">🟡 中优先</button>
      </template>
      <button class="btn btn-sm btn-outline" @click="clearSelection">取消选择</button>
    </div>

    <div v-if="showDetail" class="detail-overlay" @click.self="showDetail = false">
      <div class="detail-panel card">
        <div class="detail-header">
          <h3>任务详情</h3>
          <button class="btn btn-sm btn-outline" @click="showDetail = false">✕</button>
        </div>
        <div v-if="detailTask" class="detail-body">
          <div class="detail-row">
            <label>发送者</label>
            <span>{{ detailTask.sender_name || '未知' }}</span>
          </div>
          <div class="detail-row">
            <label>内容</label>
            <span>{{ detailTask.content }}</span>
          </div>
          <div class="detail-row">
            <label>优先级</label>
            <select v-model="detailTask.priority" @change="saveDetail">
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
              <option value="none">无</option>
            </select>
          </div>
          <div class="detail-row">
            <label>状态</label>
            <select v-model="detailTask.status" @change="saveDetail">
              <option value="pending">待办</option>
              <option value="in_progress">进行中</option>
              <option value="completed">完成</option>
              <option value="overdue">逾期</option>
            </select>
          </div>
          <div class="detail-row">
            <label>截止日期</label>
            <input type="date" :value="detailTask.due_date ? detailTask.due_date.slice(0,10) : ''" @change="setDueDate" />
          </div>
          <div class="detail-row">
            <label>创建时间</label>
            <span>{{ detailTask.created_at }}</span>
          </div>
          <div class="detail-row">
            <label>消息时间</label>
            <span>{{ detailTask.source_time || '无' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

const allTasks = ref([])
const currentFilter = ref('all')
const searchKeyword = ref('')
const sortBy = ref('created_at_desc')
const selectedIds = ref(new Set())
const showDetail = ref(false)
const detailTask = ref(null)
let desktopUpdateTimer = null

const quickFilters = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待办' },
  { key: 'in_progress', label: '进行中' },
  { key: 'overdue', label: '逾期' },
  { key: 'high', label: '高优先' },
  { key: 'completed', label: '已完成' },
  { key: 'desktop', label: '桌面便签' },
  { key: 'deleted', label: '回收站' }
]

function getFilterCount(key) {
  switch (key) {
    case 'all': return allTasks.value.length
    case 'pending': return allTasks.value.filter(t => t.status === 'pending').length
    case 'in_progress': return allTasks.value.filter(t => t.status === 'in_progress').length
    case 'overdue': return allTasks.value.filter(t => t.status === 'overdue').length
    case 'high': return allTasks.value.filter(t => t.priority === 'high').length
    case 'completed': return allTasks.value.filter(t => t.is_completed === 1).length
    case 'desktop': return allTasks.value.filter(t => t.is_show_desk === 1 && t.is_deleted !== 1).length
    case 'deleted': return allTasks.value.filter(t => t.is_deleted === 1).length
    default: return 0
  }
}

const filteredTasks = computed(() => {
  let tasks = [...allTasks.value]

  switch (currentFilter.value) {
    case 'pending': tasks = tasks.filter(t => t.status === 'pending'); break
    case 'in_progress': tasks = tasks.filter(t => t.status === 'in_progress'); break
    case 'overdue': tasks = tasks.filter(t => t.status === 'overdue'); break
    case 'high': tasks = tasks.filter(t => t.priority === 'high'); break
    case 'completed': tasks = tasks.filter(t => t.is_completed === 1); break
    case 'desktop': tasks = tasks.filter(t => t.is_show_desk === 1 && t.is_deleted !== 1); break
    case 'deleted': tasks = tasks.filter(t => t.is_deleted === 1); break
  }

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    tasks = tasks.filter(t =>
      (t.content && t.content.toLowerCase().includes(kw)) ||
      (t.sender_name && t.sender_name.toLowerCase().includes(kw))
    )
  }

  switch (sortBy.value) {
    case 'created_at_asc': tasks.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)); break
    case 'due_date_asc': tasks.sort((a, b) => (a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1); break
    case 'due_date_desc': tasks.sort((a, b) => (a.due_date || '') < (b.due_date || '') ? 1 : -1); break
    default: tasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); break
  }

  return tasks
})

function setFilter(key) {
  currentFilter.value = key
  selectedIds.value.clear()
  if (key === 'desktop') {
    startDesktopWatch()
  } else {
    stopDesktopWatch()
  }
}

function onSearchInput() {
  selectedIds.value.clear()
}

async function loadTasks() {
  try {
    const [normal, completed, deleted] = await Promise.all([
      window.electronAPI.getAllTasks(),
      window.electronAPI.getCompletedTasks(),
      window.electronAPI.getDeletedTasks()
    ])
    allTasks.value = [...normal, ...completed, ...deleted]
  } catch (err) {
    console.error('加载任务失败:', err)
  }
}

function startDesktopWatch() {
  stopDesktopWatch()
  desktopUpdateTimer = setInterval(async () => {
    if (currentFilter.value === 'desktop') {
      await loadTasks()
    }
  }, 2000)
}

function stopDesktopWatch() {
  if (desktopUpdateTimer) {
    clearInterval(desktopUpdateTimer)
    desktopUpdateTimer = null
  }
}

function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function clearSelection() {
  selectedIds.value = new Set()
}

async function batchComplete() {
  const completedAt = new Date().toISOString();
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { status: 'completed', is_completed: 1, is_show_desk: 0, completed_at: completedAt })
    } catch (e) { console.error(e) }
  }
  clearSelection()
  await loadTasks()
}

async function batchDelete() {
  if (!confirm(`确定要删除选中的 ${selectedIds.value.size} 个任务吗？`)) return
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { is_deleted: 1, is_show_desk: 0 })
    } catch (e) { console.error(e) }
  }
  clearSelection()
  await loadTasks()
}

async function batchSetPriority(priority) {
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { priority })
    } catch (e) { console.error(e) }
  }
  clearSelection()
  await loadTasks()
}

async function batchRestore() {
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { is_deleted: 0 })
    } catch (e) { console.error(e) }
  }
  clearSelection()
  await loadTasks()
}

async function batchPermanentDelete() {
  if (!confirm(`确定要彻底删除选中的 ${selectedIds.value.size} 个任务吗？此操作不可恢复！`)) return
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.deleteTask(id)
    } catch (e) { console.error(e) }
  }
  clearSelection()
  await loadTasks()
}

async function batchRemoveFromDesktop() {
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { is_show_desk: 0 })
    } catch (e) { console.error(e) }
  }
  clearSelection()
  await loadTasks()
}

async function restoreTask(task) {
  try {
    await window.electronAPI.updateTask(task.id, { is_deleted: 0 })
    await loadTasks()
  } catch (e) { console.error(e) }
}

async function permanentDelete(task) {
  if (!confirm('确定要彻底删除这个任务吗？此操作不可恢复！')) return
  try {
    await window.electronAPI.deleteTask(task.id)
    await loadTasks()
  } catch (e) { console.error(e) }
}

async function removeFromDesktop(task) {
  try {
    await window.electronAPI.updateTask(task.id, { is_show_desk: 0 })
    await loadTasks()
  } catch (e) { console.error(e) }
}

async function createSticky(task) {
  const content = `[${task.sender_name || '未知'}] ${task.content}`
  if (task.sender_avatar) {
    await window.electronAPI.createStickyNote({ content, avatar: task.sender_avatar, taskId: task.id })
    await window.electronAPI.updateTask(task.id, { is_show_desk: 1 })
  }
}

function openDetail(task) {
  detailTask.value = { ...task }
  showDetail.value = true
}

async function saveDetail() {
  if (!detailTask.value) return
  try {
    const { id, priority, status } = detailTask.value
    const updates = { priority, status }
    if (status === 'completed') {
      updates.is_completed = 1
      updates.is_show_desk = 0
      updates.completed_at = new Date().toISOString()
    } else {
      updates.is_completed = 0
    }
    await window.electronAPI.updateTask(id, updates)
    await loadTasks()
  } catch (e) { console.error(e) }
}

async function setDueDate(e) {
  if (!detailTask.value) return
  detailTask.value.due_date = e.target.value
  await window.electronAPI.updateTask(detailTask.value.id, { due_date: e.target.value })
  await loadTasks()
}

function statusText(s) {
  switch (s) {
    case 'pending': return '待办'
    case 'in_progress': return '进行中'
    case 'completed': return '完成'
    case 'overdue': return '逾期'
    default: return s
  }
}

function priorityText(p) {
  switch (p) {
    case 'high': return '高优先'
    case 'medium': return '中优先'
    case 'low': return '低优先'
    default: return '无'
  }
}

function getStatusTag(task) {
  if (task.is_completed === 1) return 'tag tag-done'
  if (task.status === 'overdue') return 'tag tag-overdue'
  if (task.status === 'in_progress') return 'tag tag-medium'
  return 'tag'
}

function getPriorityTag(task) {
  switch (task.priority) {
    case 'high': return 'tag tag-high'
    case 'medium': return 'tag tag-medium'
    case 'low': return 'tag tag-low'
    default: return 'tag'
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

let unregisterRefresh = null

onMounted(() => {
  loadTasks()
  // 监听任务列表刷新事件
  if (window.electronAPI && window.electronAPI.onRefreshTaskList) {
    unregisterRefresh = window.electronAPI.onRefreshTaskList(loadTasks)
  }
})

onUnmounted(() => {
  stopDesktopWatch()
  // 移除事件监听
  if (unregisterRefresh) {
    unregisterRefresh()
  }
})
</script>

<style scoped>
.tasklist-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tasklist-toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.toolbar-search {
  flex: 1;
}

.toolbar-search input {
  width: 100%;
}

.toolbar-actions select {
  min-width: 180px;
}

.quick-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-count {
  font-size: var(--font-size-xs);
  opacity: 0.7;
}

.tasklist-body {
  flex: 1;
  min-height: 300px;
}

.task-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-card {
  padding: 12px;
  transition: all var(--transition-fast);
}

.task-card:hover {
  box-shadow: var(--shadow-md);
}

.task-card.selected {
  border-color: var(--color-primary);
  background: rgba(74, 144, 217, 0.04);
}

.task-card.deleted {
  opacity: 0.6;
}

.task-card-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.task-checkbox {
  margin-top: 10px;
}

.task-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.task-card-info {
  flex: 1;
  min-width: 0;
}

.task-card-text {
  margin-bottom: 6px;
  line-height: 1.5;
  word-break: break-all;
}

.task-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.task-card-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.batch-bar {
  position: sticky;
  bottom: 0;
  background: var(--color-primary);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: var(--shadow-md);
  z-index: 10;
}

.batch-bar .btn-outline {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.5);
}

.batch-bar .btn-outline:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: #fff;
}

.detail-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.detail-panel {
  width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.detail-row select,
.detail-row input {
  width: 100%;
}
</style>
