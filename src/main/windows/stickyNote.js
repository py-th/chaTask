// src/main/windows/stickyNote.js
const { BrowserWindow, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');
const { updateTask, saveTimelineNote, deleteTimelineNote, hideTimelineNote, getTimelineSortOrder } = require('../../database/repositories/taskRepository');
const { loadUserSettings } = require('../configManager');

function getStickyIconPath() {
  // 优先使用 48x48 图标，任务栏显示效果较好
  if (process.resourcesPath) {
    const prodPath = path.join(process.resourcesPath, 'resource', 'tray_icon48.png');
    if (fs.existsSync(prodPath)) {
      return prodPath;
    }
  }
  const devPath = path.join(process.cwd(), 'public', 'resource', 'tray_icon48.png');
  if (fs.existsSync(devPath)) {
    return devPath;
  }
  // 降级使用 32x32
  if (process.resourcesPath) {
    const prodPath32 = path.join(process.resourcesPath, 'resource', 'tray_icon32.png');
    if (fs.existsSync(prodPath32)) {
      return prodPath32;
    }
  }
  const devPath32 = path.join(process.cwd(), 'public', 'resource', 'tray_icon32.png');
  if (fs.existsSync(devPath32)) {
    return devPath32;
  }
  return null;
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

function formatDateTimeWithYear(isoString) {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

class StickyNoteManager {
  constructor(reminderService) {
    this.notes = new Map();
    this.nextId = 1;
    this.templatePath = path.join(__dirname, '../templates/stickyTemplate.html');
    this.scriptPath = path.join(__dirname, '../templates/stickyScript.js');
    this.timelineTemplatePath = path.join(__dirname, '../templates/stickyTimelineTemplate.html');
    this.timelineScriptPath = path.join(__dirname, '../templates/stickyTimelineScript.js');
    this.reminderService = reminderService;
    this.settings = {
      edgeSnap: true,
      edgeSnapThreshold: 10,
      foldedSize: 45,
      foldedAvatarSize: 45,
      foldedEdge: 'right',
      taskTextMaxLength: 200,
      defaultWidth: 300,
      minHeight: 60
    };
    this.loadSettings();
    this.stickyIcon = null;
    const iconPath = getStickyIconPath();
    if (iconPath) {
      try {
        this.stickyIcon = nativeImage.createFromPath(iconPath);
      } catch (err) {
        console.error('[StickyNote] 加载便签图标失败:', err);
      }
    }
  }

  // 从用户设置加载便签相关配置
  loadSettings() {
    try {
      const userSettings = loadUserSettings();
      const stickySettings = userSettings.sticky || {};
      this.settings.edgeSnap = stickySettings.edgeSnap !== false;
      this.settings.edgeSnapThreshold = stickySettings.edgeSnapThreshold || 10;
      this.settings.foldedAvatarSize = this._clampFoldedAvatarSize(stickySettings.foldedAvatarSize);
      this.settings.foldedEdge = this._normalizeFoldedEdge(stickySettings.foldedEdge);
      this.settings.taskTextMaxLength = this._clampTaskTextMaxLength(stickySettings.taskTextMaxLength);
      this.settings.skipTaskbar = stickySettings.skipTaskbar !== false;
    } catch (err) {
      console.error('[StickyNote] 加载便签设置失败:', err);
    }
  }

  _clampFoldedAvatarSize(size) {
    const n = parseInt(size, 10);
    if (isNaN(n)) return 45;
    return Math.max(30, Math.min(60, n));
  }

  _normalizeFoldedEdge(edge) {
    if (edge === 'top' || edge === 'left' || edge === 'right') return edge;
    return 'right';
  }

  _clampTaskTextMaxLength(length) {
    const n = parseInt(length, 10);
    if (isNaN(n)) return 200;
    return Math.max(50, Math.min(1000, n));
  }

  // 当设置中的任务文本最大长度变化时，同步更新所有已打开便签
  updateTaskTextMaxLength(length) {
    const newLength = this._clampTaskTextMaxLength(length);
    if (this.settings.taskTextMaxLength === newLength) return;
    this.settings.taskTextMaxLength = newLength;

    for (const [id, note] of this.notes.entries()) {
      if (!note.win || note.win.isDestroyed()) continue;
      try {
        note.win.webContents.send('update-task-text-max-length', newLength);
      } catch (err) {
        console.error('同步任务文本最大长度失败:', err);
      }
    }
  }

  // 当设置中的折叠头像大小变化时，同步更新所有已打开便签
  updateFoldedAvatarSize(size) {
    const newSize = this._clampFoldedAvatarSize(size);
    if (this.settings.foldedAvatarSize === newSize) return;
    this.settings.foldedAvatarSize = newSize;

    for (const [id, note] of this.notes.entries()) {
      if (!note.win || note.win.isDestroyed()) continue;

      // 如果便签当前处于折叠状态，需要同步调整窗口尺寸和贴边位置
      if (note.isFolded) {
        const bounds = note.win.getBounds();
        const workArea = this.getCurrentDisplayWorkArea(note.win);
        let newX = bounds.x;
        let newY = bounds.y;

        if (note.snapEdge === 'right') {
          newX = workArea.width - newSize;
        } else if (note.snapEdge === 'left') {
          newX = 0;
        } else if (note.snapEdge === 'top') {
          newY = 0;
        }

        note.win.setMinimumSize(newSize, newSize);
        note.win.setBounds({ width: newSize, height: newSize, x: newX, y: newY });
      }

      note.win.webContents.send('update-folded-avatar-size', newSize);
    }
  }

  // 当设置中的默认贴边位置变化时，同步更新所有已折叠便签
  updateFoldedEdge(edge) {
    const newEdge = this._normalizeFoldedEdge(edge);
    if (this.settings.foldedEdge === newEdge) return;
    this.settings.foldedEdge = newEdge;

    for (const [id, note] of this.notes.entries()) {
      if (!note.win || note.win.isDestroyed() || !note.isFolded) continue;

      const size = this.settings.foldedAvatarSize;
      const workArea = this.getCurrentDisplayWorkArea(note.win);
      let newX = note.win.getBounds().x;
      let newY = note.win.getBounds().y;

      if (newEdge === 'right') {
        newX = workArea.width - size;
        newY = 0;
      } else if (newEdge === 'left') {
        newX = 0;
        newY = 0;
      } else if (newEdge === 'top') {
        newX = 0;
        newY = 0;
      }

      note.snapEdge = newEdge;
      note.win.setMinimumSize(size, size);
      note.win.setBounds({ width: size, height: size, x: newX, y: newY });
    }
  }

  // 读取并填充 HTML 模板
  generateHTML(task, id) {
    try {
      let template = fs.readFileSync(this.templatePath, 'utf8');
      const scriptContent = fs.readFileSync(this.scriptPath, 'utf8');
      
      // 转义函数
      const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/[&<>"'/]/g, (tag) => {
          const escapeMap = { '&': '&amp;', '<': '&gt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' };
          return escapeMap[tag] || tag;
        });
      };

      // 获取状态图标（与折叠时头像上显示的一致）
      const getStatusIcon = (status) => {
        switch (status) {
          case 'pending': return '⏰';
          case 'in_progress': return '⏳';
          case 'completed': return '✅';
          case 'overdue': return '⚠️';
          default: return '⏰';
        }
      };

      // 获取优先级图标
      const getPriorityIcon = (priority) => {
        switch (priority) {
          case 'high': return '🔴';
          case 'medium': return '🟡';
          case 'low': return '🟢';
          case 'none': return '⚪';
          default: return '⚪';
        }
      };

      // 获取状态文本（用于工具栏徽章）
      const getStatusLabel = (status) => {
        switch (status) {
          case 'pending': return '待办';
          case 'in_progress': return '进行中';
          case 'completed': return '已完成';
          case 'overdue': return '逾期';
          default: return '待办';
        }
      };

      // 获取优先级文本（用于工具栏徽章）
      const getPriorityLabel = (priority) => {
        switch (priority) {
          case 'high': return '高';
          case 'medium': return '中';
          case 'low': return '低';
          case 'none': return '无';
          default: return '无';
        }
      };

      // 获取优先级颜色（仅作为默认颜色）
      const getPriorityDefaultColor = (priority) => {
        switch (priority) {
          case 'high': return '#ffcccc';
          case 'medium': return '#cce5ff';
          case 'low': return '#ccffcc';
          default: return 'rgba(255,249,196,0.95)';
        }
      };

      // 获取便签背景色：用户手动设置 > 优先级默认颜色
      const priorityDefaultColor = getPriorityDefaultColor(task.priority);
      const noteBackgroundColor = task.color && task.color.trim() ? task.color : priorityDefaultColor;

      // 获取状态图标
      let statusIcon = '';
      switch (task.status) {
        case 'completed': statusIcon = '✅'; break;
        case 'in_progress': statusIcon = '⏳'; break;
        case 'pending': statusIcon = '⏰'; break;
        case 'overdue': statusIcon = '⚠️'; break;
        default: statusIcon = '';
      }

      // 头像图片 - 使用实际背景色
      const defaultAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";
      const avatarImg = task.sender_avatar ? 
        `<img class="avatar" src="${escapeHtml(task.sender_avatar)}" style="border: 2px solid ${noteBackgroundColor};" />` : 
        `<img class="avatar" src="${defaultAvatarSvg}" style="border: 2px solid ${noteBackgroundColor};" />`;
      
        // 截止日期文本
      const dueDateText = task.due_date ? new Date(task.due_date).toLocaleDateString() : '未设置';
      const content = escapeHtml(task.content);
      const metaSenderName = escapeHtml(task.sender_name || '未知');
      const createdTime = task.created_at ? formatDateTime(task.created_at) : '';
      const source = escapeHtml(task.source || '未知');
      const sourceTimeHtml = task.source_time
        ? `<div class="info-item"><span class="clickable meta-badge source-time-badge" id="taskSourceTime">${formatDateTimeWithYear(task.source_time)}</span></div>`
        : '';
      const statusText = getStatusLabel(task.status);
      const priorityText = getPriorityLabel(task.priority);

      // 样式配置
      const styleConfig = task.style_config ? (typeof task.style_config === 'string' ? JSON.parse(task.style_config) : task.style_config) : {};
      const styleConfigJson = JSON.stringify({
        opacity: task.opacity != null ? task.opacity : 1.0,
        bgColor: styleConfig.bgColor || '',
        textColor: styleConfig.textColor || '',
        bold: styleConfig.bold || false,
        fontSize: styleConfig.fontSize || 14,
        fontFamily: styleConfig.fontFamily || '',
        lineHeight: styleConfig.lineHeight || 1.4,
        textAlign: styleConfig.textAlign || 'left'
      });

      // 替换模板中的占位符
      const replacements = {
        '{{noteId}}': id,
        '{{taskId}}': task.id,
        '{{priorityColor}}': noteBackgroundColor,
        '{{statusIcon}}': statusIcon,
        '{{avatarImg}}': avatarImg,
        '{{content}}': content,
        '{{metaSenderName}}': metaSenderName,
        '{{createdTime}}': createdTime,
        '{{source}}': source,
        '{{sourceTimeHtml}}': sourceTimeHtml,
        '{{dueDate}}': task.due_date || '',
        '{{dueDateText}}': dueDateText,
        '{{statusText}}': statusText,
        '{{priorityText}}': priorityText,
        '{{priority}}': task.priority || 'none',
        '{{status}}': task.status || 'pending',
        '{{opacity}}': task.opacity != null ? task.opacity : 1.0,
        '{{styleConfigJson}}': styleConfigJson,
        '{{foldedAvatarSize}}': this.settings.foldedAvatarSize,
        '{{taskTextMaxLength}}': this.settings.taskTextMaxLength
      };

      // 执行替换
      for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(new RegExp(placeholder, 'g'), value);
      }

      // 将外部脚本引用替换为内联脚本
      template = template.replace('<script src="stickyScript.js"></script>', `<script>${scriptContent}</script>`);

      return template;
    } catch (error) {
      console.error('生成便签 HTML 失败:', error);
      // 返回一个简单的错误页面
      return `<html><body><div>加载便签失败🤔</div></body></html>`;
    }
  }

  // 生成时间轴 HTML
  // sortOrder/styleConfig 可直接传入；若未传入则从 notes 缓存中读取（兼容旧调用）
  generateTimelineHTML(tasks, senderName, senderAvatar, id, sortOrder, styleConfig) {
    try {
      let template = fs.readFileSync(this.timelineTemplatePath, 'utf8');
      const scriptContent = fs.readFileSync(this.timelineScriptPath, 'utf8');
      const note = this.notes.get(id);
      const timelineStyleConfig = styleConfig !== undefined
        ? styleConfig
        : (note && note.styleConfig ? note.styleConfig : { opacity: 1, bgColor: '' });
      const finalSortOrder = sortOrder !== undefined
        ? sortOrder
        : (note && note.sortOrder ? note.sortOrder : 'asc');

      // 根据排序方式处理任务列表
      let sortedTasks = [...tasks];
      if (finalSortOrder === 'desc') {
        sortedTasks.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA; // 降序：最新在前
        });
      } else if (finalSortOrder === 'custom') {
        // 自定义排序：保持数据库中的 sort_order 顺序（已在查询时排序）
        sortedTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      } else {
        sortedTasks.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB; // 升序：最旧在前
        });
      }

      const escapeHtml = (str) => {
        if (!str) return '';
        return str.replace(/[&<>"'/]/g, (tag) => {
          const escapeMap = { '&': '&amp;', '<': '&gt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;' };
          return escapeMap[tag] || tag;
        });
      };

      const getStatusText = (status) => {
        switch (status) {
          case 'pending': return '待办';
          case 'in_progress': return '进行中';
          case 'completed': return '已完成';
          case 'overdue': return '逾期';
          default: return '待办';
        }
      };

      const getPriorityText = (priority) => {
        switch (priority) {
          case 'high': return '高';
          case 'medium': return '中';
          case 'low': return '低';
          default: return '无';
        }
      };

      // 头像
      const defaultAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";
      const avatarImg = senderAvatar
        ? `<img class="avatar" src="${escapeHtml(senderAvatar)}" />`
        : `<img class="avatar" src="${defaultAvatarSvg}" />`;

      // 构建任务列表 HTML
      let timelineItemsHtml = '';
      if (sortedTasks.length > 0) {
        timelineItemsHtml = '<div class="timeline-track"><div class="timeline-line"></div>';
        for (const task of sortedTasks) {
          const timeStr = task.created_at ? new Date(task.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
          const isCompleted = task.status === 'completed' || task.is_completed === 1;
          const isOverdue = task.status === 'overdue';
          const completedClass = isCompleted ? ' completed' : (isOverdue ? ' overdue' : '');
          const reminderText = task.reminderRule && this.reminderService
            ? this.reminderService.getNextReminderText(task.reminderRule)
            : '';
          const dueDate = task.due_date || '';
          const dueDateText = dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';
          const dueDateTitle = dueDate ? `截止: ${new Date(dueDate + 'T00:00:00').toLocaleDateString('zh-CN')}` : '点击设置截止日期';
          const dueDateClass = dueDate ? ' has-due-date' : '';
          timelineItemsHtml += `
          <div class="timeline-item${completedClass}" data-task-id="${escapeHtml(task.id)}">
            <div class="timeline-dot${dueDateClass}${isOverdue ? ' is-overdue' : ''}" title="${dueDateTitle}" data-due-date="${escapeHtml(dueDate)}" style="cursor: pointer;"></div>
            <div class="task-time">
              <span class="time-text">${timeStr}</span>
              <div class="drag-handle"><div class="grip-dots"><span></span><span></span><span></span><span></span><span></span><span></span></div></div>
            </div>
            <div class="task-card">
              <div class="task-text" contenteditable="false">${escapeHtml(task.content)}<span class="expand-link">展开</span></div>
              <div class="task-meta">
                <span class="meta-badge priority-${task.priority}" data-type="priority">${getPriorityText(task.priority)}</span>
                <span class="meta-badge status-${task.status}" data-type="status">${getStatusText(task.status)}</span>
                ${dueDateText ? `<span class="due-date-badge" title="截止: ${dueDateText}">📅 ${dueDateText}</span>` : ''}
                ${reminderText ? `<span class="meta-badge reminder" data-task-id="${escapeHtml(task.id)}">⏰ ${reminderText}</span>` : ''}
              </div>
            </div>
          </div>`;
        }
        timelineItemsHtml += '</div>';
      } else {
        timelineItemsHtml = '<div class="timeline-empty">暂无任务</div>';
      }

      const displayName = escapeHtml(senderName || '未知');
      const senderNameJs = (senderName || '未知').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
      const source = escapeHtml((sortedTasks.length > 0 && sortedTasks[0].source) ? sortedTasks[0].source : '未知');

      const tasksJson = JSON.stringify(sortedTasks.map(t => ({
        id: t.id,
        content: t.content,
        status: t.status,
        priority: t.priority,
        created_at: t.created_at,
        due_date: t.due_date || null,
        sort_order: t.sort_order || 0,
        reminderTime: t.reminderRule ? t.reminderRule.reminder_time : null
      })));

      const replacements = {
        '{{noteId}}': id,
        '{{senderName}}': displayName,
        '{{senderNameJs}}': senderNameJs,
        '{{taskCount}}': sortedTasks.length,
        '{{source}}': source,
        '{{avatarImg}}': avatarImg,
        '{{timelineItems}}': timelineItemsHtml,
        '{{tasksJson}}': tasksJson,
        '{{timelineStyleConfig}}': JSON.stringify(timelineStyleConfig),
        '{{foldedAvatarSize}}': this.settings.foldedAvatarSize,
        '{{taskTextMaxLength}}': this.settings.taskTextMaxLength
      };

      for (const [placeholder, value] of Object.entries(replacements)) {
        template = template.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value));
      }

      template = template.replace('<script src="stickyTimelineScript.js"></script>', `<script>${scriptContent}</script>`);

      return template;
    } catch (error) {
      console.error('生成时间轴便签 HTML 失败:', error);
      return `<html><body><div>加载时间轴失败🤔</div></body></html>`;
    }
  }

  createTimelineNote(tasks, senderName, senderAvatar, options = {}) {
    const id = this.nextId++;
    this.loadSettings();
    const userSettings = loadUserSettings();
    const skipTaskbar = userSettings.sticky && userSettings.sticky.skipTaskbar !== false;

    let taskbarIcon = this.stickyIcon;
    if (senderAvatar && !senderAvatar.includes('svg+xml')) {
      try {
        if (senderAvatar.startsWith('data:image/')) {
          taskbarIcon = nativeImage.createFromDataURL(senderAvatar);
        } else {
          const base64Data = senderAvatar.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          taskbarIcon = nativeImage.createFromBuffer(buffer);
        }
      } catch (err) {
        console.error('[StickyNote] 从头像创建时间轴图标失败:', err);
        taskbarIcon = this.stickyIcon;
      }
    }
    // 创建时间轴便签窗口
    const winOptions = {
      width: 300,
      height: 400,
      alwaysOnTop: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      skipTaskbar: skipTaskbar,
      icon: taskbarIcon || undefined,
      minWidth: 300,
      minHeight: 200,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload/index.js')
      }
    };

    // 恢复位置和置顶状态
    if (options.position && options.position.x != null && options.position.y != null) {
      winOptions.x = options.position.x;
      winOptions.y = options.position.y;
    }
    if (options.isPinned) {
      winOptions.alwaysOnTop = true;
    }

    const win = new BrowserWindow(winOptions);
    // 关闭窗口阴影
    //win.setFrame(false);
    //win.setAlwaysOnTop(true);
    win.setHasShadow(false);
    const initialStyleConfig = options.styleConfig || { opacity: 1, bgColor: '' };
    const initialSortOrder = options.sortOrder || getTimelineSortOrder(senderName) || 'asc';

    // 必须先在 notes 中注册，generateTimelineHTML 才能读取到 sortOrder/styleConfig
    this.notes.set(id, {
      win,
      taskId: null,
      isTimeline: true,
      senderName: senderName,
      senderAvatar: senderAvatar,
      isFolded: false,
      originalBounds: null,
      snapEdge: null,
      isDragging: false,
      styleConfig: initialStyleConfig,
      sortOrder: initialSortOrder,
      _closing: false
    });

    const html = this.generateTimelineHTML(tasks, senderName, senderAvatar, id, initialSortOrder, initialStyleConfig);
    win.loadURL(`data:text/html,${encodeURIComponent(html)}`);

    // 保存位置和状态的辅助函数
    const saveTimelineState = () => {
      try {
        const n = this.notes.get(id);
        if (n && n.isTimeline && !win.isDestroyed() && !n._closing) {
          const [x, y] = win.getPosition();
          saveTimelineNote(n.senderName, n.senderAvatar, n.styleConfig,
            win.isAlwaysOnTop(), x, y, n.sortOrder || 'asc');
        }
      } catch (err) {
        console.error('[StickyNote] 保存时间轴便签状态失败:', err);
      }
    };

    // 关闭前保存状态
    win.on('close', saveTimelineState);

    win.on('closed', () => {
      this.notes.delete(id);
    });

    // 监听位置变化，实时保存
    win.on('moved', saveTimelineState);

    // 页面加载完成后，应用恢复样式
    win.webContents.on('did-finish-load', () => {
      // 应用恢复样式
      if (initialStyleConfig && (initialStyleConfig.opacity !== 1 || initialStyleConfig.bgColor)) {
        win.webContents.send('timeline-update-opacity', initialStyleConfig.opacity);
        if (initialStyleConfig.bgColor) {
          win.webContents.send('timeline-update-bgcolor', initialStyleConfig.bgColor);
        }
      }
      // 应用排序方式（custom 模式下 HTML 生成时已按 sort_order 排好序，无需前端再排序）
      if (initialSortOrder !== 'asc' && initialSortOrder !== 'custom') {
        win.webContents.send('timeline-sort-tasks', initialSortOrder);
      }
    });

    // 创建时保存到数据库
    try {
      const [x, y] = win.getPosition();
      saveTimelineNote(senderName, senderAvatar, initialStyleConfig,
        win.isAlwaysOnTop(), x, y, initialSortOrder);
    } catch (err) {
      console.error('[StickyNote] 保存时间轴便签到数据库失败:', err);
    }

    return id;
  }

  async createNote(task) {
    const id = this.nextId++;
    this.loadSettings();
    // 读取用户设置中的 skipTaskbar 配置
    const userSettings = loadUserSettings();
    const skipTaskbar = userSettings.sticky && userSettings.sticky.skipTaskbar !== false;

    // 优先使用任务头像作为任务栏图标（跳过 SVG 格式的默认头像）
    let taskbarIcon = this.stickyIcon;
    if (task.sender_avatar && !task.sender_avatar.includes('svg+xml')) {
      try {
        if (task.sender_avatar.startsWith('data:image/')) {
          taskbarIcon = nativeImage.createFromDataURL(task.sender_avatar);
        } else {
          const base64Data = task.sender_avatar.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          taskbarIcon = nativeImage.createFromBuffer(buffer);
        }
      } catch (err) {
        console.error('[StickyNote] 从头像创建图标失败:', err);
        taskbarIcon = this.stickyIcon;
      }
    }
    // 创建便签窗口
    const win = new BrowserWindow({
      width: this.settings.defaultWidth || 300,
      height: this.settings.minHeight || 60,
      x: task.position_x || undefined,
      y: task.position_y || undefined,
      alwaysOnTop: task.is_pinned === 1,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      skipTaskbar: skipTaskbar,
      icon: taskbarIcon || undefined,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, '../../preload/index.js')
      }
    });
    win.setHasShadow(false); // 默认主窗口无阴影，展开时可根据需要恢复

    const html = this.generateHTML(task, id);
    win.loadURL(`data:text/html,${encodeURIComponent(html)}`);

    win.webContents.on('did-finish-load', async () => {
      win.webContents.executeJavaScript(`
        const body = document.body;
        const resizeObserver = new ResizeObserver(() => {
          const height = body.scrollHeight;
          window.electronAPI.send('resize-sticky', { id: ${id}, height });
        });
        resizeObserver.observe(body);
      `);

      // 加载提醒信息显示
      console.log(`[StickyNote] did-finish-load, taskId=${task.id}, reminderService=${!!this.reminderService}`);
      if (this.reminderService) {
        try {
          const rule = getReminderRuleByTaskId(task.id);
          console.log(`[StickyNote] 查询提醒规则: taskId=${task.id}, rule=${!!rule}`);
          if (rule) {
            console.log(`[StickyNote] 规则详情: repeat_type=${rule.repeat_type}, reminder_time=${rule.reminder_time}, start_date=${rule.start_date}, end_date=${rule.end_date}`);
            const nextText = this.reminderService.getNextReminderText(rule);
            console.log(`[StickyNote] 下次提醒文本: ${nextText}`);
            if (nextText) {
              win.webContents.send('update-reminder-info', nextText);
            }
          }
        } catch (err) {
          console.error('[StickyNote] 加载提醒信息失败:', err);
        }
      } else {
        console.log('[StickyNote] reminderService 未设置，跳过提醒信息加载');
      }
    });

    win.on('closed', () => this.notes.delete(id));

    this.notes.set(id, { 
      win, 
      taskId: task.id, 
      isFolded: false, 
      originalBounds: null,
      snapEdge: null,
      isDragging: false
    });
    return id;
  }

  resizeNote(id, height) {
    const note = this.notes.get(id);
    if (note && !note.win.isDestroyed()) {
      // 折叠状态下不调整窗口大小，避免将 45x45 的折叠窗口撑高到 60px 导致底部出现透明区域
      if (note.isFolded) return;
      const minHeight = this.settings.minHeight || 60;
      const newHeight = Math.max(minHeight, height);
      note.win.setBounds({ height: newHeight });
    }
  }

  getCurrentDisplayWorkArea(win) {
    const bounds = win.getBounds();
    const displays = screen.getAllDisplays();
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const display = displays.find(d => 
      centerX >= d.bounds.x && centerX <= d.bounds.x + d.bounds.width &&
      centerY >= d.bounds.y && centerY <= d.bounds.y + d.bounds.height
    ) || screen.getPrimaryDisplay();
    return display.workArea;
  }

  startDrag(id, mouseX, mouseY) {
    const note = this.notes.get(id);
    if (note) {
      note.isDragging = true;
      if (note.isFolded) {
        this.unfoldNote(note.win, id);
        // 从折叠状态拖拽展开时，将窗口移动到鼠标附近，避免跳回 originalBounds 导致远离鼠标
        if (mouseX != null && mouseY != null) {
          const bounds = note.win.getBounds();
          const newX = Math.round(mouseX - bounds.width / 2);
          const newY = Math.round(mouseY - 30);
          note.win.setPosition(newX, newY);
        }
      }
    }
  }

  endDrag(id) {
    const note = this.notes.get(id);
    if (note) {
      note.isDragging = false;
      // 保存位置到数据库
      this.saveNotePosition(note);
      setTimeout(() => {
        this.checkEdgeSnap(note.win, id);
      }, 100);
    }
  }

  // 保存便签位置到数据库
  saveNotePosition(note) {
    if (!note || !note.win || note.win.isDestroyed()) return;
    const [x, y] = note.win.getPosition();
    try {
      updateTask(note.taskId, { position_x: x, position_y: y });
    } catch (err) {
      console.error('[StickyNote] 保存位置失败:', err);
    }
  }

  checkEdgeSnap(win, id) {
    if (!this.settings.edgeSnap) return;
    const note = this.notes.get(id);
    if (!note || note.isDragging) return;
    const bounds = win.getBounds();
    const workArea = this.getCurrentDisplayWorkArea(win);
    const threshold = this.settings.edgeSnapThreshold || 10;

    let snapEdge = null;
    let newX = bounds.x;
    let newY = bounds.y;

    // 检测顶部贴边（松开鼠标后检测）
    if (bounds.y <= threshold) {
      newY = 0;
      snapEdge = 'top';
    }
    // 检测左侧贴边（松开鼠标后检测）
    else if (bounds.x <= threshold) {
      newX = 0;
      snapEdge = 'left';
    }
    // 检测右侧贴边（松开鼠标后检测）
    else {
      const rightEdge = bounds.x + bounds.width;
      const isNearEdge = rightEdge >= workArea.width - threshold;
      const isOutside = rightEdge > workArea.width;
      
      if (isNearEdge || isOutside) {
        snapEdge = 'right';
        newX = workArea.width - bounds.width;
      }
    }

    if (snapEdge && !note.isFolded) {
      if (newX !== bounds.x || newY !== bounds.y) {
        win.setPosition(newX, newY);
      }
      this.foldNote(win, id, snapEdge);
    } 
    else if (!snapEdge && note.isFolded) {
      this.unfoldNote(win, id);
    }
  }

  // 折叠便签，增加 edge 参数（'left'/'right'/'top'）
  foldNote(win, id, edge) {
    const note = this.notes.get(id);
    if (!note || note.isFolded) return;

    // 保存原始位置和尺寸
    const currentBounds = win.getBounds();
    note.originalBounds = {
      x: currentBounds.x,
      y: currentBounds.y,
      width: currentBounds.width,
      height: currentBounds.height
    };

    // 时间轴便签使用与单个便签相同的折叠尺寸，但通过圆角正方形头像区分
    const foldedSize = this.settings.foldedAvatarSize || 45;
    let newX = currentBounds.x;
    let newY = currentBounds.y;

    // 根据贴边方向调整折叠后的位置，使折叠窗口仍贴边
    if (edge === 'right') {
      const workArea = this.getCurrentDisplayWorkArea(win);
      newX = workArea.width - foldedSize;
    } else if (edge === 'left') {
      newX = 0;
    } else if (edge === 'top') {
      newY = 0;
    }

    // 先解除最小尺寸限制，确保折叠窗口能真正变为 45x45
    win.setMinimumSize(foldedSize, foldedSize);
    // 设置折叠后的尺寸和位置
    win.setBounds({ width: foldedSize, height: foldedSize, x: newX, y: newY });
    // 通知前端进入折叠模式（时间轴使用不同的事件名）
    if (note.isTimeline) {
      win.webContents.send('fold-timeline-note');
    } else {
      win.webContents.send('fold-note');
    }
    note.isFolded = true;
    note.snapEdge = edge; // 记录贴边方向，供展开时使用（可选）
  }

  // 展开便签，恢复原始位置和尺寸
  unfoldNote(win, id) {
    const note = this.notes.get(id);
    if (!note || !note.isFolded || !note.originalBounds) return;

    // 第一步：先恢复最小尺寸限制，再恢复窗口尺寸，避免 setBounds 被最小高度限制
    const minWidth = this.settings.minWidth || 300;
    const minHeight = note.isTimeline ? 200 : (this.settings.minHeight || 60);
    win.setMinimumSize(minWidth, minHeight);
    // 立即恢复窗口到原始尺寸和位置（此时前端仍处于折叠模式，内容隐藏）
    win.setBounds({
        x: note.originalBounds.x,
        y: note.originalBounds.y,
        width: note.originalBounds.width,
        height: note.originalBounds.height
    });

    // 第二步：通知前端移除 folded-mode，显示内容（时间轴使用不同的事件名）
    if (note.isTimeline) {
      win.webContents.send('unfold-timeline-note');
    } else {
      win.webContents.send('unfold-note');
    }

    note.isFolded = false;
    note.snapEdge = null;
}

  // 删除便签
  deleteNote(id) {
    const note = this.notes.get(id);
    if (note && note.isTimeline) {
      try {
        note._closing = true;
        hideTimelineNote(note.senderName);
      } catch (err) {
        console.error('[StickyNote] 隐藏时间轴便签失败:', err);
      }
    }
    if (note && !note.win.isDestroyed()) note.win.close();
    this.notes.delete(id);
  }
}

module.exports = StickyNoteManager;