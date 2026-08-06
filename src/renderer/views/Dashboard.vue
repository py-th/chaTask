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
        <h3 class="section-title"><BarChart3 class="section-icon" /> 任务优先级分布</h3>
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
        <h3 class="section-title"><MessageCircleCheck class="section-icon" /> 消息来源分布</h3>
        <div class="source-chart">
          <div v-for="item in sourceData" :key="item.label" class="source-bar-col">
            <span class="source-bar-count">{{ item.count }}</span>
            <div class="source-bar-wrapper">
              <div
                class="source-bar"
                :style="{ height: item.percent + '%', background: item.color }"
              ></div>
            </div>
            <span class="source-bar-label" :title="item.label">{{ item.label }}</span>
          </div>
          <div v-if="sourceData.length === 0" class="empty-state-small">暂无来源数据</div>
        </div>
      </div>

      <div class="card dashboard-section">
        <h3 class="section-title"><PieChart class="section-icon" /> 任务状态分布</h3>
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

    <div class="card dashboard-section trend-section">
      <h3 class="section-title"><TrendingUp class="section-icon" /> 近30天任务趋势</h3>
      <div class="trend-chart">
        <div class="trend-chart-body">
          <div class="trend-y-axis">
            <span v-for="(label, i) in trendYLabels" :key="i" class="trend-y-label">{{ label }}</span>
          </div>
          <div class="trend-chart-area">
            <svg class="trend-svg" :viewBox="`0 0 ${trendWidth} ${trendHeight}`" preserveAspectRatio="none">
              <defs>
                <linearGradient id="trendAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#4A90D9" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#4A90D9" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <template v-for="n in 3" :key="n">
                <line
                  :x1="trendPadding.left"
                  :y1="trendPadding.top + (trendHeight - trendPadding.top - trendPadding.bottom) * n / 4"
                  :x2="trendWidth - trendPadding.right"
                  :y2="trendPadding.top + (trendHeight - trendPadding.top - trendPadding.bottom) * n / 4"
                  stroke="var(--color-border-light)"
                  stroke-width="1"
                />
              </template>
              <line
                :x1="trendPadding.left"
                :y1="trendHeight - trendPadding.bottom"
                :x2="trendWidth - trendPadding.right"
                :y2="trendHeight - trendPadding.bottom"
                stroke="var(--color-text-secondary)"
                stroke-width="1"
              />
              <path :d="trendAreaPath" fill="url(#trendAreaGradient)" stroke="none" />
              <path :d="trendLinePath" fill="none" stroke="#4A90D9" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
              <circle
                v-for="(p, i) in trendPoints"
                :key="i"
                :cx="p.x"
                :cy="p.y"
                r="3"
                fill="#4A90D9"
              />
              <circle
                v-if="hoveredIndex !== null && trendPoints[hoveredIndex]"
                :cx="trendPoints[hoveredIndex].x"
                :cy="trendPoints[hoveredIndex].y"
                r="5"
                fill="#fff"
                stroke="#4A90D9"
                stroke-width="2"
              />
              <rect
                v-for="(p, i) in trendPoints"
                :key="'h-' + i"
                :x="p.x - trendPointSpacing / 2"
                y="0"
                :width="trendPointSpacing"
                :height="trendHeight"
                fill="transparent"
                @mouseenter="onTrendHover(i, $event)"
                @mousemove="onTrendMove($event)"
                @mouseleave="onTrendLeave"
              />
            </svg>
            <div class="trend-x-labels">
              <span v-for="(item, i) in trendXLabels" :key="i" class="trend-x-label">{{ item.label }}</span>
            </div>
          </div>
        </div>
        <div
          v-if="tooltipVisible"
          class="trend-tooltip"
          :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
        >
          <div class="trend-tooltip-date">{{ tooltipDate }}</div>
          <div class="trend-tooltip-count">{{ tooltipCount }} 条任务</div>
        </div>
      </div>
    </div>

    <div class="card dashboard-section">
      <h3 class="section-title"><CalendarCheck class="section-icon" /> 今日待办</h3>
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
              <span v-if="task.due_date"><CalendarCheck class="meta-icon" /> {{ formatDate(task.due_date) }}</span>
              <span v-if="task.status === 'overdue'" class="tag tag-overdue"><AlertTriangle class="meta-icon" /> 逾期</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { Clock, AlertTriangle, CheckCircle2, Pin, PartyPopper, BarChart3, PieChart, TrendingUp, CalendarCheck, MessageCircleCheck } from 'lucide-vue-next'
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

const sourceColors = ['#4A90D9', '#52C41A', '#FAAD14', '#F53F3F', '#722ED1', '#13C2C2']

const sourceData = computed(() => {
  const counts = {}
  tasks.value.forEach(t => {
    const s = (t.source || '').trim() || '其他'
    counts[s] = (counts[s] || 0) + 1
  })
  let items = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count], i) => ({ label, count, color: sourceColors[i % sourceColors.length] }))

  if (items.length > 6) {
    const top = items.slice(0, 5)
    const rest = items.slice(5)
    const restCount = rest.reduce((s, i) => s + i.count, 0)
    top.push({ label: '其他', count: restCount, color: '#86909C' })
    items = top
  }

  const max = Math.max(...items.map(i => i.count), 1)
  return items.map(item => ({ ...item, percent: Math.round((item.count / max) * 100) }))
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

