<template>
  <footer class="statusbar">
    <div class="statusbar-left">
      <span class="status-item">
        📌 总计 <strong>{{ total }}</strong>
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">
        ⏰ 待办 <strong>{{ pending }}</strong>
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">
        ⚠️ 逾期 <strong class="text-danger">{{ overdue }}</strong>
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">
        ✅ 今日完成 <strong>{{ todayCompleted }}</strong>
      </span>
    </div>
    <div class="statusbar-right">
      <span class="status-item" :class="{ synced: syncStatus === 'synced' }">
        {{ syncIcon }} {{ syncText }}
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">🖥️ {{ screenshotMode === 'shortcut' ? 'Ctrl+Alt+S 截图' : '剪贴板监听中' }}</span>
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  total: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  overdue: { type: Number, default: 0 },
  todayCompleted: { type: Number, default: 0 },
  syncStatus: { type: String, default: 'local' },
  screenshotMode: { type: String, default: 'shortcut' }
})

const syncIcon = computed(() => {
  switch (props.syncStatus) {
    case 'synced': return '☁️'
    case 'syncing': return '🔄'
    default: return '💻'
  }
})

const syncText = computed(() => {
  switch (props.syncStatus) {
    case 'synced': return '已同步'
    case 'syncing': return '同步中'
    default: return '本地模式'
  }
})
</script>

<style scoped>
.statusbar {
  height: var(--statusbar-height);
  min-height: var(--statusbar-height);
  background: var(--color-bg-card);
  border-top: 1px solid var(--color-border-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.statusbar-left,
.statusbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-sep {
  color: var(--color-border);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-item strong {
  color: var(--color-text);
}

.status-item .text-danger {
  color: var(--color-danger);
}

.status-item.synced {
  color: var(--color-success);
}
</style>