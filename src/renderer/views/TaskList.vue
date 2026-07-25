<template>
  <div class="tasklist-view">
    <div class="tasklist-header">
      <div class="tasklist-toolbar">
        <div class="toolbar-search">
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="🔎搜索任务内容、发送者..."
            @input="onSearchInput"
          />
        </div>
        <div class="toolbar-actions">
          <select v-model="filterSource" @change="onSourceFilterChange">
            <option value="">全部来源</option>
            <option v-for="s in sourceOptions" :key="s.value" :value="s.value">{{ s.value }} ({{ s.count }})</option>
          </select>
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
          @contextmenu="showContextMenu($event, task)"
          @dblclick="openDetail(task)"
        >
          <div class="task-card-main">
            <input
              type="checkbox"
              :checked="selectedIds.has(task.id)"
              @change="toggleSelect(task.id)"
              @click.stop
              class="task-checkbox"
            />
            <div class="avatar-wrapper">
              <img :src="task.sender_avatar || defaultAvatar" class="task-avatar" />
              <span v-if="task.is_show_desk === 1" class="desktop-badge">📌</span>
            </div>
            <div class="task-card-info">
              <div class="task-card-text">
                <strong>{{ task.sender_name || '未知' }}</strong>: {{ task.content }}
              </div>
              <div class="task-card-meta">
                <span :class="getStatusTag(task)">{{ statusText(task.status) }}</span>
                <span :class="getPriorityTag(task)">{{ priorityText(task.priority) }}</span>
                <span v-if="task.reminderRule && formatNextReminder(task.reminderRule)" class="tag tag-pending">
                  {{ formatNextReminder(task.reminderRule) }}
                </span>
                <span v-else-if="task.reminder_enabled === 1 && task.reminder_time" class="tag tag-pending">
                  🔔 {{ formatDate(task.reminder_time) }}
                </span>
                <span class="tag tag-pending" v-if="task.is_show_desk === 1" >📌</span>
                <span class="tag tag-pending" v-if="task.source">{{ task.source }}</span>
                <span class="tag tag-pending" v-if="task.due_date">截止: {{ formatDate(task.due_date) }}</span>
                <span>创建: {{ formatDate(task.created_at) }}</span>
                <span v-if="task.source_time">消息时间: {{ formatDate(task.source_time) }}</span>
                <span v-if="task.status === 'completed' && task.completed_at">完成: {{ formatDate(task.completed_at) }}</span>
              </div>
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
        <button class="btn btn-sm btn-outline" @click="batchRemoveFromDesktop">� 批量隐藏</button>
      </template>
      <template v-else>
        <button class="btn btn-sm btn-outline" @click="batchComplete">✅ 批量完成</button>
        <button class="btn btn-sm btn-danger" @click="batchDelete">🗑️ 批量删除</button>
      </template>
      <button class="btn btn-sm btn-outline" @click="selectAll">☑️ 全选</button>
      <button class="btn btn-sm btn-outline" @click="invertSelection">🔃 反选</button>
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
            <div class="detail-sender-info">
              <img
                v-if="detailTask.sender_avatar"
                :src="detailTask.sender_avatar"
                class="detail-sender-avatar"
                alt=""
              />
              <span class="detail-sender-name">{{ detailTask.sender_name || '未知' }}</span>
              <span v-if="detailTask.source" class="detail-sender-source"> | {{ detailTask.source }}</span>
            </div>
          </div>
          <div class="detail-row detail-content-row">
            <div class="detail-row-header">
              <label>内容</label>
              <span v-if="editingDetailContent" class="detail-edit-hint">Ctrl+Enter 保存 · Esc 取消</span>
            </div>
            <div class="detail-content-wrapper" title="双击编辑">
              <div class="detail-content-scroll">
                <span
                  v-if="!editingDetailContent"
                  class="detail-content-text"
                  @dblclick="startEditContent"
                >{{ detailTask.content }}</span>
                <textarea
                  v-if="editingDetailContent"
                  ref="detailContentInput"
                  v-model="detailTask.content"
                  class="detail-content-input"
                  rows="3"
                  @blur="saveContentEdit"
                  @keydown.enter.ctrl="saveContentEdit"
                  @keydown.enter.meta="saveContentEdit"
                  @keydown.esc="cancelContentEdit"
                />
              </div>
            </div>
          </div>
          <div class="detail-meta-grid">
            <div class="detail-meta-item">
              <label>优先级</label>
              <select v-model="detailTask.priority" @change="saveDetail">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
                <option value="none">无</option>
              </select>
            </div>
            <div class="detail-meta-item">
              <label>状态</label>
              <select v-model="detailTask.status" @change="saveDetail">
                <option value="pending">待办</option>
                <option value="in_progress">进行中</option>
                <option value="completed">完成</option>
                <option value="overdue">逾期</option>
              </select>
            </div>
            <div class="detail-meta-item">
              <label>截止日期</label>
              <div class="date-picker-trigger" @click="openDueDatePicker">
                <span>{{ detailTask.due_date ? formatDate(detailTask.due_date) : '📅 未设置' }}</span>
                <input
                  ref="dueDateInput"
                  type="date"
                  style="position: fixed; opacity: 0; pointer-events: none; width: 0; height: 0;"
                  :value="detailTask.due_date ? detailTask.due_date.slice(0,10) : ''"
                  @change="setDueDate"
                />
              </div>
            </div>
            <div class="detail-meta-item">
              <label>提醒规则</label>
              <div v-if="detailTask.reminderRule" class="reminder-rule-info" @click="openReminderFromDetail">
                <span class="reminder-type">{{ formatReminderType(detailTask.reminderRule.repeat_type) }}</span>
                <span v-if="detailTask.reminderRule.reminder_time" class="reminder-time">
                  ⏰ {{ detailTask.reminderRule.reminder_time }}
                </span>
                <span class="reminder-edit-hint">点击修改</span>
              </div>
              <div v-else class="reminder-rule-info" @click="openReminderFromDetail">
                <span class="reminder-badge">🔕 未设置</span>
                <span class="reminder-edit-hint">点击设置</span>
              </div>
            </div>
            <div class="detail-meta-item">
              <label>创建时间</label>
              <span>{{ formatDateTime(detailTask.created_at) }}</span>
            </div>
            <div class="detail-meta-item">
              <label>更新时间</label>
              <span>{{ detailTask.updated_at ? formatDateTime(detailTask.updated_at) : '无' }}</span>
            </div>
            <div class="detail-meta-item">
              <label>消息时间</label>
              <span>{{ detailTask.source_time ? formatDateTime(detailTask.source_time) : '无' }}</span>
            </div>
            <div class="detail-meta-item">
              <label>完成时间</label>
              <span>{{ detailTask.completed_at ? formatDateTime(detailTask.completed_at) : '无' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { DEFAULT_AVATAR_SVG_45 } from '../shared/constants.js';
const defaultAvatar = DEFAULT_AVATAR_SVG_45;

const allTasks = ref([])
const currentFilter = ref('all')
const searchKeyword = ref('')
const sortBy = ref('created_at_desc')
const filterSource = ref('')
const selectedIds = ref(new Set())
const showDetail = ref(false)
const detailTask = ref(null)
const editingDetailContent = ref(false)
const detailContentInput = ref(null)
const dueDateInput = ref(null)
let desktopUpdateTimer = null

function showContextMenu(event, task) {
  event.preventDefault()
  event.stopPropagation()
  window.electronAPI.showTaskContextMenu(task.id, event.clientX, event.clientY, 'tasklist')
}

const quickFilters = [
  { key: 'all', label: '全部' },
  { key: 'desktop', label: '桌面便签' },
  { key: 'pending', label: '待办' },
  { key: 'in_progress', label: '进行中' },
  { key: 'overdue', label: '逾期' },
  { key: 'high', label: '高优先' },
  { key: 'completed', label: '已完成' },
  { key: 'deleted', label: '回收站' }
]

// 动态获取来源选项（包含数量）
const sourceOptions = computed(() => {
  const sources = new Set(allTasks.value.map(t => t.source).filter(Boolean))
  return Array.from(sources).map(s => ({
    value: s,
    count: allTasks.value.filter(t => t.source === s && t.is_deleted !== 1).length
  }))
})

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

  // 来源过滤（独立于状态过滤器）
  if (filterSource.value) {
    tasks = tasks.filter(t => t.source === filterSource.value)
  }

  // 回收站只显示已删除任务，其它过滤器排除已删除任务
  switch (currentFilter.value) {
    case 'deleted': tasks = tasks.filter(t => t.is_deleted === 1); break
    case 'desktop': tasks = tasks.filter(t => t.is_show_desk === 1 && t.is_deleted !== 1); break
    default:
      // 所有非回收站过滤器都排除已删除任务
      tasks = tasks.filter(t => t.is_deleted !== 1)
      switch (currentFilter.value) {
        case 'pending': tasks = tasks.filter(t => t.status === 'pending'); break
        case 'in_progress': tasks = tasks.filter(t => t.status === 'in_progress'); break
        case 'overdue': tasks = tasks.filter(t => t.status === 'overdue'); break
        case 'high': tasks = tasks.filter(t => t.priority === 'high'); break
        case 'completed': tasks = tasks.filter(t => t.is_completed === 1); break
      }
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

function onSourceFilterChange() {
  // 来源过滤通过 computed 属性自动处理
}

async function loadTasks() {
  try {
    const [normal, completed, deleted] = await Promise.all([
      window.electronAPI.getAllTasks(),
      window.electronAPI.getCompletedTasks(),
      window.electronAPI.getDeletedTasks()
    ])
    allTasks.value = [...normal, ...completed, ...deleted]

    // 如果详情面板打开，刷新详情中的提醒规则
    if (showDetail.value && detailTask.value) {
      try {
        const rule = await window.electronAPI.getReminderRule(detailTask.value.id)
        detailTask.value.reminderRule = rule || null
      } catch (e) {
        console.error('刷新提醒规则失败:', e)
      }
    }
  } catch (err) {
    console.error('加载任务失败:', err)
    window.$toast.error('加载任务失败')
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

function selectAll() {
  selectedIds.value = new Set(filteredTasks.value.map(t => t.id))
}

function invertSelection() {
  const newSet = new Set()
  for (const task of filteredTasks.value) {
    if (!selectedIds.value.has(task.id)) {
      newSet.add(task.id)
    }
  }
  selectedIds.value = newSet
}

async function batchComplete() {
  const completedAt = new Date().toISOString();
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { status: 'completed', is_completed: 1, is_show_desk: 0, completed_at: completedAt })
    } catch (e) {
      console.error(e)
      window.$toast.error('批量完成失败')
    }
  }
  clearSelection()
  await loadTasks()
}

async function batchDelete() {
  const confirmed = await window.$confirm({
    title: '确认批量删除',
    message: `确定要删除选中的 ${selectedIds.value.size} 个任务吗？`,
    detail: '删除后任务将移动到回收站，您可以在回收站中恢复。',
    type: 'warning',
    confirmText: '删除'
  })
  if (!confirmed) return
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { is_deleted: 1, is_show_desk: 0 })
      window.electronAPI.send('hide-note', { id, taskId: id })
    } catch (e) {
      console.error(e)
      window.$toast.error('批量删除失败')
    }
  }
  clearSelection()
  await loadTasks()
}

