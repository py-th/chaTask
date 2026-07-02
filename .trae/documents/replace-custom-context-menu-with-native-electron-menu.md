# 将主程序右键菜单迁移为原生 Electron Menu 实现

## 一、概述

当前主进程已经提供了原生任务右键菜单（`src/main/menus/taskContextMenu.js`）和 IPC 入口（`src/main/ipc/taskContextMenu.js`），但渲染进程的 4 个主视图仍在使用旧的自定义 Vue 右键菜单组件 `TaskContextMenu.vue` 与 composable `useTaskContextMenu.js`。

本计划的目标是把 `TaskList.vue`、`TaskTimeline.vue`、`TaskCalendar.vue`、`TaskQuadrant.vue` 全部切换为调用原生 Electron Menu，并清理旧的组件/组合式函数文件。

## 二、现状分析

### 已完成（无需改动）

- `src/main/menus/taskContextMenu.js`：原生菜单构建类，支持 详情/添加到桌面/从桌面隐藏/复制文本/提醒设置/恢复/删除/彻底删除。
- `src/main/ipc/taskContextMenu.js`：注册 `show-task-context-menu` 事件。
- `src/main/ipc/index.js`：已注册 `registerTaskContextMenuHandlers`。
- `src/preload/index.js`：已暴露 `showTaskContextMenu`、`onOpenTaskDetail`、`onOpenTaskReminderDialog`。
- `src/renderer/App.vue`：已订阅 `open-task-reminder-dialog` 并打开提醒设置窗口。

### 仍使用旧实现（需要改动）

- `src/renderer/views/TaskList.vue`
  - 仍 `import TaskContextMenu from '../components/common/TaskContextMenu.vue'`
  - 模板中仍有 `<TaskContextMenu ... />`
  - 仍维护 `contextMenuVisible`、`contextMenuPosition`、`contextMenuTask` 等状态与 `handleContextMenuAction`
  - `showContextMenu` 需要改为调用 `window.electronAPI.showTaskContextMenu`
  - 需要新增监听主进程 `open-task-detail` 事件，用于打开本视图详情面板

- `src/renderer/views/TaskTimeline.vue`、`src/renderer/views/TaskCalendar.vue`、`src/renderer/views/TaskQuadrant.vue`
  - 同样仍使用 `<TaskContextMenu>` 与相关状态/处理函数
  - 需要改为调用原生菜单，并订阅 `refresh-task-list` 以在菜单操作后刷新列表
  - 视图专属的上下文处理函数（`contextCreateSticky`、`contextHideSticky`、`contextRestoreTask`、`contextSoftDeleteTask`、`contextPermanentDeleteTask`）可删除

### 待删除文件

- `src/renderer/components/common/TaskContextMenu.vue`
- `src/renderer/composables/useTaskContextMenu.js`

## 三、具体改动方案

### 1. TaskList.vue

- **移除导入**：删除 `import TaskContextMenu from '../components/common/TaskContextMenu.vue'`。
- **移除模板**：删除 `<TaskContextMenu ... />` 组件调用。
- **移除状态与函数**：删除以下代码块：
  - `contextMenuVisible`、`contextMenuPosition`、`contextMenuTask`
  - `showContextMenu(event, task)` 的旧实现
  - `hideContextMenu()`
  - `handleContextMenuAction({ type, task })`
  - 仅被旧菜单调用的辅助函数：`softDeleteTask`、`restoreTask`、`permanentDelete`、`removeFromDesktop`、`copyTaskText`、`createSticky`
- **新增原生菜单调用**：在 `@contextmenu` 处改为：

  ```js
  function showContextMenu(event, task) {
    event.preventDefault()
    event.stopPropagation()
    window.electronAPI.showTaskContextMenu(task.id, event.clientX, event.clientY, 'tasklist')
  }
  ```

- **新增详情事件监听**：

  ```js
  let unregisterOpenDetail = null

  onMounted(() => {
    loadTasks()
    if (window.electronAPI && window.electronAPI.onRefreshTaskList) {
      unregisterRefresh = window.electronAPI.onRefreshTaskList(loadTasks)
    }
    if (window.electronAPI && window.electronAPI.onOpenTaskDetail) {
      unregisterOpenDetail = window.electronAPI.onOpenTaskDetail(openDetail)
    }
  })

  onUnmounted(() => {
    stopDesktopWatch()
    if (unregisterRefresh) unregisterRefresh()
    if (unregisterOpenDetail) unregisterOpenDetail()
  })
  ```

  > `openDetail(task)` 已存在，可直接复用。

### 2. TaskTimeline.vue

- **移除导入**：删除 `TaskContextMenu` 导入。
- **移除模板**：删除 `<TaskContextMenu ... />`。
- **移除状态与函数**：删除 `contextMenuVisible`、`contextMenuPosition`、`contextMenuTask`、`showContextMenu`、`hideContextMenu`、`handleContextMenuAction`，以及 `contextCreateSticky`、`contextHideSticky`、`contextRestoreTask`、`contextSoftDeleteTask`、`contextPermanentDeleteTask`。
- **新增原生菜单调用**：

  ```js
  function showContextMenu(event, task) {
    event.preventDefault()
    event.stopPropagation()
    window.electronAPI.showTaskContextMenu(task.id, event.clientX, event.clientY, 'timeline')
  }
  ```