const trendDays = 30
const trendWidth = 800
const trendHeight = 200
const trendPadding = { top: 10, bottom: 10, left: 0, right: 10 }

const hoveredIndex = ref(null)
const tooltipVisible = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
const tooltipDate = ref('')
const tooltipCount = ref(0)

const trendData = computed(() => {
  const result = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const count = tasks.value.filter(t => {
      const created = t.created_at || t.createdAt
      return created && created.slice(0, 10) === dateStr
    }).length
    result.push({
      date: d,
      dateStr,
      count,
      label: `${d.getMonth() + 1}/${d.getDate()}`
    })
  }
  return result
})

const trendPoints = computed(() => {
  const data = trendData.value
  const max = Math.max(...data.map(d => d.count), 1)
  const chartW = trendWidth - trendPadding.left - trendPadding.right
  const chartH = trendHeight - trendPadding.top - trendPadding.bottom
  return data.map((d, i) => ({
    x: trendPadding.left + (i / (data.length - 1)) * chartW,
    y: trendHeight - trendPadding.bottom - (d.count / max) * chartH
  }))
})

function monotoneCubicPath(points) {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  const n = points.length
  const ms = []
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    ms.push(dx === 0 ? 0 : dy / dx)
  }

  const ts = []
  ts.push(ms[0])
  for (let i = 1; i < n - 1; i++) {
    const m1 = ms[i - 1]
    const m2 = ms[i]
    if (m1 * m2 <= 0) {
      ts.push(0)
    } else {
      ts.push((m1 + m2) / 2)
    }
  }
  ts.push(ms[n - 2])

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    const dx = p1.x - p0.x
    const t0 = ts[i]
    const t1 = ts[i + 1]
    const cp1x = p0.x + dx / 3
    const cp1y = p0.y + t0 * dx / 3
    const cp2x = p1.x - dx / 3
    const cp2y = p1.y - t1 * dx / 3
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`
  }
  return d
}

const trendLinePath = computed(() => monotoneCubicPath(trendPoints.value))

const trendAreaPath = computed(() => {
  const points = trendPoints.value
  if (points.length === 0) return ''
  const bottomY = trendHeight - trendPadding.bottom
  const line = monotoneCubicPath(points)
  const first = points[0]
  const last = points[points.length - 1]
  return `${line} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`
})

const trendXLabels = computed(() => {
  const data = trendData.value
  const step = Math.ceil(data.length / 6)
  return data.filter((_, i) => i % step === 0 || i === data.length - 1)
})

const trendYLabels = computed(() => {
  const max = Math.max(...trendData.value.map(d => d.count), 1)
  return [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0]
})

const trendPointSpacing = computed(() => {
  const n = trendPoints.value.length
  const chartW = trendWidth - trendPadding.left - trendPadding.right
  return n > 1 ? chartW / (n - 1) : chartW
})

function updateTooltipPos(event) {
  tooltipX.value = event.clientX
  tooltipY.value = event.clientY
}

function onTrendHover(index, event) {
  hoveredIndex.value = index
  const data = trendData.value[index]
  if (data) {
    tooltipDate.value = `${data.date.getMonth() + 1}月${data.date.getDate()}日`
    tooltipCount.value = data.count
  }
  tooltipVisible.value = true
  updateTooltipPos(event)
}

function onTrendMove(event) {
  updateTooltipPos(event)
}

function onTrendLeave() {
  hoveredIndex.value = null
  tooltipVisible.value = false
}

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
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.dashboard-section {
  padding: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-base);
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--color-text);
}

.section-icon {
  width: 18px;
  height: 18px;
  color: var(--color-text-secondary);
}

.priority-bars {
  display: flex;
  flex-direction: column;
  gap: 25px;
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
  height: 16px;
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

.empty-state-small {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  padding: 12px 0;
}

.source-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  position: relative;
  height: 160px;
  gap: 8px;
  padding-bottom: 4px;
}

.source-chart .empty-state-small {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
}

.source-bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.source-bar-wrapper {
  width: 16px;
  height: 120px;
  display: flex;
  align-items: flex-end;
  background: var(--color-border-light);
  border-radius: 4px 4px 0 0;
  overflow: hidden;
}

.source-bar {
  width: 16px;
  border-radius: 4px 4px 0 0;
  transition: height 0.5s ease;
}

.source-bar-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-bar-count {
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.trend-section {
  width: 100%;
}

.trend-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trend-chart-body {
  display: flex;
  gap: 2px;
  align-items: stretch;
}

.trend-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  width: 18px;
  height: 180px;
  margin-top: 10px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.trend-y-label {
  line-height: 1;
}

.trend-chart-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.trend-svg {
  width: 100%;
  height: 200px;
  overflow: visible;
}

.trend-x-labels {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
}

.trend-x-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.trend-tooltip {
  position: fixed;
  pointer-events: none;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  transform: translate(-50%, -100%);
  margin-top: -8px;
  white-space: nowrap;
  box-shadow: var(--shadow-md);
}

.trend-tooltip-date {
  opacity: 0.85;
  margin-bottom: 2px;
}

.trend-tooltip-count {
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

.meta-icon {
  width: 12px;
  height: 12px;
  vertical-align: -2px;
}
</style>