async function batchRestore() {
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { is_deleted: 0 })
    } catch (e) {
      console.error(e)
      window.$toast.error('批量恢复失败')
    }
  }
  clearSelection()
  await loadTasks()
}

async function batchPermanentDelete() {
  const confirmed = await window.$confirm({
    title: '确认彻底删除',
    message: `确定要彻底删除选中的 ${selectedIds.value.size} 个任务吗？`,
    detail: '此操作不可恢复，请谨慎操作！',
    type: 'danger',
    confirmText: '彻底删除'
  })
  if (!confirmed) return
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.deleteTask(id)
    } catch (e) {
      console.error(e)
      window.$toast.error('批量彻底删除失败')
    }
  }
  clearSelection()
  await loadTasks()
}

async function batchRemoveFromDesktop() {
  for (const id of selectedIds.value) {
    try {
      await window.electronAPI.updateTask(id, { is_show_desk: 0 })
      window.electronAPI.send('hide-note', { id: id, taskId: id })
    } catch (e) {
      console.error(e)
      window.$toast.error('批量移除桌面失败')
    }
  }
  clearSelection()
  await loadTasks()
}

async function openDetail(task) {
  detailTask.value = { ...task }
  showDetail.value = true
  // 加载提醒规则
  try {
    const rule = await window.electronAPI.getReminderRule(task.id)
    if (rule) {
      detailTask.value.reminderRule = rule
    }
  } catch (e) {
    console.error('加载提醒规则失败:', e)
  }
}

