// src/main/windows/stickyNote.js
const { BrowserWindow, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { getReminderRuleByTaskId } = require('../../database/repositories/reminderRepository');
const { updateTask } = require('../../database/repositories/taskRepository');
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

class StickyNoteManager {
  constructor(reminderService) {
    this.notes = new Map();
    this.nextId = 1;
    this.templatePath = path.join(__dirname, '../templates/stickyTemplate.html');
    this.scriptPath = path.join(__dirname, '../templates/stickyScript.js');
    this.reminderService = reminderService;
    this.settings = {
      edgeSnap: true,
      edgeSnapThreshold: 10,
      foldedSize: 45,
      defaultWidth: 300,
      minHeight: 60
    };
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
      const getStatusText = (status) => {
        switch (status) {
          case 'pending': return '⏰';
          case 'in_progress': return '⏳';
          case 'completed': return '✅';
          case 'overdue': return '⚠️';
          default: return '⏰';
        }
      };

      // 获取优先级图标
      const getPriorityText = (priority) => {
        switch (priority) {
          case 'high': return '🔴';
          case 'medium': return '🟡';
          case 'low': return '🟢';
          case 'none': return '⚪';
          default: return '⚪';
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
        `<img class="avatar" src="${escapeHtml(task.sender_avatar)}" style="width:45px;height:45px;border-radius:50%;object-fit:cover;border: 2px solid ${noteBackgroundColor};box-shadow: 0 2px 5px rgba(0,0,0,0.2);" />` : 
        `<img class="avatar" src="${defaultAvatarSvg}" style="width:45px;height:45px;border-radius:50%;object-fit:cover;border: 2px solid ${noteBackgroundColor};box-shadow: 0 2px 5px rgba(0,0,0,0.2);" />`;
      
        // 截止日期文本
      const dueDateText = task.due_date ? new Date(task.due_date).toLocaleDateString() : '未设置';
      const content = escapeHtml(task.content);
      const senderName = escapeHtml(task.sender_name || '未知');
      const source = escapeHtml(task.source || '未知');
      const statusText = getStatusText(task.status);
      const priorityText = getPriorityText(task.priority);

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
        '{{senderName}}': senderName,
        '{{source}}': source,
        '{{dueDate}}': task.due_date || '',
        '{{dueDateText}}': dueDateText,
        '{{statusText}}': statusText,
        '{{priorityText}}': priorityText,
        '{{opacity}}': task.opacity != null ? task.opacity : 1.0,
        '{{styleConfigJson}}': styleConfigJson
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

  async createNote(task) {
    const id = this.nextId++;
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
      const minHeight = this.settings.minHeight || 60;
      const newHeight = Math.max(minHeight, height);
      note.win.setBounds({ height: newHeight });
      // 如果处于折叠状态，同步更新 originalBounds 的高度
      if (note.isFolded) {
        note.originalBounds.height = newHeight;
      }
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

  startDrag(id) {
    const note = this.notes.get(id);
    if (note) {
      note.isDragging = true;
      if (note.isFolded) {
        this.unfoldNote(note.win, id);
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
    const bounds = win.getBounds();
    const workArea = this.getCurrentDisplayWorkArea(win);
    const threshold = this.settings.edgeSnapThreshold || 10;
    const note = this.notes.get(id);
    if (!note || note.isDragging) return;

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

    const foldedSize = this.settings.foldedSize || 45;
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

    // 设置折叠后的尺寸和位置
    win.setBounds({ width: foldedSize, height: foldedSize, x: newX, y: newY });
    // 通知前端进入折叠模式
    win.webContents.send('fold-note');
    note.isFolded = true;
    note.snapEdge = edge; // 记录贴边方向，供展开时使用（可选）
  }

  // 展开便签，恢复原始位置和尺寸
  unfoldNote(win, id) {
    const note = this.notes.get(id);
    if (!note || !note.isFolded || !note.originalBounds) return;

    // 第一步：立即恢复窗口到原始尺寸和位置（此时前端仍处于折叠模式，内容隐藏）
    win.setBounds({
        x: note.originalBounds.x,
        y: note.originalBounds.y,
        width: note.originalBounds.width,
        height: note.originalBounds.height
    });

    // 第二步：通知前端移除 folded-mode，显示内容
    win.webContents.send('unfold-note');

    note.isFolded = false;
    note.snapEdge = null;
}

  // 删除便签
  deleteNote(id) {
    const note = this.notes.get(id);
    if (note && !note.win.isDestroyed()) note.win.close();
    this.notes.delete(id);
  }
}

module.exports = StickyNoteManager;