<template>
  <div class="dashboard">
    <div class="stat-cards">
      <div class="stat-card card stat-pending">
        <Clock class="stat-icon" />
        <div class="stat-info">
          <div class="stat-value">{{ stats.pending }}</div>
          <div class="stat-label">待办</div>
        </div>
      </div>
      <div class="stat-card card stat-overdue">
        <AlertTriangle class="stat-icon" />
        <div class="stat-info">
          <div class="stat-value">{{ stats.overdue }}</div>
          <div class="stat-label">逾期</div>
        </div>
      </div>
      <div class="stat-card card stat-completed">
        <CheckCircle2 class="stat-icon" />
        <div class="stat-info">
          <div class="stat-value">{{ stats.completed }}</div>
          <div class="stat-label">完成</div>
        </div>
      </div>
      <div class="stat-card card stat-total">
        <Pin class="stat-icon" />
        <div class="stat-info">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总数</div>
        </div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card dashboard-section">
        <h3 class="section-title">任务优先级分布</h3>
        <div class="priority-bars">
          <div v-for="item in priorityData" :key="item.label" class="priority-bar-row">
            <span class="priority-label">{{ item.label }}</span>
            <div class="priority-bar-track">
              <div
                class="priority-bar-fill"
                :style="{ width: item.percent + '%', background: item.color }"
              ></div>
            </div>
            <span class="priority-count">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <div class="card dashboard-section">
        <h3 class="section-title">任务状态分布</h3>
        <div class="status-donut">
          <div class="donut-center">
            <span class="donut-value">{{ stats.total }}</span>
            <span class="donut-label">总计</span>
          </div>
          <svg viewBox="0 0 120 120" class="donut-svg">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border-light)" stroke-width="16" />
            <template v-for="(segment, i) in donutSegments" :key="i">
              <circle
                cx="60" cy="60" r="50"
                fill="none"
                :stroke="segment.color"
                stroke-width="16"
                :stroke-dasharray="`${segment.dash} ${100 - segment.dash}`"
                :stroke-dashoffset="segment.offset"
                transform="rotate(-90 60 60)"
              />
            </template>
          </svg>
        </div>
        <div class="donut-legend">
          <span v-for="item in statusData" :key="item.label" class="legend-item">
            <span class="legend-dot" :style="{ background: item.color }"></span>
            {{ item.label }} {{ item.count }}
          </span>
        </div>
      </div>
    </div>

    <div class="card dashboard-section">
      <h3 class="section-title">今日待办</h3>
      <div v-if="todayTasks.length === 0" class="empty-state">
        <PartyPopper class="empty-state-icon" />
        <p>今天没有待办任务</p>
      </div>
      <div v-else class="today-list">
        <div v-for="task in todayTasks" :key="task.id" class="today-item">
          <img :src="task.sender_avatar || defaultAvatar" class="today-avatar" />
          <div class="today-content">
            <div class="today-text">
              <strong>{{ task.sender_name || '未知' }}</strong>: {{ task.content }}
            </div>
            <div class="today-meta">
              <span :class="['tag', task.priority === 'high' ? 'tag-high' : task.priority === 'medium' ? 'tag-medium' : 'tag-low']">
                {{ priorityText(task.priority) }}
              </span>
              <span v-if="task.due_date">截止: {{ formatDate(task.due_date) }}</span>
              <span v-if="task.status === 'overdue'" class="tag tag-overdue">逾期</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { Clock, AlertTriangle, CheckCircle2, Pin, PartyPopper } from 'lucide-vue-next'
import { DEFAULT_AVATAR_SVG_45 } from '../shared/constants.js';
const defaultAvatar = DEFAULT_AVATAR_SVG_45;

const tasks = ref([])
const completedTasks = ref([])
const todayTasks = ref([])

const stats = reactive({
  total: 0,
  pending: 0,
  overdue: 0,
  completed: 0
})