function openReminderFromDetail() {
  if (detailTask.value) {
    window.electronAPI.openReminderDialog(detailTask.value.id)
  }
}

function formatReminderType(type) {
  const typeMap = {
    'once': '单次提醒',
    'daily': '每天',
    'weekly': '每周',
    'monthly': '每月',
    'custom': '自定义'
  }
  return typeMap[type] || type
}

function calculateNextReminder(rule) {
  if (!rule || !rule.reminder_time) return null;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [hours, minutes] = rule.reminder_time.split(':').map(Number);

  const parseDateLocal = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };

  const startDate = rule.start_date ? parseDateLocal(rule.start_date) : null;

  switch (rule.repeat_type) {
    case 'once': {
      if (!rule.start_date) return null;
      const date = parseDateLocal(rule.start_date);
      date.setHours(hours, minutes, 0, 0);
      return date > now ? date : null;
    }

    case 'daily': {
      let nextDate = new Date(today);
      nextDate.setHours(hours, minutes, 0, 0);

      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 1);
      }

      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        if (nextDate < startDateTime) {
          nextDate = new Date(startDateTime);
        }
      }

      if (rule.end_date) {
        const endDate = parseDateLocal(rule.end_date);
        endDate.setHours(23, 59, 59, 999);
        if (nextDate > endDate) {
          return null;
        }
      }

      return nextDate;
    }

    case 'weekly': {
      let nextDate = new Date(today);
      nextDate.setHours(hours, minutes, 0, 0);

      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + (7 - nextDate.getDay() + 1) % 7 || 7);
      }

      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        if (nextDate < startDateTime) {
          const diffDays = Math.ceil((startDateTime.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
          const weeks = Math.ceil(diffDays / 7);
          nextDate.setDate(nextDate.getDate() + weeks * 7);
        }
      }

      if (rule.end_date) {
        const endDate = parseDateLocal(rule.end_date);
        endDate.setHours(23, 59, 59, 999);
        if (nextDate > endDate) {
          return null;
        }
      }

      return nextDate;
    }

    case 'monthly': {
      let nextDate = new Date(today.getFullYear(), today.getMonth(), 1);
      nextDate.setDate(Math.min(parseInt(rule.start_date?.split('-')[2] || 1), 28));
      nextDate.setHours(hours, minutes, 0, 0);

      if (nextDate <= now) {
        nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 1);
        nextDate.setDate(Math.min(parseInt(rule.start_date?.split('-')[2] || 1), 28));
        nextDate.setHours(hours, minutes, 0, 0);
      }

      if (startDate) {
        const startDateTime = new Date(startDate);
        startDateTime.setHours(hours, minutes, 0, 0);
        if (nextDate < startDateTime) {
          nextDate = new Date(startDateTime.getFullYear(), startDateTime.getMonth(), Math.min(startDateTime.getDate(), 28));
          nextDate.setHours(hours, minutes, 0, 0);
        }
      }

      if (rule.end_date) {
        const endDate = parseDateLocal(rule.end_date);
        endDate.setHours(23, 59, 59, 999);
        if (nextDate > endDate) {
          return null;
        }
      }

      return nextDate;
    }

    case 'custom': {
      if (!rule.custom_days || rule.custom_days.length === 0) return null;

      let nextDate = new Date(today);
      nextDate.setHours(hours, minutes, 0, 0);

      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 1);
      }

      const customDays = rule.custom_days.map(d => parseInt(d));
      let found = false;
      for (let i = 0; i < 365; i++) {
        if (customDays.includes(nextDate.getDay())) {
          found = true;
          break;
        }
        nextDate.setDate(nextDate.getDate() + 1);
      }

      if (!found) return null;

      if (startDate && nextDate < startDate) {
        return null;
      }

      if (rule.end_date) {
        const endDate = parseDateLocal(rule.end_date);
        endDate.setHours(23, 59, 59, 999);
        if (nextDate > endDate) {
          return null;
        }
      }

      return nextDate;
    }

    default:
      return null;
  }
}

