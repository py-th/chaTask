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

  // 头像和徽章元素引用
  const headerAvatar = document.querySelector('.timeline-header .avatar');
  const taskCountBadge = document.querySelector('.task-count-badge');

  // 更新折叠模式下的头像边框颜色（与时间轴背景色同步）
  function updateFoldedAvatarBorder() {
    const container = document.querySelector('.timeline-container');
    if (!container || !headerAvatar) return;
    const computedBg = window.getComputedStyle(container).backgroundColor;
    headerAvatar.style.setProperty('--fold-avatar-border', computedBg);
  }

  // 应用样式配置
  function applyStyleConfig(config) {
    const container = document.querySelector('.timeline-container');
    if (!container) return;
    container.style.opacity = config.opacity;
    if (config.bgColor) {
      container.style.backgroundColor = config.bgColor;
    } else {
      // 默认使用与桌面便签一致的浅黄色背景
      container.style.backgroundColor = 'rgba(255, 249, 196, 0.95)';
    }
    // 同步更新折叠模式下的头像边框颜色
    updateFoldedAvatarBorder();
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

  // ========== 折叠/展开事件监听 ==========
  // 折叠时间轴便签
  electronAPI.on('fold-timeline-note', function() {
    const container = document.querySelector('.timeline-container');
    if (container) {
      container.classList.add('folded-mode');
    }
    if (taskCountBadge) {
      taskCountBadge.style.display = 'flex';
    }
    // 折叠时更新头像边框颜色
    updateFoldedAvatarBorder();
    console.log('[Timeline] 已折叠');
  });

  // 展开时间轴便签
  electronAPI.on('unfold-timeline-note', function() {
    const container = document.querySelector('.timeline-container');
    if (container) {
      container.classList.remove('folded-mode');
    }
    if (taskCountBadge) {
      taskCountBadge.style.display = 'none';
    }
    console.log('[Timeline] 已展开');
  });

  // ========== 排序功能 ==========
  electronAPI.on('timeline-sort-tasks', function(event, order) {
    // order: 'desc' 降序（最新在前）, 'asc' 升序（最旧在前）
    if (!tasksData || tasksData.length <= 1) return;

    // 根据创建日期排序
    tasksData.sort(function(a, b) {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return order === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // 重新渲染任务列表
    renderTimelineItems(tasksData);
    console.log('[Timeline] 任务已按日期' + (order === 'desc' ? '降序' : '升序') + '排序');
  });

  // 渲染时间轴任务列表
  function renderTimelineItems(tasks) {
    const timelineTrack = document.querySelector('.timeline-track');
    if (!timelineTrack) return;

    // 清空现有内容
    timelineTrack.innerHTML = '<div class="timeline-line"></div>';

    const escapeHtml = function(str) {
      if (!str) return '';
      return str.replace(/[&<>"'/]/g, function(tag) {
        const escapeMap = { '&': '&amp;', '<': '&gt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' };
        return escapeMap[tag] || tag;
      });
    };

    const getStatusText = function(status) {
      switch (status) {
        case 'pending': return '待办';
        case 'in_progress': return '进行中';
        case 'completed': return '已完成';
        case 'overdue': return '逾期';
        default: return '待办';
      }
    };

    const getPriorityText = function(priority) {
      switch (priority) {
        case 'high': return '高';
        case 'medium': return '中';
        case 'low': return '低';
        default: return '无';
      }
    };

    tasks.forEach(function(task) {
      const timeStr = task.created_at ? new Date(task.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const isCompleted = task.status === 'completed' || task.is_completed === 1;
      const isOverdue = task.status === 'overdue';
      const completedClass = isCompleted ? ' completed' : (isOverdue ? ' overdue' : '');
      const dueDate = task.due_date || '';
      const dueDateText = dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
      const dueDateTitle = dueDate ? '截止: ' + new Date(dueDate + 'T00:00:00').toLocaleDateString('zh-CN') : '点击设置截止日期';
      const dueDateClass = dueDate ? ' has-due-date' : '';

      const itemHtml = '<div class="timeline-item' + completedClass + '" data-task-id="' + escapeHtml(task.id) + '">' +
        '<div class="timeline-dot' + dueDateClass + (isOverdue ? ' is-overdue' : '') + '" title="' + dueDateTitle + '" data-due-date="' + escapeHtml(dueDate) + '" style="cursor: pointer;"></div>' +
        '<div class="task-time">' +
          '<span class="time-text">' + timeStr + '</span>' +
          (dueDateText ? '<span class="due-date-badge">📅 ' + dueDateText + '</span>' : '') +
        '</div>' +
        '<div class="task-card">' +
          '<div class="task-text" contenteditable="false">' + escapeHtml(task.content) + '</div>' +
          '<div class="task-meta">' +
            '<span class="meta-badge priority-' + task.priority + '">' + getPriorityText(task.priority) + '</span>' +
            '<span class="meta-badge status-' + task.status + '">' + getStatusText(task.status) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

      timelineTrack.insertAdjacentHTML('beforeend', itemHtml);
    });

    // 更新任务计数
    updateTaskCount();
  }

  // ========== 自动调整窗口高度 ==========
  function autoResizeHeight() {
    var container = document.querySelector('.timeline-container');
    if (!container) return;
    // 获取容器的实际渲染高度（因为移除了 height:100%，容器高度等于内容高度）
    var contentHeight = container.getBoundingClientRect().height;
    if (contentHeight > 0) {
      electronAPI.send('resize-sticky', { id: noteId, height: Math.ceil(contentHeight) });
    }
  }

  // 页面加载完成后立即调整一次
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(autoResizeHeight, 0);
  } else {
    window.addEventListener('DOMContentLoaded', autoResizeHeight);
  }

  // 监听内容变化，自动调整高度
  var resizeObserver = new MutationObserver(function() {
    autoResizeHeight();
  });
  var container = document.querySelector('.timeline-container');
  if (container) {
    resizeObserver.observe(container, { childList: true, subtree: true, characterData: true });
  }
})();
