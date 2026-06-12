// 全局 Toast 事件总线
// 用于在任何地方触发 Toast 通知

class ToastEventBus {
  constructor() {
    this.listeners = []
  }

  on(callback) {
    this.listeners.push(callback)
    return () => {
      const index = this.listeners.indexOf(callback)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  emit(message, type = 'info') {
    this.listeners.forEach(callback => {
      try {
        callback(message, type)
      } catch (e) {
        console.error('Toast callback error:', e)
      }
    })
  }

  success(message) {
    this.emit(message, 'success')
  }

  error(message) {
    this.emit(message, 'error')
  }

  warning(message) {
    this.emit(message, 'warning')
  }

  info(message) {
    this.emit(message, 'info')
  }
}

export const toastBus = new ToastEventBus()

// 便捷函数，直接调用
export const toast = {
  success: (message) => toastBus.success(message),
  error: (message) => toastBus.error(message),
  warning: (message) => toastBus.warning(message),
  info: (message) => toastBus.info(message)
}