- **保留并修复 `createSticky(task)`**：该函数仍被“📌 便签”按钮使用。改为：

  ```js
  async function createSticky(task) {
    const content = `[${task.sender_name || '未知'}] ${task.content}`
    if (task.sender_avatar) {
      await window.electronAPI.createStickyNote({ content, avatar: task.sender_avatar, taskId: task.id })
      await window.electronAPI.updateTask(task.id, { is_show_desk: 1 })
      await loadTasks()
    }
  }
  ```

- **新增生命周期监听**：导入 `onUnmounted`，在 `onMounted` 中订阅 `refresh-task-list`：

  ```js
  let unregisterRefresh = null

  onMounted(async () => {
    // ...原有加载逻辑...
    if (window.electronAPI && window.electronAPI.onRefreshTaskList) {
      unregisterRefresh = window.electronAPI.onRefreshTaskList(loadTasks)
    }
  })

  onUnmounted(() => {
    if (unregisterRefresh) unregisterRefresh()
  })
  ```

### 3. TaskCalendar.vue

- 改动与 `TaskTimeline.vue` 基本一致：
  - 删除 `TaskContextMenu` 相关代码。
  - `showContextMenu` 改为调用 `window.electronAPI.showTaskContextMenu(task.id, event.clientX, event.clientY, 'calendar')`。
  - 删除 `contextCreateSticky`、`contextHideSticky`、`contextRestoreTask`、`contextSoftDeleteTask`、`contextPermanentDeleteTask`。
  - 保留 `createSticky(task)` 按钮处理函数，并补充 `updateTask({ is_show_desk: 1 })` 与 `loadTasks()`。
  - 在 `onMounted` 中订阅 `refresh-task-list`，在 `onUnmounted` 中取消订阅。

### 4. TaskQuadrant.vue

- 删除 `TaskContextMenu` 相关代码。
- `showContextMenu` 改为调用 `window.electronAPI.showTaskContextMenu(task.id, event.clientX, event.clientY, 'quadrant')`。
- 删除 `contextCreateSticky`、`contextHideSticky`、`contextRestoreTask`、`contextSoftDeleteTask`、`contextPermanentDeleteTask`。
- 在 `onMounted` 中订阅 `refresh-task-list`，在 `onUnmounted` 中取消订阅。

### 5. 删除旧文件

- 确认上述 4 个视图不再引用后，删除：
  - `src/renderer/components/common/TaskContextMenu.vue`
  - `src/renderer/composables/useTaskContextMenu.js`

## 四、假设与决策

1. **视图标识**：向主进程传递的 `view` 参数分别使用 `'tasklist'`、`'timeline'`、`'calendar'`、`'quadrant'`，与现有 `buildMenu(task, view)` 的分支逻辑保持一致。
2. **详情面板**：只有 `TaskList.vue` 具有任务详情弹窗，因此仅在该视图监听 `open-task-detail`；其他视图点击“详情”时主进程只发送 `refresh-task-list`，保持与旧行为一致。
3. **刷新机制**：依赖主进程菜单操作完成后广播 `refresh-task-list`，各视图通过 `onRefreshTaskList` 重新加载数据，避免在渲染进程重复维护删除/恢复逻辑。
4. **按钮保留**：`TaskTimeline.vue` 与 `TaskCalendar.vue` 中的“📌 便签”按钮保留，但补齐 `is_show_desk: 1` 更新与 `loadTasks()` 刷新，使状态即时生效。
5. **复制文本**：复制操作完全交给主进程原生菜单处理，渲染进程不再保留 `copyTaskText`。

## 五、验证步骤

1. **编译与启动**：运行 `npm run dev`（或项目等价命令），确认无编译错误。
2. **任务列表视图**：
   - 在任务卡片上右键，确认弹出系统原生菜单。
   - 测试“详情”是否打开详情面板。
   - 测试“添加到桌面 / 从桌面隐藏”后，任务卡片上的 📌 标记与桌面便签同步变化。
   - 测试“复制文本”后剪贴板内容正确。
   - 测试“提醒设置”打开提醒对话框。
   - 在回收站任务上测试“恢复”与“彻底删除”。
   - 在正常任务上测试“删除”后任务进入回收站并关闭桌面便签。
3. **时间轴 / 日历 / 四象限视图**：
   - 右键任务卡片弹出原生菜单。
   - 测试删除、恢复、添加到桌面/隐藏后，对应视图数据自动刷新。
4. **清理检查**：
   - 确认 `src/renderer/components/common/TaskContextMenu.vue` 与 `src/renderer/composables/useTaskContextMenu.js` 已删除。
   - 全局搜索 `TaskContextMenu` 与 `useTaskContextMenu`，确认无残留引用。
5. **回归测试**：截图创建新任务后，主程序各视图仍正常显示；桌面便签右键菜单不受本次改动影响。