function formatNextReminder(rule) {
  const nextTime = calculateNextReminder(rule);
  if (!nextTime) return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextMidnight = new Date(nextTime.getFullYear(), nextTime.getMonth(), nextTime.getDate());
  const diffDays = Math.round((nextMidnight.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));

  let dateText;
  if (diffDays === 0) {
    dateText = '今天';
  } else if (diffDays === 1) {
    dateText = '明天';
  } else if (diffDays === 2) {
    dateText = '后天';
  } else {
    dateText = `${nextTime.getMonth() + 1}月${nextTime.getDate()}日`;
  }

  const timeText = `${String(nextTime.getHours()).padStart(2, '0')}:${String(nextTime.getMinutes()).padStart(2, '0')}`;

  switch (rule.repeat_type) {
    case 'once':
      return `🔔 ${dateText} ${timeText}`;
    case 'daily':
      return `🔔 每天 ${timeText}`;
    case 'weekly':
      return `🔔 每周 ${dateText} ${timeText}`;
    case 'monthly':
      return `🔔 每月 ${dateText} ${timeText}`;
    case 'custom':
      return `🔔 自选 ${dateText} ${timeText}`;
    default:
      return `🔔 ${dateText} ${timeText}`;
  }
}

function formatReminderWay(way) {
  const wayMap = {
    'popup': '💬 弹窗',
    'sound': '🔊 声音',
    'silent': '🔇 静默'
  }
  return wayMap[way] || way
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
      updates.completed_at = null
    }
    await window.electronAPI.updateTask(id, updates)
    await loadTasks()
  } catch (e) {
    console.error(e)
    window.$toast.error('更新任务失败')
  }
}

