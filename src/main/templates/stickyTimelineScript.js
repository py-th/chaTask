(function() {
  const electronAPI = window.electronAPI;
  if (!electronAPI) {
    console.error('electronAPI not found!');
    return;
  }
  console.log('Timeline sticky script loaded');

  const noteId = window.noteId;
  const senderName = window.senderName;
  let tasksData = window.tasksData || [];

  // 拖拽相关
  let isDragging = false;

  document.addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    // 如果点击的是可编辑文本或提醒图标，不触发拖拽
    if (e.target.closest('.task-text') || e.target.closest('.meta-badge.reminder')) return;
    isDragging = true;
    electronAPI.send('start-sticky-drag', noteId, e.screenX, e.screenY);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    electronAPI.send('sticky-drag-move', noteId, e.screenX, e.screenY);
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    electronAPI.send('sticky-drag-end', noteId);
  });

  // 双击编辑文本
  document.addEventListener('dblclick', (e) => {
    const taskText = e.target.closest('.task-text');
    if (!taskText) return;
    e.stopPropagation();
    if (taskText.getAttribute('contenteditable') !== 'true') {
      taskText.setAttribute('contenteditable', 'true');
      taskText.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(taskText);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // 文本编辑失去焦点时保存
  document.addEventListener('blur', (e) => {
    const taskText = e.target.closest('.task-text');
    if (!taskText || taskText.getAttribute('contenteditable') !== 'true') return;
    const newContent = taskText.innerText.trim();
    const timelineItem = taskText.closest('.timeline-item');
    const taskId = timelineItem ? timelineItem.dataset.taskId : null;
    if (taskId && newContent) {
      electronAPI.send('timeline-update-task-text', { noteId, taskId, content: newContent });
    }
    taskText.removeAttribute('contenteditable');
  }, true);

  // 点击提醒图标打开提醒设置
  document.addEventListener('click', (e) => {
    const reminderBadge = e.target.closest('.meta-badge.reminder');
    if (reminderBadge) {
      e.stopPropagation();
      const taskId = reminderBadge.dataset.taskId;
      electronAPI.send('timeline-open-reminder', { noteId, taskId });
    }
  });

  // 右键菜单
  document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const timelineItem = e.target.closest('.timeline-item');
    const taskId = timelineItem ? timelineItem.dataset.taskId : null;
    electronAPI.send('timeline-context-menu', { noteId, taskId, senderName });
  });

  // 监听删除任务
  electronAPI.on('timeline-remove-task', (event, taskId) => {
    const item = document.querySelector(`.timeline-item[data-task-id="${taskId}"]`);
    if (item) {
      item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      item.style.opacity = '0';
      item.style.transform = 'translateX(-10px)';
      setTimeout(() => {
        item.remove();
        // 更新任务计数
        updateTaskCount();
      }, 300);
    }
    tasksData = tasksData.filter(t => t.id !== taskId);
  });

  // 监听更新任务文本
  electronAPI.on('timeline-update-task-display', (event, { taskId, content }) => {
    const item = document.querySelector(`.timeline-item[data-task-id="${taskId}"]`);
    if (item) {
      const taskText = item.querySelector('.task-text');
      if (taskText) {
        taskText.textContent = content;
      }
    }
    const task = tasksData.find(t => t.id === taskId);
    if (task) task.content = content;
  });

  function updateTaskCount() {
    const countEl = document.querySelector('.task-count');
    const remaining = document.querySelectorAll('.timeline-item').length;
    if (countEl) {
      countEl.textContent = `共 ${remaining} 条任务`;
    }
  }
})();