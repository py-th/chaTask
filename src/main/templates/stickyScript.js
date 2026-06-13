(function() {
  const electronAPI = window.electronAPI;
  if (!electronAPI) {
    console.error('electronAPI not found!');
    return;
  }
  console.log('Sticky note script loaded');

  const noteId = window.noteId;
  const taskId = window.taskId;
  
  const taskTextDiv = document.getElementById('taskText');
  const container = document.querySelector('.sticky-container');
  const datePickerPopup = document.getElementById('datePickerPopup');
  const popupDatePicker = document.getElementById('popupDatePicker');
  const popupConfirmBtn = document.getElementById('popupConfirmBtn');
  const popupCancelBtn = document.getElementById('popupCancelBtn');
  const reminderInfo = document.getElementById('reminderInfo');
  const avatarImg = document.querySelector('.avatar-area img');

  let isDragging = false;

  document.addEventListener('mousedown', (e) => {
    if (e.button === 2) return;
    isDragging = true;
    // 使用 screenX/screenY 而不是 clientX/clientY
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

  taskTextDiv.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (taskTextDiv.getAttribute('contenteditable') !== 'true') {
      taskTextDiv.setAttribute('contenteditable', 'true');
      taskTextDiv.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(taskTextDiv);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  taskTextDiv.addEventListener('blur', () => {
    if (taskTextDiv.getAttribute('contenteditable') === 'true') {
      const newContent = taskTextDiv.innerText;
      electronAPI.send('update-note-content', { id: noteId, content: newContent, taskId });
      taskTextDiv.removeAttribute('contenteditable');
    }
  });

  taskTextDiv.addEventListener('mousedown', (e) => {
    if (taskTextDiv.getAttribute('contenteditable') === 'true') e.stopPropagation();
  });

  document.body.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    electronAPI.send('show-note-context-menu', { noteId, taskId });
  });

  electronAPI.on('copy-task-text', () => {
    const text = taskTextDiv.innerText;
    electronAPI.send('copy-note-text', text);
    console.log('任务文本已发送到主进程复制');
  });

  electronAPI.on('fold-note', () => {
    container.classList.add('folded-mode');
    console.log('已折叠');
  });

  electronAPI.on('unfold-note', () => {
    container.classList.remove('folded-mode');
    console.log('已展开');
  });

  electronAPI.on('update-priority', (event, priority) => {
    console.log('update-priority received:', priority);
    let color = '';
    if (priority === 'high') color = '#ffcccc';
    else if (priority === 'medium') color = '#cce5ff';
    else if (priority === 'low') color = '#ccffcc';
    else color = '#feffcc';
    
    const taskDiv = document.querySelector('.task-text');
    if (taskDiv) taskDiv.style.backgroundColor = color;
    const toolbarDiv = document.querySelector('.toolbar');
    if (toolbarDiv) toolbarDiv.style.backgroundColor = color;
    if (datePickerPopup) datePickerPopup.style.backgroundColor = color;
    const avatarImg = document.querySelector('.avatar-area img');
    if (avatarImg) avatarImg.style.border = '2px solid ' + color;

    // 更新优先级图标显示
    let priorityIcon = '';
    if (priority === 'high') priorityIcon = '🔴';
    else if (priority === 'medium') priorityIcon = '🟡';
    else if (priority === 'low') priorityIcon = '🟢';
    else priorityIcon = '⚪';
    const prioritySpan = document.getElementById('taskPriority');
    if (prioritySpan) prioritySpan.innerText = priorityIcon;
  });

  electronAPI.on('update-status', (event, status) => {
    console.log('update-status received:', status);
    let icon = '';
    if (status === 'completed') icon = '✅';
    else if (status === 'in_progress') icon = '⏳';
    else if (status === 'pending') icon = '⏰';
    else if (status === 'overdue') icon = '⚠️';
    else icon = '⏰';
    
    const statusDiv = document.querySelector('.status-icon');
    if (statusDiv) statusDiv.innerText = icon;
    const statusSpan = document.getElementById('taskStatus');
    if (statusSpan) statusSpan.innerText = icon;
  });

  electronAPI.on('show-repeat-remind-picker', () => {
    showRepeatRemindPicker();
  });

  electronAPI.on('update-due-date', (event, newDate) => {
    const dueDateSpan = document.getElementById('dueDate');
    if (dueDateSpan) {
      const formattedDate = newDate ? new Date(newDate).toLocaleDateString() : '未设置';
      dueDateSpan.innerText = formattedDate;
    }
  });

  // 显示下次提醒信息
  electronAPI.on('update-reminder-info', (event, text) => {
    if (reminderInfo) {
      if (text) {
        reminderInfo.textContent = '⏰ ' + text;
        reminderInfo.classList.remove('hidden');
      } else {
        reminderInfo.classList.add('hidden');
      }
    }
  });

  // 开始头像闪烁
  electronAPI.on('start-avatar-blink', () => {
    if (avatarImg) {
      avatarImg.classList.add('avatar-blink');
    }
  });

  // 停止头像闪烁
  electronAPI.on('stop-avatar-blink', () => {
    if (avatarImg) {
      avatarImg.classList.remove('avatar-blink');
    }
  });

  // 处理提醒动作（从独立弹窗回调）
  electronAPI.on('reminder-action-callback', (event, action) => {
    console.log('提醒动作回调:', action);
    // 如果标记完成或忽略，停止闪烁
    if (action === 'complete' || action === 'dismiss') {
      if (avatarImg) {
        avatarImg.classList.remove('avatar-blink');
      }
    }
  });

  function showRepeatRemindPicker() {
    console.log('显示提醒和重复设置器');
    electronAPI.send('open-reminder-dialog', { noteId, taskId });
  }

  function showDatePicker() {
    const dueDateSpan = document.getElementById('dueDate');
    const rect = dueDateSpan.getBoundingClientRect();
    datePickerPopup.style.left = rect.left + 'px';
    datePickerPopup.style.top = (rect.bottom + 5) + 'px';
    datePickerPopup.style.display = 'block';
    
    const originalDueDate = dueDateSpan.getAttribute('data-due-date') || '';
    popupDatePicker.value = originalDueDate || '';
  }

  function hideDatePicker() {
    datePickerPopup.style.display = 'none';
  }

  popupConfirmBtn.addEventListener('click', () => {
    const selectedDate = popupDatePicker.value;
    if (selectedDate) {
      electronAPI.send('set-due-date', { noteId, taskId, date: selectedDate });
    }
    hideDatePicker();
  });

  popupCancelBtn.addEventListener('click', hideDatePicker);

  document.getElementById('dueDate').addEventListener('click', (e) => {
    e.stopPropagation();
    showDatePicker();
  });

  document.addEventListener('click', (e) => {
    if (!datePickerPopup.contains(e.target) && e.target.id !== 'dueDate') {
      hideDatePicker();
    }
  });

  document.getElementById('taskStatus').addEventListener('click', () => {
    electronAPI.send('set-status', { noteId, taskId });
  });

  document.getElementById('taskPriority').addEventListener('click', () => {
    electronAPI.send('set-priority', { noteId, taskId });
  });

  reminderInfo.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!reminderInfo.classList.contains('hidden')) {
      showRepeatRemindPicker();
    }
  });

  // ========== 统一样式面板 ==========
  const stylePanel = document.getElementById('stylePanel');
  const stylePanelClose = document.getElementById('stylePanelClose');
  const styleOpacityRange = document.getElementById('styleOpacityRange');
  const styleOpacityValue = document.getElementById('styleOpacityValue');
  const styleBgColor = document.getElementById('styleBgColor');
  const styleBgReset = document.getElementById('styleBgReset');
  const styleTextColor = document.getElementById('styleTextColor');
  const styleTextReset = document.getElementById('styleTextReset');
  const styleBoldToggle = document.getElementById('styleBoldToggle');
  const styleFontDec = document.getElementById('styleFontDec');
  const styleFontInc = document.getElementById('styleFontInc');
  const styleFontSize = document.getElementById('styleFontSize');
  const styleFontFamily = document.getElementById('styleFontFamily');
  const styleLineHeightDec = document.getElementById('styleLineHeightDec');
  const styleLineHeightInc = document.getElementById('styleLineHeightInc');
  const styleLineHeight = document.getElementById('styleLineHeight');
  const alignBtns = document.querySelectorAll('.align-btn');
  const contentArea = document.querySelector('.content-area');
  const taskText = document.getElementById('taskText');

  let currentStyleConfig = Object.assign({
    opacity: 1,
    bgColor: '',
    textColor: '',
    bold: false,
    fontSize: 14,
    fontFamily: '',
    lineHeight: 1.4,
    textAlign: 'left'
  }, window.styleConfig || {});

  function applyStyleConfig(config) {
    if (contentArea) {
      contentArea.style.opacity = config.opacity;
    }
    if (taskText) {
      taskText.style.fontWeight = config.bold ? 'bold' : 'normal';
      if (config.textColor) {
        taskText.style.color = config.textColor;
      } else {
        taskText.style.color = '';
      }
      taskText.style.fontSize = (config.fontSize || 14) + 'px';
      taskText.style.fontFamily = config.fontFamily || '';
      taskText.style.lineHeight = config.lineHeight || 1.4;
      taskText.style.textAlign = config.textAlign || 'left';
    }
  }

  function syncStylePanel(config) {
    if (styleOpacityRange) styleOpacityRange.value = config.opacity;
    if (styleOpacityValue) styleOpacityValue.textContent = Math.round(config.opacity * 100) + '%';
    if (styleBgColor) styleBgColor.value = config.bgColor || '#ffffff';
    if (styleTextColor) styleTextColor.value = config.textColor || '#000000';
    if (styleBoldToggle) {
      styleBoldToggle.textContent = config.bold ? '开启' : '关闭';
      styleBoldToggle.classList.toggle('active', !!config.bold);
    }
    if (styleFontSize) styleFontSize.textContent = config.fontSize || 14;
    if (styleFontFamily) styleFontFamily.value = config.fontFamily || '';
    if (styleLineHeight) styleLineHeight.textContent = (config.lineHeight || 1.4).toFixed(1);
    if (alignBtns) {
      alignBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === (config.textAlign || 'left'));
      });
    }
  }

  function saveStyleConfig(config) {
    currentStyleConfig = Object.assign({}, config);
    electronAPI.send('save-style-config', { taskId, styleConfig: config });
  }

  applyStyleConfig(currentStyleConfig);

  electronAPI.on('show-style-panel', () => {
    if (stylePanel) {
      syncStylePanel(currentStyleConfig);
      stylePanel.classList.add('show');
    }
  });

  if (stylePanelClose) {
    stylePanelClose.addEventListener('click', () => {
      stylePanel.classList.remove('show');
    });
  }

  function hideStylePanel() {
    if (stylePanel) {
      stylePanel.classList.remove('show');
    }
  }

  if (styleOpacityRange) {
    styleOpacityRange.addEventListener('input', () => {
      const val = parseFloat(styleOpacityRange.value);
      if (contentArea) contentArea.style.opacity = val;
      if (styleOpacityValue) styleOpacityValue.textContent = Math.round(val * 100) + '%';
      const config = Object.assign({}, currentStyleConfig, { opacity: val });
      saveStyleConfig(config);
    });
  }

  if (styleBgColor) {
    styleBgColor.addEventListener('input', () => {
      const val = styleBgColor.value;
      const taskDiv = document.querySelector('.task-text');
      const toolbarDiv = document.querySelector('.toolbar');
      if (taskDiv) taskDiv.style.backgroundColor = val;
      if (toolbarDiv) toolbarDiv.style.backgroundColor = val;
      if (datePickerPopup) datePickerPopup.style.backgroundColor = val;
      if (avatarImg) avatarImg.style.border = '2px solid ' + val;
      const config = Object.assign({}, currentStyleConfig, { bgColor: val });
      saveStyleConfig(config);
    });
  }

  if (styleBgReset) {
    styleBgReset.addEventListener('click', () => {
      const originalColor = '';
      const taskDiv = document.querySelector('.task-text');
      const toolbarDiv = document.querySelector('.toolbar');
      if (taskDiv) taskDiv.style.backgroundColor = originalColor;
      if (toolbarDiv) toolbarDiv.style.backgroundColor = originalColor;
      if (datePickerPopup) datePickerPopup.style.backgroundColor = originalColor;
      if (avatarImg) avatarImg.style.border = '';
      if (styleBgColor) styleBgColor.value = '#ffffff';
      const config = Object.assign({}, currentStyleConfig, { bgColor: '' });
      saveStyleConfig(config);
    });
  }

  if (styleTextColor) {
    styleTextColor.addEventListener('input', () => {
      const val = styleTextColor.value;
      if (taskText) taskText.style.color = val;
      const config = Object.assign({}, currentStyleConfig, { textColor: val });
      saveStyleConfig(config);
    });
  }

  if (styleTextReset) {
    styleTextReset.addEventListener('click', () => {
      if (taskText) taskText.style.color = '';
      if (styleTextColor) styleTextColor.value = '#000000';
      const config = Object.assign({}, currentStyleConfig, { textColor: '' });
      saveStyleConfig(config);
    });
  }

  if (styleBoldToggle) {
    styleBoldToggle.addEventListener('click', () => {
      const current = !!currentStyleConfig.bold;
      const val = !current;
      if (taskText) taskText.style.fontWeight = val ? 'bold' : 'normal';
      styleBoldToggle.textContent = val ? '开启' : '关闭';
      styleBoldToggle.classList.toggle('active', val);
      const config = Object.assign({}, currentStyleConfig, { bold: val });
      saveStyleConfig(config);
    });
  }

  if (styleFontDec) {
    styleFontDec.addEventListener('click', () => {
      const current = currentStyleConfig.fontSize || 14;
      const val = Math.max(10, current - 1);
      if (taskText) taskText.style.fontSize = val + 'px';
      if (styleFontSize) styleFontSize.textContent = val;
      const config = Object.assign({}, currentStyleConfig, { fontSize: val });
      saveStyleConfig(config);
    });
  }

  if (styleFontInc) {
    styleFontInc.addEventListener('click', () => {
      const current = currentStyleConfig.fontSize || 14;
      const val = Math.min(32, current + 1);
      if (taskText) taskText.style.fontSize = val + 'px';
      if (styleFontSize) styleFontSize.textContent = val;
      const config = Object.assign({}, currentStyleConfig, { fontSize: val });
      saveStyleConfig(config);
    });
  }

  if (styleFontFamily) {
    styleFontFamily.addEventListener('change', () => {
      const val = styleFontFamily.value;
      if (taskText) taskText.style.fontFamily = val || '';
      const config = Object.assign({}, currentStyleConfig, { fontFamily: val });
      saveStyleConfig(config);
    });
  }

  if (styleLineHeightDec) {
    styleLineHeightDec.addEventListener('click', () => {
      const current = currentStyleConfig.lineHeight || 1.4;
      const val = Math.max(1.0, Math.round((current - 0.1) * 10) / 10);
      if (taskText) taskText.style.lineHeight = val;
      if (styleLineHeight) styleLineHeight.textContent = val.toFixed(1);
      const config = Object.assign({}, currentStyleConfig, { lineHeight: val });
      saveStyleConfig(config);
    });
  }

  if (styleLineHeightInc) {
    styleLineHeightInc.addEventListener('click', () => {
      const current = currentStyleConfig.lineHeight || 1.4;
      const val = Math.min(2.0, Math.round((current + 0.1) * 10) / 10);
      if (taskText) taskText.style.lineHeight = val;
      if (styleLineHeight) styleLineHeight.textContent = val.toFixed(1);
      const config = Object.assign({}, currentStyleConfig, { lineHeight: val });
      saveStyleConfig(config);
    });
  }

  if (alignBtns) {
    alignBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.align;
        alignBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (taskText) taskText.style.textAlign = val;
        const config = Object.assign({}, currentStyleConfig, { textAlign: val });
        saveStyleConfig(config);
      });
    });
  }

  document.addEventListener('click', (e) => {
    if (stylePanel && stylePanel.classList.contains('show')) {
      if (!stylePanel.contains(e.target) && e.target.id !== 'taskStyle') {
        hideStylePanel();
      }
    }
  });

  if (stylePanel) {
    stylePanel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }
})();