function startEditContent() {
  editingDetailContent.value = true
  nextTick(() => {
    if (detailContentInput.value) {
      detailContentInput.value.focus()
    }
  })
}

async function saveContentEdit() {
  if (!detailTask.value) return
  const newContent = detailTask.value.content.trim()
  if (!newContent) {
    cancelContentEdit()
    return
  }
  try {
    await window.electronAPI.updateTask(detailTask.value.id, { content: newContent })
    editingDetailContent.value = false
    await loadTasks()
  } catch (e) {
    console.error('更新任务内容失败:', e)
    window.$toast.error('更新任务内容失败')
  }
}

function cancelContentEdit() {
  editingDetailContent.value = false
}

function openDueDatePicker() {
  const input = dueDateInput.value
  if (!input) return
  const trigger = input.parentElement
  if (trigger) {
    const rect = trigger.getBoundingClientRect()
    input.style.left = rect.left + 'px'
    input.style.top = (rect.bottom - 30) + 'px'
    input.style.width = rect.width + 'px'
    input.style.height = rect.height + 'px'
    // 强制刷新布局，避免第一次打开时位置未生效
    input.offsetHeight
  }
  input.showPicker?.()
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
  if (task.status === 'pending') return 'tag tag-pending'
  return 'tag'
}

function getPriorityTag(task) {
  switch (task.priority) {
    case 'high': return 'tag tag-high'
    case 'medium': return 'tag tag-medium'
    case 'low': return 'tag tag-low'
    default: return 'tag tag-pending'
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

let unregisterRefresh = null
let unregisterOpenDetail = null

onMounted(() => {
  loadTasks()
  // 监听任务列表刷新事件
  if (window.electronAPI && window.electronAPI.onRefreshTaskList) {
    unregisterRefresh = window.electronAPI.onRefreshTaskList(loadTasks)
  }
  // 监听主进程打开任务详情指令
  if (window.electronAPI && window.electronAPI.onOpenTaskDetail) {
    unregisterOpenDetail = window.electronAPI.onOpenTaskDetail(openDetail)
  }
})

onUnmounted(() => {
  stopDesktopWatch()
  // 移除事件监听
  if (unregisterRefresh) {
    unregisterRefresh()
  }
  if (unregisterOpenDetail) {
    unregisterOpenDetail()
  }
})
</script>

<style scoped>
.tasklist-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tasklist-header {
  position: sticky;
  top: -20px;
  z-index: 10;
  background: var(--color-bg);
  margin: -20px -20px 0;
  padding: 10px 20px 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--color-border-light);
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
  border-color: var(--color-primary-light);
}

.task-card.selected {
  border-color: var(--color-primary);
  background: rgba(74, 144, 217, 0.04);
  box-shadow: 0 0 0 2px var(--color-primary-light);
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
.avatar-wrapper {
  position: relative;
  flex-shrink: 0;
}

.task-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.desktop-badge {
  position: absolute;
  top: -1px;      /* 调整到顶部 */
  right: 0px;    /* 调整到右侧 */
  font-size: 7px;
  width: 10px;
  height: 10px;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
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
  max-height: 85vh;
  overflow-y: auto;
  padding: 20px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.detail-sender-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-sender-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.detail-sender-name {
  font-size: var(--font-size-base);
  color: var(--color-text);
}
.detail-sender-source {
  opacity: 0.3;
  font-size: var(--font-size-xs);
}

.detail-row select,
.detail-row input {
  width: 100%;
}

.detail-content-row {
  position: relative;
}

.detail-content-wrapper {
  width: 100%;
}

.detail-content-scroll {
  max-height: 150px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 8px;
  background: var(--color-bg-light);
  border-radius: var(--radius-sm);
}

.detail-content-scroll::-webkit-scrollbar {
  width: 6px;
}

.detail-content-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.detail-content-scroll::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.detail-content-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary);
}

.detail-content-text {
  cursor: text;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  line-height: 1.6;
  word-break: break-all;
  display: block;
}

.detail-content-text:hover {
  background: var(--color-border-light);
}

.detail-content-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-base);
  outline: none;
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
  line-height: 1.5;
}

.detail-row-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.detail-edit-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  pointer-events: none;
}

.detail-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-meta-item label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: 500;
}

.detail-meta-item select,
.detail-meta-item input {
  width: 100%;
}

.date-picker-trigger {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.date-picker-trigger:hover {
  border-color: var(--color-primary);
}

.reminder-rule-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--color-bg);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.reminder-rule-info:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.reminder-badge {
  font-size: var(--font-size-sm);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--color-border-light);
  color: var(--color-text-secondary);
}

.reminder-badge.active {
  background: #e6f7ff;
  color: #1890ff;
}

.reminder-type {
  font-size: var(--font-size-sm);
  color: var(--color-text);
}

.reminder-time {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.reminder-way {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  background: var(--color-border-light);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.reminder-edit-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-left: auto;
  opacity: 0.7;
}

.reminder-rule-info:hover .reminder-edit-hint {
  opacity: 1;
  color: var(--color-primary);
}
</style>
