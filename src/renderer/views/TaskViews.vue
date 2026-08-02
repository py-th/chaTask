<template>
  <div class="task-views">
    <div class="view-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['btn btn-sm', activeMode === tab.id ? 'btn-primary' : 'btn-outline']"
        @click="activeMode = tab.id"
      >
        <component :is="tab.icon" class="tab-icon" />
        {{ tab.label }}
      </button>
    </div>

    <div class="view-body">
      <TaskTimeline v-if="activeMode === 'timeline'" />
      <TaskCalendar v-else-if="activeMode === 'calendar'" />
      <TaskQuadrant v-else-if="activeMode === 'quadrant'" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { CalendarDays, Calendar, Target } from 'lucide-vue-next'
import TaskTimeline from './TaskTimeline.vue'
import TaskCalendar from './TaskCalendar.vue'
import TaskQuadrant from './TaskQuadrant.vue'

const tabs = [
  { id: 'timeline', icon: CalendarDays, label: '时间轴' },
  { id: 'calendar', icon: Calendar, label: '日历' },
  { id: 'quadrant', icon: Target, label: '四象限' }
]

const activeMode = ref('timeline')
</script>

<style scoped>
.task-views {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 12px;
}

.view-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.view-tabs .btn {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-icon {
  width: 14px;
  height: 14px;
}

.view-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
