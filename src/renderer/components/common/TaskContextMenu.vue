<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="task-context-menu-overlay"
      @click="hideMenu"
      @contextmenu.prevent="hideMenu"
    >
      <div
        class="task-context-menu"
        :style="{ left: position.x + 'px', top: position.y + 'px' }"
        @click.stop
      >
        <template v-for="(item, index) in menuItems" :key="index">
          <div v-if="item.type === 'separator'" class="menu-separator"></div>
          <div
            v-else-if="item.visible !== false"
            class="menu-item"
            :class="{ disabled: item.disabled }"
            @click="handleClick(item)"
          >
            <span class="menu-icon">{{ item.icon }}</span>
            <span class="menu-label">{{ item.label }}</span>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: Boolean,
  position: Object,
  task: Object
})

const emit = defineEmits(['hide', 'action'])

function hideMenu() {
  emit('hide')
}

function handleClick(item) {
  if (item.disabled || item.action === undefined) return
  emit('action', { type: item.action, task: props.task, value: item.value })
  hideMenu()
}

const menuItems = computed(() => {
  const task = props.task
  if (!task) return []

  const isDeleted = task.is_deleted === 1
  const isCompleted = task.is_completed === 1
  const isOnDesktop = task.is_show_desk === 1

  return [
    // 详情
    {
      icon: '📋',
      label: '详情',
      action: 'detail',
      visible: !isDeleted
    },
    // 添加到桌面
    {
      icon: '📌',
      label: '添加到桌面',
      action: 'addToDesktop',
      visible: !isDeleted && !isOnDesktop && !isCompleted
    },
    // 从桌面隐藏
    {
      icon: '🙈',
      label: '从桌面隐藏',
      action: 'hideFromDesktop',
      visible: !isDeleted && isOnDesktop
    },
    { type: 'separator' },
    // 提醒设置
    {
      icon: '🔔',
      label: '提醒设置',
      action: 'reminder',
      visible: !isDeleted && !isCompleted
    },
    { type: 'separator' },
    // 恢复
    {
      icon: '🔄',
      label: '恢复',
      action: 'restore',
      visible: isDeleted
    },
    // 删除 / 彻底删除
    {
      icon: isDeleted ? '💣' : '🗑️',
      label: isDeleted ? '彻底删除' : '删除',
      action: isDeleted ? 'permanentDelete' : 'delete',
      visible: true
    }
  ]
})
</script>

<style scoped>
.task-context-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

.task-context-menu {
  position: absolute;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 160px;
  padding: 6px 0;
  font-size: var(--font-size-sm);
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.menu-item:hover:not(.disabled) {
  background: var(--color-primary-light);
}

.menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.menu-icon {
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.menu-label {
  flex: 1;
}

.menu-separator {
  height: 1px;
  background: var(--color-border-light);
  margin: 4px 8px;
}
</style>
