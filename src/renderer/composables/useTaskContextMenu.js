import { ref } from 'vue'

export function useTaskContextMenu() {
  const contextMenuVisible = ref(false)
  const contextMenuPosition = ref({ x: 0, y: 0 })
  const contextMenuTask = ref(null)

  function showContextMenu(event, task) {
    event.preventDefault()
    contextMenuTask.value = task
    contextMenuPosition.value = { x: event.clientX, y: event.clientY }
    contextMenuVisible.value = true
  }

  function hideContextMenu() {
    contextMenuVisible.value = false
    contextMenuTask.value = null
  }

  return {
    contextMenuVisible,
    contextMenuPosition,
    contextMenuTask,
    showContextMenu,
    hideContextMenu
  }
}
