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

  // 样式配置
  let styleConfig = Object.assign({
    opacity: 1,
    bgColor: ''
  }, window.timelineStyleConfig || {});

  // 应用样式配置
  function applyStyleConfig(config) {
    const container = document.querySelector('.timeline-container');
    if (!container) return;
    container.style.opacity = config.opacity;
    if (config.bgColor) {
      container.style.backgroundColor = config.bgColor;
    } else {
      container.style.backgroundColor = 'rgba(255, 255, 255, 0.92)';
    }
  }

  applyStyleConfig(styleConfig);

  // 拖拽相关
  let isDragging = false;

  document.addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    // 如果点击的是可编辑文本、提醒图标或样式面板，不触发拖拽
    if (e.target.closest('.task-text') || e.target.closest('.meta-badge.reminder') || e.target.closest('.style-panel')) return;
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
      return;
    }

    // 点击时间轴圆点 → 设置截止日期
    const dot = e.target.closest('.timeline-dot');
    if (dot) {
      e.stopPropagation();
      const timelineItem = dot.closest('.timeline-item');
      const taskId = timelineItem ? timelineItem.dataset.taskId : null;
      if (taskId) {
        showDatePicker(taskId, dot.dataset.dueDate || '');
      }
    }
  });

  // 右键菜单
  document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const timelineItem = e.target.closest('.timeline-item');
    const taskId = timelineItem ? timelineItem.dataset.taskId : null;
    electronAPI.send('timeline-context-menu', { noteId, taskId, senderName });
  });

  // ========== 样式面板 ==========
  const stylePanel = document.getElementById('stylePanel');
  const stylePanelClose = document.getElementById('stylePanelClose');
  const styleOpacity = document.getElementById('styleOpacity');
  const styleOpacityValue = document.getElementById('styleOpacityValue');
  const styleBgColor = document.getElementById('styleBgColor');
  const styleReset = document.getElementById('styleReset');
  const styleConfirm = document.getElementById('styleConfirm');

  function syncStylePanel(config) {
    if (styleOpacity) styleOpacity.value = config.opacity;
    if (styleOpacityValue) styleOpacityValue.textContent = Math.round(config.opacity * 100) + '%';
    if (styleBgColor) styleBgColor.value = config.bgColor || '#ffffff';
  }

  function showStylePanel() {
    syncStylePanel(styleConfig);
    if (stylePanel) stylePanel.classList.add('show');
  }

  function hideStylePanel() {
    if (stylePanel) stylePanel.classList.remove('show');
  }

  if (stylePanelClose) {
    stylePanelClose.addEventListener('click', hideStylePanel);
  }

  if (styleOpacity) {
    styleOpacity.addEventListener('input', () => {
      const val = parseFloat(styleOpacity.value);
      const container = document.querySelector('.timeline-container');
      if (container) container.style.opacity = val;
      if (styleOpacityValue) styleOpacityValue.textContent = Math.round(val * 100) + '%';
    });
  }

  if (styleBgColor) {
    styleBgColor.addEventListener('input', () => {
      const val = styleBgColor.value;
      const container = document.querySelector('.timeline-container');
      if (container) container.style.backgroundColor = val;
    });
  }

  if (styleReset) {
    styleReset.addEventListener('click', () => {
      styleConfig = { opacity: 1, bgColor: '' };
      applyStyleConfig(styleConfig);
      syncStylePanel(styleConfig);
      electronAPI.send('save-timeline-style', { noteId, styleConfig });
    });
  }

  if (styleConfirm) {
    styleConfirm.addEventListener('click', () => {
      const opacity = styleOpacity ? parseFloat(styleOpacity.value) : 1;
      const bgColor = styleBgColor ? styleBgColor.value : '';
      styleConfig = { opacity, bgColor };
      applyStyleConfig(styleConfig);
      hideStylePanel();
      electronAPI.send('save-timeline-style', { noteId, styleConfig });
    });
  }

  // 监听显示样式面板
  electronAPI.on('show-timeline-style-panel', () => {
    showStylePanel();
  });

  // 监听置顶状态变化
  electronAPI.on('timeline-pin-changed', (event, isPinned) => {
    // 可以在这里添加视觉反馈，比如标题栏图标变化
    console.log('[Timeline] 置顶状态:', isPinned);
  });

  // 监听透明度更新（右键菜单）
  electronAPI.on('timeline-update-opacity', (event, opacity) => {
    styleConfig.opacity = opacity;
    applyStyleConfig(styleConfig);
    electronAPI.send('save-timeline-style', { noteId, styleConfig });
  });

  // 监听背景颜色更新（右键菜单）
  electronAPI.on('timeline-update-bgcolor', (event, color) => {
    styleConfig.bgColor = color;
    applyStyleConfig(styleConfig);
    electronAPI.send('save-timeline-style', { noteId, styleConfig });
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

  // 监听更新提醒信息（局部更新，避免整页刷新闪烁）
  electronAPI.on('timeline-update-reminder', (event, { taskId, reminderText }) => {
    const item = document.querySelector(`.timeline-item[data-task-id="${taskId}"]`);
    if (!item) return;
    const meta = item.querySelector('.task-meta');
    if (!meta) return;
    let badge = meta.querySelector('.meta-badge.reminder');
    if (reminderText) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'meta-badge reminder';
        badge.dataset.taskId = taskId;
        meta.appendChild(badge);
      }
      badge.textContent = '\u23F0 ' + reminderText;
    } else if (badge) {
      badge.remove();
    }
  });

  function updateTaskCount() {
    const countEl = document.querySelector('.task-count');
    const remaining = document.querySelectorAll('.timeline-item').length;
    if (countEl) {
      countEl.textContent = `共 ${remaining} 条任务`;
    }
  }

  // ========== 日期选择器 ==========
  let currentDateTaskId = null;

  const datePickerOverlay = document.getElementById('datePickerOverlay');
  const datePickerClose = document.getElementById('datePickerClose');
  const datePickerInput = document.getElementById('datePickerInput');
  const datePickerClear = document.getElementById('datePickerClear');
  const datePickerConfirm = document.getElementById('datePickerConfirm');

  function showDatePicker(taskId, currentDueDate) {
    currentDateTaskId = taskId;
    if (datePickerInput) {
      datePickerInput.value = currentDueDate || '';
    }
    if (datePickerOverlay) {
      datePickerOverlay.classList.add('show');
    }
  }

  function hideDatePicker() {
    currentDateTaskId = null;
    if (datePickerOverlay) {
      datePickerOverlay.classList.remove('show');
    }
  }

  function applyDueDate(taskId, dueDate) {
    // 更新本地数据
    var task = tasksData.find(function(t) { return t.id === taskId; });
    if (task) {
      task.due_date = dueDate || null;
    }
    // 更新 UI
    var item = document.querySelector('.timeline-item[data-task-id="' + taskId + '"]');
    if (!item) return;
    var dot = item.querySelector('.timeline-dot');
    var timeEl = item.querySelector('.task-time');
    if (dot) {
      dot.dataset.dueDate = dueDate || '';
      if (dueDate) {
        dot.classList.add('has-due-date');
        var dateObj = new Date(dueDate + 'T00:00:00');
        dot.title = '截止: ' + dateObj.toLocaleDateString('zh-CN');
      } else {
        dot.classList.remove('has-due-date');
        dot.title = '点击设置截止日期';
      }
    }
    // 更新截止日期徽章
    if (timeEl) {
      var existingBadge = timeEl.querySelector('.due-date-badge');
      if (dueDate) {
        var dateObj = new Date(dueDate + 'T00:00:00');
        var dateStr = dateObj.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
        if (existingBadge) {
          existingBadge.textContent = '\uD83D\uDCC5 ' + dateStr;
        } else {
          var badge = document.createElement('span');
          badge.className = 'due-date-badge';
          badge.textContent = '\uD83D\uDCC5 ' + dateStr;
          timeEl.appendChild(badge);
        }
      } else if (existingBadge) {
        existingBadge.remove();
      }
    }
  }

  if (datePickerClose) {
    datePickerClose.addEventListener('click', hideDatePicker);
  }

  if (datePickerOverlay) {
    datePickerOverlay.addEventListener('click', function(e) {
      if (e.target === datePickerOverlay) {
        hideDatePicker();
      }
    });
  }

  if (datePickerClear) {
    datePickerClear.addEventListener('click', function() {
      if (currentDateTaskId) {
        applyDueDate(currentDateTaskId, '');
        electronAPI.send('timeline-set-due-date', { noteId: noteId, taskId: currentDateTaskId, dueDate: null });
      }
      hideDatePicker();
    });
  }

  if (datePickerConfirm) {
    datePickerConfirm.addEventListener('click', function() {
      if (currentDateTaskId && datePickerInput) {
        var dueDate = datePickerInput.value;
        applyDueDate(currentDateTaskId, dueDate);
        electronAPI.send('timeline-set-due-date', { noteId: noteId, taskId: currentDateTaskId, dueDate: dueDate || null });
      }
      hideDatePicker();
    });
  }

  // 监听截止日期更新
  electronAPI.on('timeline-update-due-date', function(event, data) {
    applyDueDate(data.taskId, data.dueDate);
  });
})();
