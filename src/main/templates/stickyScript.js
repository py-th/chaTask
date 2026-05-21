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
    else color = 'rgba(255,249,196,0.95)';
    
    const taskDiv = document.querySelector('.task-text');
    if (taskDiv) taskDiv.style.backgroundColor = color;
    const toolbarDiv = document.querySelector('.toolbar');
    if (toolbarDiv) toolbarDiv.style.backgroundColor = color;
    if (datePickerPopup) datePickerPopup.style.backgroundColor = color;
    const avatarImg = document.querySelector('.avatar-area img');
    if (avatarImg) avatarImg.style.border = '2px solid ' + color;

    // 更新优先级文本显示
    let priorityText = '';
    if (priority === 'high') priorityText = '高';
    else if (priority === 'medium') priorityText = '中';
    else if (priority === 'low') priorityText = '低';
    else priorityText = '无';
    const prioritySpan = document.getElementById('taskPriority');
    if (prioritySpan) prioritySpan.innerText = priorityText;
  });

  electronAPI.on('update-status', (event, status) => {
    console.log('update-status received:', status);
    let icon = '', text = '';
    if (status === 'completed') { icon = '✅'; text = '完成'; }
    else if (status === 'in_progress') { icon = '⏳'; text = '进行中'; }
    else if (status === 'pending') { icon = '⏰'; text = '待办'; }
    else if (status === 'overdue') { icon = '⚠️'; text = '逾期'; }
    else { text = '待办'; }
    
    const statusDiv = document.querySelector('.status-icon');
    if (statusDiv) statusDiv.innerText = icon;
    const statusSpan = document.getElementById('taskStatus');
    if (statusSpan) statusSpan.innerText = text;
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
})();