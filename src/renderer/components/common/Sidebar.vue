<template>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <span class="brand-icon">📌</span>
      <span class="brand-text">ChaTask</span>
    </div>

    <nav class="sidebar-nav">
      <div
        v-for="item in navItems"
        :key="item.id"
        :class="['nav-item', { active: activeView === item.id }]"
        @click="$emit('navigate', item.id)"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
        <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-divider"></div>
      <div class="sidebar-user">
        <div class="user-avatar">👤</div>
        <span class="user-name">本地用户</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  activeView: { type: String, default: 'dashboard' },
  pendingCount: { type: Number, default: 0 },
  overdueCount: { type: Number, default: 0 }
})

defineEmits(['navigate'])

const navItems = computed(() => [
  { id: 'dashboard', icon: '📊', label: '任务看板' },
  { id: 'tasklist',  icon: '📋', label: '任务列表', badge: props.pendingCount || null },
  { id: 'contacts',  icon: '👥',  label: '联系人' },
  { id: 'taskviews', icon: '📅', label: '任务视图' },
  { id: 'settings',  icon: '⚙️',  label: '设置中心' },
  { id: 'guide',     icon: '📖',  label: '操作指引' }
])
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  height: 100%;
  background: var(--color-bg-sidebar);
  display: flex;
  flex-direction: column;
  color: var(--color-text-sidebar);
  overflow: hidden;
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 18px 16px;
}

.brand-icon {
  font-size: 22px;
}

.brand-text {
  font-size: var(--font-size-lg);
  font-weight: 700;
  color: var(--color-sidebar-brand-text);
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-base);
  position: relative;
}

.nav-item:hover {
  background: var(--color-bg-sidebar-hover);
}

.nav-item.active {
  background: var(--color-bg-sidebar-active);
  color: #fff;
}

.nav-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
}

.nav-badge {
  background: var(--color-danger);
  color: #fff;
  border-radius: 10px;
  padding: 1px 7px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

.nav-item.active .nav-badge {
  background: rgba(255, 255, 255, 0.3);
}

.sidebar-footer {
  padding: 10px;
}

.sidebar-divider {
  height: 1px;
  background: var(--color-sidebar-divider);
  margin-bottom: 10px;
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.sidebar-user:hover {
  background: var(--color-bg-sidebar-hover);
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-sidebar-avatar-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.user-name {
  font-size: var(--font-size-sm);
}
</style>