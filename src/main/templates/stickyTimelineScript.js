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

  let taskTextMaxLength = window.taskTextMaxLength || 200;

  // 任务文本截断/展开
  function getTaskPlainText(el) {
    return el ? el.innerText.replace(/\n$/, '') : '';
  }

  function getOrCreateExpandLink(taskText) {
    let expandLink = taskText.querySelector('.expand-link');
    if (!expandLink) {
      expandLink = document.createElement('span');
      expandLink.className = 'expand-link';
      expandLink.textContent = '展开';
    }
    return expandLink;
  }

  function truncateTaskText(taskText) {
    if (!taskText) return;
    const expandLink = getOrCreateExpandLink(taskText);
    // 先移除展开链接，避免其文本被计入长度
    if (expandLink && expandLink.parentNode === taskText) {
      taskText.removeChild(expandLink);
    }
    const fullText = taskText.dataset.fullContent || getTaskPlainText(taskText);
    // 保留原始完整内容，避免后续截断时以已截断的文本为基准
    if (fullText && !taskText.dataset.fullContent) {
      taskText.dataset.fullContent = fullText;
    }
    if (fullText.length > taskTextMaxLength) {
      taskText.innerText = fullText.slice(0, taskTextMaxLength) + '...';
      taskText.appendChild(expandLink);
      expandLink.classList.add('visible');
      expandLink.textContent = '展开';
    } else {
      taskText.innerText = fullText;
      taskText.appendChild(expandLink);
      expandLink.classList.remove('visible');
    }
  }

  function expandTaskText(taskText) {
    if (!taskText || !taskText.dataset.fullContent) return;
    const expandLink = getOrCreateExpandLink(taskText);
    if (expandLink && expandLink.parentNode === taskText) {
      taskText.removeChild(expandLink);
    }
    taskText.innerText = taskText.dataset.fullContent;
    taskText.appendChild(expandLink);
    expandLink.classList.add('visible');
    expandLink.textContent = '收起';
  }

  function collapseTaskText(taskText) {
    if (!taskText || !taskText.dataset.fullContent) return;
    const expandLink = getOrCreateExpandLink(taskText);
    if (expandLink && expandLink.parentNode === taskText) {
      taskText.removeChild(expandLink);
    }
    const fullText = taskText.dataset.fullContent;
    taskText.innerText = fullText.slice(0, taskTextMaxLength) + '...';
    taskText.appendChild(expandLink);
    expandLink.classList.add('visible');
    expandLink.textContent = '展开';
  }

  function truncateAllTaskTexts() {
    document.querySelectorAll('.timeline-item .task-text').forEach(truncateTaskText);
  }

  // 底部滚动提示：内容超出且未滚动到底部时显示
  const scrollHint = document.getElementById('scrollHint');
  const timelineScroll = document.getElementById('timelineScroll');

  function updateScrollHint() {
    if (!timelineScroll || !scrollHint) return;
    const hasOverflow = timelineScroll.scrollHeight > timelineScroll.clientHeight + 1;
    const isAtBottom = timelineScroll.scrollTop + timelineScroll.clientHeight >= timelineScroll.scrollHeight - 1;
    scrollHint.classList.toggle('visible', hasOverflow && !isAtBottom);
  }

  if (timelineScroll) {
    timelineScroll.addEventListener('scroll', updateScrollHint, { passive: true });
  }

  if (scrollHint) {
    scrollHint.addEventListener('click', (e) => {
      e.stopPropagation();
      if (timelineScroll) {
        timelineScroll.scrollBy({ top: 120, behavior: 'smooth' });
      }
    });
  }

  // 双击头像区域：折叠时展开（展开状态下头像隐藏，无法通过头像折叠）
  if (headerAvatar) {
    headerAvatar.addEventListener('dblclick', () => {
      const container = document.querySelector('.timeline-container');
      if (container && container.classList.contains('folded-mode')) {
        electronAPI.send('unfold-note-request', window.noteId);
      } else {
        electronAPI.send('fold-timeline-note-request', window.noteId);
      }
    });

    // 贴边折叠 1 分钟后头像自动半透明，悬浮/拖拽时恢复
    headerAvatar.addEventListener('mouseenter', clearFoldDim);
    headerAvatar.addEventListener('mouseleave', () => {
      const container = document.querySelector('.timeline-container');
      if (container && container.classList.contains('folded-mode')) {
        startFoldDimTimer();
      }
    });
    headerAvatar.addEventListener('mousedown', clearFoldDim);
  }

  // 更新折叠模式下的头像边框颜色（与时间轴背景色同步）
  // 关键：必须用 styleConfig.bgColor（原始背景色）而不是容器的 computed style，
  // 因为折叠模式下 .timeline-container.folded-mode 的 background: transparent 会覆盖 inline 背景色，
  // 此时 getComputedStyle 拿到的会是 rgba(0,0,0,0) 透明色，导致边框变透明。
  function updateFoldedAvatarBorder() {
    if (!headerAvatar) return;
    let borderColor = (styleConfig && styleConfig.bgColor)
      ? styleConfig.bgColor
      : 'rgba(255, 249, 196, 0.95)';  // 默认黄色，与 .timeline-container 默认背景一致
    headerAvatar.style.setProperty('--fold-avatar-border', borderColor);
  }

  // 贴边折叠延时半透明状态
  let foldDimActive = false;
  let foldDimTimer = null;
  const FOLD_DIM_FACTOR = 0.5;
  function getFoldDimDelay() {
    return (window.foldedDimDelay || 1) * 60 * 1000;
  }

  function getBaseOpacity(config) {
    return config && config.opacity != null ? config.opacity : 1;
  }

  // 应用折叠模式下头像区域的透明度（与用户设置的透明度叠加）
  function applyFoldedOpacity(dimActive) {
    const header = document.querySelector('.timeline-header');
    if (!header) return;
    const baseOpacity = getBaseOpacity(styleConfig);
    header.style.opacity = dimActive ? baseOpacity * FOLD_DIM_FACTOR : baseOpacity;
  }

  // 应用样式配置
  function applyStyleConfig(config) {
    const container = document.querySelector('.timeline-container');
    if (!container) return;

    const baseOpacity = getBaseOpacity(config);

    if (container.classList.contains('folded-mode')) {
      // 折叠模式：容器本身透明，透明度只作用于头像区域（与延时半透明叠加）
      container.style.opacity = '';
      container.style.backgroundColor = ''; // 清除内联背景色，让 CSS 的 background: transparent 真正生效
      applyFoldedOpacity(foldDimActive);
    } else {
      // 展开模式：透明度作用于整个容器，并恢复背景色
      container.style.opacity = baseOpacity;
      container.style.backgroundColor = config.bgColor || 'rgba(255, 249, 196, 0.95)';
      const header = document.querySelector('.timeline-header');
      if (header) header.style.opacity = '';
    }

    // 同步更新折叠模式下的头像边框颜色（与原始背景色同步）
    updateFoldedAvatarBorder();
  }

  // 启动/清除贴边折叠延时半透明定时器
  function startFoldDimTimer() {
    const container = document.querySelector('.timeline-container');
    if (!container || !container.classList.contains('folded-mode')) return;
    clearFoldDimTimer();
    foldDimTimer = setTimeout(() => {
      if (container.classList.contains('folded-mode')) {
        foldDimActive = true;
        applyFoldedOpacity(true);
      }
    }, getFoldDimDelay());
  }

  function clearFoldDimTimer() {
    if (foldDimTimer) {
      clearTimeout(foldDimTimer);
      foldDimTimer = null;
    }
  }

  function clearFoldDim() {
    clearFoldDimTimer();
    if (foldDimActive) {
      foldDimActive = false;
      applyFoldedOpacity(false);
    }
  }

  function resetFoldDimState() {
    clearFoldDimTimer();
    foldDimActive = false;
  }

  // 折叠模式下头像等比例缩放
  const BASE_FOLD_SIZE = 45;
  const BASE_BORDER_WIDTH = 2;
  const BASE_BORDER_RADIUS = 6;
  const BASE_BADGE_MIN_WIDTH = 16;
  const BASE_BADGE_HEIGHT = 16;
  const BASE_BADGE_BOTTOM = 3;
  const BASE_BADGE_FONT_SIZE = 11;
  const BASE_BADGE_PADDING = 3;
  const BASE_BADGE_BORDER_WIDTH = 1;

  function applyFoldedAvatarSize(size) {
    const container = document.querySelector('.timeline-container');
    const header = document.querySelector('.timeline-header');
    const avatar = document.querySelector('.timeline-header .avatar');
    const badge = document.querySelector('.task-count-badge');
    if (!container || !header || !avatar) return;

    const scale = size / BASE_FOLD_SIZE;
    const borderRadius = Math.max(2, Math.round(BASE_BORDER_RADIUS * scale * 10) / 10);
    const borderWidth = Math.max(1, Math.round(BASE_BORDER_WIDTH * scale * 10) / 10);

    container.style.width = size + 'px';
    container.style.height = size + 'px';
    container.style.borderRadius = borderRadius + 'px';

    header.style.width = size + 'px';
    header.style.height = size + 'px';
    header.style.borderRadius = borderRadius + 'px';

    avatar.style.width = size + 'px';
    avatar.style.height = size + 'px';
    avatar.style.borderRadius = borderRadius + 'px';
    avatar.style.borderWidth = borderWidth + 'px';

    if (badge) {
      badge.style.minWidth = Math.max(12, Math.round(BASE_BADGE_MIN_WIDTH * scale * 10) / 10) + 'px';
      badge.style.height = Math.max(12, Math.round(BASE_BADGE_HEIGHT * scale * 10) / 10) + 'px';
      badge.style.bottom = Math.max(1, Math.round(BASE_BADGE_BOTTOM * scale * 10) / 10) + 'px';
      badge.style.fontSize = Math.max(9, Math.round(BASE_BADGE_FONT_SIZE * scale * 10) / 10) + 'px';
      badge.style.padding = '0 ' + Math.max(2, Math.round(BASE_BADGE_PADDING * scale * 10) / 10) + 'px';
      badge.style.borderWidth = Math.max(1, Math.round(BASE_BADGE_BORDER_WIDTH * scale * 10) / 10) + 'px';
    }
  }

  function resetFoldedStyles() {
    const container = document.querySelector('.timeline-container');
    const header = document.querySelector('.timeline-header');
    const avatar = document.querySelector('.timeline-header .avatar');
    const badge = document.querySelector('.task-count-badge');

    if (container) {
      container.style.width = '';
      container.style.height = '';
      container.style.borderRadius = '';
    }
    if (header) {
      header.style.width = '';
      header.style.height = '';
      header.style.borderRadius = '';
      header.style.opacity = '';
    }
    if (avatar) {
      avatar.style.width = '';
      avatar.style.height = '';
      avatar.style.borderRadius = '';
      avatar.style.borderWidth = '';
    }
    if (badge) {
      badge.style.minWidth = '';
      badge.style.height = '';
      badge.style.bottom = '';
      badge.style.fontSize = '';
      badge.style.padding = '';
      badge.style.borderWidth = '';
    }
  }

  applyStyleConfig(styleConfig);

  // 辅助函数：获取状态文本
  function getStatusText(status) {
    switch (status) {
      case 'pending': return '待办';
      case 'in_progress': return '进行中';
      case 'completed': return '已完成';
      case 'overdue': return '逾期';
      default: return '待办';
    }
  }

  // 辅助函数：获取优先级文本
  function getPriorityText(priority) {
    switch (priority) {
      case 'high': return '高';
      case 'medium': return '中';
      case 'low': return '低';
      default: return '无';
    }
  }

  // 拖拽相关
  let isDragging = false;

  document.addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    // 如果点击的是处于编辑状态的任务文本、提醒图标、样式面板、拖拽手柄或滚动提示，不触发窗口拖拽
    const taskText = e.target.closest('.task-text');
    if ((taskText && taskText.getAttribute('contenteditable') === 'true') || e.target.closest('.meta-badge.reminder') || e.target.closest('.style-panel') || e.target.closest('.drag-handle') || e.target.closest('.scroll-hint')) return;
    isDragging = true;
    electronAPI.send('start-sticky-drag', noteId, e.screenX, e.screenY);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    electronAPI.send('sticky-drag-move', noteId, e.screenX, e.screenY);
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      electronAPI.send('sticky-drag-end', noteId);
    }
  });

  // 双击编辑文本
  document.addEventListener('dblclick', (e) => {
    const taskText = e.target.closest('.task-text');
    if (!taskText) return;
    e.stopPropagation();
    if (taskText.getAttribute('contenteditable') !== 'true') {
      // 进入编辑模式前恢复完整文本并隐藏展开链接
      if (taskText.dataset.fullContent) {
        taskText.innerText = taskText.dataset.fullContent;
      }
      const expandLink = taskText.querySelector('.expand-link');
      if (expandLink) expandLink.classList.remove('visible');
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
    // 保存后重新截断
    taskText.dataset.fullContent = newContent;
    truncateTaskText(taskText);
    updateScrollHint();
  }, true);

  // 点击提醒图标打开提醒设置
  document.addEventListener('click', (e) => {
    const expandLink = e.target.closest('.expand-link');
    if (expandLink) {
      e.stopPropagation();
      const taskText = expandLink.closest('.task-text');
      if (taskText) {
        if (expandLink.textContent === '展开') expandTaskText(taskText);
        else collapseTaskText(taskText);
      }
      updateScrollHint();
      return;
    }

    const reminderBadge = e.target.closest('.meta-badge.reminder');
    if (reminderBadge) {
      e.stopPropagation();
      const taskId = reminderBadge.dataset.taskId;
      electronAPI.send('timeline-open-reminder', { noteId, taskId });
      return;
    }

    // 点击时间轴圆点 → 设置任务状态
    const dot = e.target.closest('.timeline-dot');
    if (dot) {
      e.stopPropagation();
      const timelineItem = dot.closest('.timeline-item');
      const taskId = timelineItem ? timelineItem.dataset.taskId : null;
      if (taskId) {
        electronAPI.send('timeline-set-status', { noteId, taskId });
      }
      return;
    }

    // 点击截止日期徽章 → 设置截止日期
    const dueBadge = e.target.closest('.due-date-badge');
    if (dueBadge) {
      e.stopPropagation();
      const timelineItem = dueBadge.closest('.timeline-item');
      const taskId = timelineItem ? timelineItem.dataset.taskId : null;
      if (taskId) {
        const dot = timelineItem.querySelector('.timeline-dot');
        showDatePicker(taskId, dot ? dot.dataset.dueDate || '' : '', dueBadge);
      }
      return;
    }
  });

  // 右键菜单
  document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const timelineItem = e.target.closest('.timeline-item');
    const taskId = timelineItem ? timelineItem.dataset.taskId : null;
    electronAPI.send('timeline-context-menu', { noteId, taskId, senderName });
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
        // 更新底部滚动提示
        updateScrollHint();
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
        taskText.dataset.fullContent = content;
        truncateTaskText(taskText);
      }
    }
    const task = tasksData.find(t => t.id === taskId);
    if (task) task.content = content;
    updateScrollHint();
  });

  // 监听主程序的任务更新（支持多种字段更新）
  electronAPI.on('timeline-update-task', (event, { taskId, content, priority, status, dueDate, reminderChanged, is_completed }) => {
    const item = document.querySelector(`.timeline-item[data-task-id="${taskId}"]`);
    if (!item) return;

    // 更新内容
    if (content !== undefined) {
      const taskText = item.querySelector('.task-text');
      if (taskText) {
        taskText.textContent = content;
        taskText.dataset.fullContent = content;
        truncateTaskText(taskText);
      }
      const task = tasksData.find(t => t.id === taskId);
      if (task) task.content = content;
    }

    // 更新优先级
    if (priority !== undefined) {
      const priorityBadge = item.querySelector('.meta-badge[data-type="priority"]');
      if (priorityBadge) {
        // 移除旧的优先级类
        priorityBadge.className = priorityBadge.className.replace(/priority-\w+/, '');
        priorityBadge.classList.add('meta-badge', 'priority-' + priority);
        priorityBadge.textContent = getPriorityText(priority);
      }
      const task = tasksData.find(t => t.id === taskId);
      if (task) task.priority = priority;
    }

    // 更新状态
    if (status !== undefined) {
      // 更新状态徽章
      const statusBadge = item.querySelector('.meta-badge[data-type="status"]');
      if (statusBadge) {
        // 移除旧的状态类
        statusBadge.className = statusBadge.className.replace(/status-\w+/, '');
        statusBadge.classList.add('meta-badge', 'status-' + status);
        statusBadge.textContent = getStatusText(status);
      }
      // 更新任务状态样式
      const isCompleted = status === 'completed';
      const isOverdue = status === 'overdue';
      item.classList.remove('completed', 'overdue');
      if (isCompleted) {
        item.classList.add('completed');
      } else if (isOverdue) {
        item.classList.add('overdue');
      }
      // 更新数据
      const task = tasksData.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        task.is_completed = is_completed !== undefined ? is_completed : (status === 'completed' ? 1 : 0);
      }
    }

    // 更新截止日期
    if (dueDate !== undefined) {
      const dot = item.querySelector('.timeline-dot');
      if (dot) {
        if (dueDate) {
          dot.classList.add('has-due-date');
          dot.setAttribute('data-due-date', dueDate);
        } else {
          dot.classList.remove('has-due-date', 'is-overdue');
          dot.removeAttribute('data-due-date');
        }
        dot.setAttribute('title', '点击设置任务状态');
      }
      // 更新 task-meta 中的截止日期徽章
      updateDueDateBadge(item, dueDate);
      // 更新数据
      const task = tasksData.find(t => t.id === taskId);
      if (task) task.due_date = dueDate;
    }

    // 提醒规则变更（需要刷新提醒显示）
    if (reminderChanged) {
      // 触发提醒信息刷新
      const task = tasksData.find(t => t.id === taskId);
      if (task && task.reminderTime) {
        // 这里可以添加提醒信息的刷新逻辑
      }
    }

    updateScrollHint();
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
    updateScrollHint();
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

  const hiddenDatePicker = document.getElementById('hiddenDatePicker');

  function showDatePicker(taskId, currentDueDate, badgeEl) {
    currentDateTaskId = taskId;
    if (hiddenDatePicker) {
      hiddenDatePicker.value = currentDueDate || '';
      const badge = badgeEl || (currentDateTaskId ? document.querySelector('.timeline-item[data-task-id="' + currentDateTaskId + '"] .due-date-badge') : null);
      if (badge) {
        const rect = badge.getBoundingClientRect();
        hiddenDatePicker.style.left = rect.left + 'px';
        hiddenDatePicker.style.top = (rect.bottom - 12) + 'px';
        hiddenDatePicker.style.width = rect.width + 'px';
        hiddenDatePicker.style.height = rect.height + 'px';
        // 强制刷新布局，避免第一次打开时位置未生效
        hiddenDatePicker.offsetHeight;
      }
      hiddenDatePicker.showPicker?.();
    }
  }

  function updateDueDateBadge(item, dueDate) {
    var meta = item.querySelector('.task-meta');
    if (!meta) return;
    var existingBadge = meta.querySelector('.due-date-badge');
    if (dueDate) {
      var dateObj = new Date(dueDate + 'T00:00:00');
      var dateStr = dateObj.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      if (existingBadge) {
        existingBadge.className = 'due-date-badge';
        existingBadge.textContent = '\uD83D\uDCC5 ' + dateStr;
        existingBadge.title = '截止: ' + dateObj.toLocaleDateString('zh-CN');
      } else {
        var badge = document.createElement('span');
        badge.className = 'due-date-badge';
        badge.textContent = '\uD83D\uDCC5 ' + dateStr;
        badge.title = '截止: ' + dateObj.toLocaleDateString('zh-CN');
        meta.appendChild(badge);
      }
    } else {
      if (existingBadge) {
        existingBadge.className = 'due-date-badge empty';
        existingBadge.textContent = '\uD83D\uDCC5';
        existingBadge.title = '设置截止日期';
      } else {
        var badge = document.createElement('span');
        badge.className = 'due-date-badge empty';
        badge.textContent = '\uD83D\uDCC5';
        badge.title = '设置截止日期';
        meta.appendChild(badge);
      }
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
    if (dot) {
      dot.dataset.dueDate = dueDate || '';
      if (dueDate) {
        dot.classList.add('has-due-date');
      } else {
        dot.classList.remove('has-due-date');
      }
      dot.title = '点击设置任务状态';
    }
    // 更新 task-meta 中的截止日期徽章
    updateDueDateBadge(item, dueDate);
  }

  if (hiddenDatePicker) {
    hiddenDatePicker.addEventListener('change', function() {
      if (!currentDateTaskId) return;
      var dueDate = hiddenDatePicker.value;
      applyDueDate(currentDateTaskId, dueDate);
      electronAPI.send('timeline-set-due-date', { noteId: noteId, taskId: currentDateTaskId, dueDate: dueDate || null });
      currentDateTaskId = null;
      hiddenDatePicker.value = '';
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
    // 应用用户配置的折叠头像大小
    applyFoldedAvatarSize(window.foldedAvatarSize || BASE_FOLD_SIZE);
    // 贴边折叠时，将所有已展开的文本按配置长度重新截断
    truncateAllTaskTexts();
    // 重新应用样式配置，使折叠模式下透明度作用于头像区域
    applyStyleConfig(styleConfig);
    // 启动 1 分钟后延时半透明定时器
    startFoldDimTimer();
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
    // 清除延时半透明状态
    resetFoldDimState();
    resetFoldedStyles();
    // 重新应用样式配置，使展开模式下透明度作用于整个容器
    applyStyleConfig(styleConfig);
    updateScrollHint();
    console.log('[Timeline] 已展开');
  });

  // 设置变化时实时更新折叠头像大小
  electronAPI.on('update-folded-avatar-size', function(event, size) {
    window.foldedAvatarSize = size;
    const container = document.querySelector('.timeline-container');
    if (container && container.classList.contains('folded-mode')) {
      applyFoldedAvatarSize(size);
    }
  });

  // 设置变化时实时更新任务文本最大长度
  electronAPI.on('update-task-text-max-length', function(event, length) {
    taskTextMaxLength = length;
    document.querySelectorAll('.timeline-item .task-text').forEach(function(taskText) {
      truncateTaskText(taskText);
    });
    updateScrollHint();
  });

  // 设置变化时实时更新贴边折叠延时半透明时间
  electronAPI.on('update-folded-dim-delay', function(event, delayMinutes) {
    window.foldedDimDelay = delayMinutes;
    const container = document.querySelector('.timeline-container');
    if (container && container.classList.contains('folded-mode')) {
      clearFoldDim();
      startFoldDimTimer();
    }
  });

  // ========== 排序功能 ==========
  electronAPI.on('timeline-sort-tasks', function(event, order) {
    // 退出自定义排序模式
    var container = document.querySelector('.timeline-container');
    if (container) container.classList.remove('sort-mode');
    isCustomSortMode = false;
    // 恢复滚动条
    var scrollEl = document.getElementById('timelineScroll');
    if (scrollEl) scrollEl.style.overflowY = '';

    if (!tasksData || tasksData.length <= 1) {
      autoResizeHeight();
      return;
    }

    if (order === 'custom') {
      // 自定义排序：按 sort_order 排序
      tasksData.sort(function(a, b) {
        return (a.sort_order || 0) - (b.sort_order || 0);
      });
      renderTimelineItems(tasksData);
      console.log('[Timeline] 任务已按自定义顺序排序');
    } else {
      // 根据创建日期排序
      tasksData.sort(function(a, b) {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return order === 'desc' ? dateB - dateA : dateA - dateB;
      });
      renderTimelineItems(tasksData);
      console.log('[Timeline] 任务已按日期' + (order === 'desc' ? '降序' : '升序') + '排序');
    }
    autoResizeHeight(true);
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

    tasks.forEach(function(task) {
      const timeStr = task.created_at ? new Date(task.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const isCompleted = task.status === 'completed' || task.is_completed === 1;
      const isOverdue = task.status === 'overdue';
      const completedClass = isCompleted ? ' completed' : (isOverdue ? ' overdue' : '');
      const dueDate = task.due_date || '';
      const dueDateText = dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
      const dueDateTitle = dueDate ? '截止: ' + new Date(dueDate + 'T00:00:00').toLocaleDateString('zh-CN', {year: 'numeric', month: 'numeric', day: 'numeric' }) : '设置截止日期';
      const dueDateClass = dueDate ? ' has-due-date' : '';
      const dueBadgeClass = dueDate ? 'due-date-badge' : 'due-date-badge empty';
      const dueBadgeText = dueDate ? '📅 ' + dueDateText : '📅';

      const itemHtml = '<div class="timeline-item' + completedClass + '" data-task-id="' + escapeHtml(task.id) + '">' +
        '<div class="timeline-dot' + dueDateClass + (isOverdue ? ' is-overdue' : '') + '" title="点击设置任务状态" data-due-date="' + escapeHtml(dueDate) + '"></div>' +
        '<div class="task-time">' +
          '<span class="time-text">' + timeStr + '</span>' +
          '<div class="drag-handle"><div class="grip-dots"><span></span><span></span><span></span><span></span><span></span><span></span></div></div>' +
        '</div>' +
        '<div class="task-card">' +
          '<div class="task-text" contenteditable="false">' + escapeHtml(task.content) + '<span class="expand-link">展开</span></div>' +
          '<div class="task-meta">' +
            '<span class="meta-badge priority-' + task.priority + '" data-type="priority">' + getPriorityText(task.priority) + '</span>' +
            '<span class="meta-badge status-' + task.status + '" data-type="status">' + getStatusText(task.status) + '</span>' +
            '<span class="' + dueBadgeClass + '" title="' + dueDateTitle + '">' + dueBadgeText + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

      timelineTrack.insertAdjacentHTML('beforeend', itemHtml);
    });

    // 更新任务计数
    updateTaskCount();
    // 重新应用文本长度限制（排序后任务 DOM 已重建）
    truncateAllTaskTexts();
    // 更新底部滚动提示
    updateScrollHint();
  }

  // ========== 自定义拖拽排序 ==========
  var isCustomSortMode = false;
  var dragState = null; // { taskId, startY, item, clone, offsetY, initialIndex }

  // 进入自定义排序模式
  electronAPI.on('timeline-enter-custom-sort', function() {
    isCustomSortMode = true;
    var container = document.querySelector('.timeline-container');
    if (container) container.classList.add('sort-mode');
    // 进入排序模式时立即隐藏滚动条，防止调整高度前闪现
    var scrollEl = document.getElementById('timelineScroll');
    if (scrollEl) scrollEl.style.overflowY = 'hidden';
    // 排序手柄显示后内容高度会变化，立即重新调整窗口高度（读取 scrollHeight 会强制同步布局）
    autoResizeHeight(true);
    console.log('[Timeline] 进入自定义排序模式');
  });

  // 退出自定义排序模式
  function exitCustomSortMode() {
    isCustomSortMode = false;
    var container = document.querySelector('.timeline-container');
    if (container) container.classList.remove('sort-mode');
    // 恢复滚动条
    var scrollEl = document.getElementById('timelineScroll');
    if (scrollEl) scrollEl.style.overflowY = '';
    // 退出排序模式后内容高度会变化，重新调整窗口高度
    autoResizeHeight();
    console.log('[Timeline] 退出自定义排序模式');
  }

  // 点击除拖拽图标外的任何地方退出自定义排序模式
  document.addEventListener('click', function(e) {
    if (!isCustomSortMode) return;
    // 如果正在拖拽中，不退出
    if (dragState) return;
    // 只有点击拖拽手柄时不退出，其他任何地方都退出
    if (e.target.closest('.drag-handle')) return;
    exitCustomSortMode();
  });

  // 拖拽开始
  document.addEventListener('mousedown', function(e) {
    if (!isCustomSortMode) return;
    var handle = e.target.closest('.drag-handle');
    if (!handle) return;

    // 阻止事件冒泡，防止触发窗口拖拽
    e.preventDefault();
    e.stopPropagation();

    var item = handle.closest('.timeline-item');
    if (!item) return;

    var taskId = item.dataset.taskId;
    var rect = item.getBoundingClientRect();
    var track = item.parentNode;
    var allItems = Array.from(track.querySelectorAll('.timeline-item'));

    dragState = {
      taskId: taskId,
      item: item,
      startY: e.clientY,
      offsetY: e.clientY - rect.top,
      initialIndex: allItems.indexOf(item)
    };

    // 添加拖拽样式
    item.classList.add('dragging');

    // 防止滚动条出现（同时隐藏 body 和 timeline-scroll 的滚动条）
    document.body.style.overflow = 'hidden';
    var scrollEl = document.getElementById('timelineScroll');
    if (scrollEl) scrollEl.style.overflowY = 'hidden';
  });

  // 拖拽移动
  document.addEventListener('mousemove', function(e) {
    if (!dragState) return;
    e.preventDefault();

    var item = dragState.item;
    var deltaY = e.clientY - dragState.startY;

    // 移动拖拽中的卡片
    item.style.transform = 'translateY(' + deltaY + 'px)';
    item.style.transition = 'none';

    // 计算当前悬停位置
    var track = item.parentNode;
    var items = Array.from(track.querySelectorAll('.timeline-item:not(.dragging)'));

    // 清除所有 drag-over
    items.forEach(function(el) { el.classList.remove('drag-over'); });

    // 找到应该插入的位置
    var itemRect = item.getBoundingClientRect();
    var itemMid = itemRect.top + itemRect.height / 2 + deltaY;

    var targetIndex = items.length;
    for (var i = 0; i < items.length; i++) {
      var otherRect = items[i].getBoundingClientRect();
      var otherMid = otherRect.top + otherRect.height / 2;
      if (itemMid < otherMid) {
        targetIndex = i;
        break;
      }
    }

    // 记录目标位置，供 mouseup 使用
    dragState.targetIndex = targetIndex;

    // 高亮目标位置
    if (targetIndex < items.length) {
      items[targetIndex].classList.add('drag-over');
    }
  });

  // 拖拽结束
  document.addEventListener('mouseup', function(e) {
    if (!dragState) return;
    e.preventDefault();

    var item = dragState.item;
    var taskId = dragState.taskId;
    var track = item.parentNode;

    // 恢复样式
    item.classList.remove('dragging');
    item.style.transform = '';
    item.style.transition = '';

    // 恢复滚动
    document.body.style.overflow = '';
    var scrollEl = document.getElementById('timelineScroll');
    if (scrollEl) scrollEl.style.overflowY = '';

    // 清除所有 drag-over
    var allItems = track.querySelectorAll('.timeline-item');
    allItems.forEach(function(el) { el.classList.remove('drag-over'); });

    // 使用 mousemove 中记录的目标位置
    var targetIndex = dragState.targetIndex;
    var initialIndex = dragState.initialIndex;

    // 如果位置有变化，重新排序
    if (targetIndex !== undefined && targetIndex !== initialIndex) {
      var items = Array.from(track.querySelectorAll('.timeline-item'));
      // 移动 DOM 元素
      if (targetIndex < items.length) {
        track.insertBefore(item, items[targetIndex]);
      } else {
        track.appendChild(item);
      }

      // 更新 tasksData 顺序
      var movedTask = tasksData.find(function(t) { return t.id === taskId; });
      if (movedTask) {
        var dataIndex = tasksData.indexOf(movedTask);
        tasksData.splice(dataIndex, 1);
        tasksData.splice(targetIndex, 0, movedTask);

        // 更新 sort_order 并保存到数据库
        var taskOrders = [];
        tasksData.forEach(function(t, idx) {
          t.sort_order = idx;
          taskOrders.push({ id: t.id, sort_order: idx });
        });
        electronAPI.send('timeline-save-custom-order', { noteId: noteId, taskOrders: taskOrders });
        console.log('[Timeline] 自定义排序已更新');
      }
    }

    dragState = null;
  });

  // ========== 自动调整窗口高度 ==========
  var resizeTimeout = null;
  function autoResizeHeight(immediate) {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    var doResize = function() {
      var container = document.querySelector('.timeline-container');
      if (!container) return;
      // 折叠模式下不调整窗口大小，避免将折叠窗口从 45x45 撑高到 60px 导致底部出现透明区域
      if (container.classList.contains('folded-mode')) return;
      // 使用 body.scrollHeight 获取真实内容高度，不受当前窗口高度限制
      var contentHeight = document.body.scrollHeight;
      if (contentHeight > 0) {
        electronAPI.send('resize-sticky', { id: noteId, height: Math.ceil(contentHeight) });
      }
      resizeTimeout = null;
    };
    if (immediate) {
      doResize();
    } else {
      resizeTimeout = setTimeout(doResize, 50);
    }
  }

  // 页面加载完成后立即调整一次
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(autoResizeHeight, 0);
  } else {
    window.addEventListener('DOMContentLoaded', autoResizeHeight);
  }

  // 监听容器尺寸变化，自动调整高度（比 MutationObserver 更准确，能捕获图片加载、样式变化等）
  var resizeObserver = new ResizeObserver(function() {
    autoResizeHeight();
    updateScrollHint();
  });
  var container = document.querySelector('.timeline-container');
  if (container) {
    resizeObserver.observe(container);
  }

  // 初始化时应用任务文本长度限制，确保 DOM 已就绪
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      truncateAllTaskTexts();
      updateScrollHint();
    });
  } else {
    truncateAllTaskTexts();
    updateScrollHint();
  }
})();
