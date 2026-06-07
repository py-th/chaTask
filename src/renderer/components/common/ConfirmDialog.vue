<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="confirm-dialog-overlay" @click="handleOverlayClick">
        <div class="confirm-dialog" :class="[`confirm-dialog--${type}`]" @click.stop>
          <div class="confirm-dialog__header">
            <span class="confirm-dialog__icon">{{ icon }}</span>
            <h3 class="confirm-dialog__title">{{ title }}</h3>
          </div>
          <div class="confirm-dialog__body">
            <p class="confirm-dialog__message">{{ message }}</p>
            <p v-if="detail" class="confirm-dialog__detail">{{ detail }}</p>
          </div>
          <div class="confirm-dialog__footer">
            <button
              class="confirm-dialog__btn confirm-dialog__btn--cancel"
              @click="handleCancel"
            >
              {{ cancelText }}
            </button>
            <button
              class="confirm-dialog__btn confirm-dialog__btn--confirm"
              :class="[`confirm-dialog__btn--${type}`]"
              @click="handleConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'

const visible = ref(false)
const title = ref('确认')
const message = ref('')
const detail = ref('')
const type = ref('warning')
const confirmText = ref('确认')
const cancelText = ref('取消')

let resolvePromise = null

const iconMap = {
  warning: '⚠️',
  danger: '💣',
  info: 'ℹ️',
  success: '✅'
}

const icon = computed(() => iconMap[type.value] || iconMap.warning)

function show(options = {}) {
  title.value = options.title || '确认'
  message.value = options.message || ''
  detail.value = options.detail || ''
  type.value = options.type || 'warning'
  confirmText.value = options.confirmText || '确认'
  cancelText.value = options.cancelText || '取消'
  visible.value = true

  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

function handleConfirm() {
  visible.value = false
  if (resolvePromise) {
    resolvePromise(true)
    resolvePromise = null
  }
}

function handleCancel() {
  visible.value = false
  if (resolvePromise) {
    resolvePromise(false)
    resolvePromise = null
  }
}

function handleOverlayClick() {
  handleCancel()
}

defineExpose({ show })
</script>

<style scoped>
.confirm-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  backdrop-filter: blur(2px);
}

.confirm-dialog {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 360px;
  max-width: 480px;
  padding: 24px;
  animation: dialogSlideIn 0.2s ease-out;
}

@keyframes dialogSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.confirm-dialog__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.confirm-dialog__icon {
  font-size: 24px;
}

.confirm-dialog__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.confirm-dialog__body {
  margin-bottom: 24px;
}

.confirm-dialog__message {
  font-size: var(--font-size-base);
  color: var(--color-text);
  line-height: 1.6;
  margin: 0 0 8px 0;
  white-space: pre-line;
}

.confirm-dialog__detail {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
  white-space: pre-line;
}

.confirm-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.confirm-dialog__btn {
  padding: 8px 20px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
  outline: none;
}

.confirm-dialog__btn--cancel {
  background: var(--color-bg);
  color: var(--color-text);
  border-color: var(--color-border-light);
}

.confirm-dialog__btn--cancel:hover {
  background: var(--color-border-light);
}

.confirm-dialog__btn--confirm {
  background: var(--color-primary);
  color: white;
}

.confirm-dialog__btn--confirm:hover {
  background: var(--color-primary-dark);
}

.confirm-dialog__btn--danger {
  background: var(--color-danger);
}

.confirm-dialog__btn--danger:hover {
  background: #dc2626;
}

/* 过渡动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-active .confirm-dialog,
.dialog-fade-leave-active .confirm-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.dialog-fade-enter-from .confirm-dialog,
.dialog-fade-leave-to .confirm-dialog {
  opacity: 0;
  transform: translateY(-20px) scale(0.95);
}
</style>