const priorityData = computed(() => {
  const counts = { high: 0, medium: 0, low: 0, none: 0 }
  tasks.value.forEach(t => {
    const p = t.priority || 'none'
    if (counts[p] !== undefined) counts[p]++
  })
  const max = Math.max(Object.values(counts).reduce((a, b) => a + b, 0), 1)
  return [
    { label: '高', count: counts.high, color: '#CF1322', percent: Math.round((counts.high / max) * 100) },
    { label: '中', count: counts.medium, color: '#D46B08', percent: Math.round((counts.medium / max) * 100) },
    { label: '低', count: counts.low, color: '#389E0D', percent: Math.round((counts.low / max) * 100) },
    { label: '无', count: counts.none, color: '#86909C', percent: Math.round((counts.none / max) * 100) }
  ]
})

const statusData = computed(() => {
  const counts = { pending: 0, in_progress: 0, overdue: 0 }
  tasks.value.forEach(t => {
    if (counts[t.status] !== undefined) counts[t.status]++
  })
  return [
    { label: '待办', count: counts.pending, color: '#FAAD14' },
    { label: '进行中', count: counts.in_progress, color: '#1890FF' },
    { label: '逾期', count: counts.overdue, color: '#FF4D4F' }
  ]
})

const donutSegments = computed(() => {
  const items = statusData.value.filter(i => i.count > 0)
  const total = items.reduce((s, i) => s + i.count, 0) || 1
  let cumulative = 0
  return items.map(item => {
    const dash = (item.count / total) * 100
    const seg = { dash, color: item.color, offset: -cumulative }
    cumulative += dash
    return seg
  })
})

function priorityText(p) {
  switch (p) {
    case 'high': return '高优先'
    case 'medium': return '中优先'
    case 'low': return '低优先'
    default: return '无'
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

async function loadData() {
  try {
    const [all, completed] = await Promise.all([
      window.electronAPI.getAllTasks(),
      window.electronAPI.getCompletedTasks()
    ])
    tasks.value = all
    completedTasks.value = completed
    stats.total = all.length
    stats.pending = all.filter(t => t.status === 'pending').length
    stats.overdue = all.filter(t => t.status === 'overdue').length
    stats.completed = completed.length

    const today = new Date().toISOString().slice(0, 10)
    todayTasks.value = all.filter(t => {
      if (!t.due_date) return false
      return t.due_date.slice(0, 10) === today
    })
  } catch (err) {
    console.error('加载看板数据失败:', err)
    window.$toast.error('加载看板数据失败')
  }
}

onMounted(loadData)
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.stat-card {
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-left: 4px solid transparent;
}

.stat-pending { border-left-color: #FAAD14; }
.stat-overdue { border-left-color: #FF4D4F; }
.stat-completed { border-left-color: #52C41A; }
.stat-total { border-left-color: var(--color-primary); }

.stat-icon {
  width: 32px;
  height: 32px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  line-height: 1.2;
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.dashboard-section {
  padding: 20px;
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--color-text);
}

.priority-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.priority-bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.priority-label {
  width: 24px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.priority-bar-track {
  flex: 1;
  height: 8px;
  background: var(--color-border-light);
  border-radius: 4px;
  overflow: hidden;
}

.priority-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.priority-count {
  width: 28px;
  text-align: right;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.status-donut {
  display: flex;
  justify-content: center;
  position: relative;
  margin-bottom: 16px;
}

.donut-svg {
  width: 140px;
  height: 140px;
}

.donut-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.donut-value {
  display: block;
  font-size: var(--font-size-xl);
  font-weight: 700;
}

.donut-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.donut-legend {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.today-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.today-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-sm);
  border-bottom: 1px solid var(--color-border-light);
}

.today-item:last-child {
  border-bottom: none;
}

.today-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.today-content {
  flex: 1;
}

.today-text {
  margin-bottom: 4px;
  line-height: 1.5;
}

.today-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>