<template>
  <div style="padding: 20px;">
    <h1>📌 智能任务便签 (双模型驱动)</h1>
    <p>✅ 截取单条消息，AI自动识别头像、文字、发送者和日期</p>
    <p>💡 快捷键 <kbd>Ctrl+Alt+S</kbd> 触发智能截图，备选：系统截图 <kbd>Win+Shift+S</kbd> 后监听剪贴板</p>

    <div v-if="processing" style="color: #2196F3; margin: 10px 0;">
      ⏳ AI模型分析中（双模型并行识别：头像/文本 + 发送者/日期）...
    </div>

    <div style="padding: 5px;">
      <span> 任务看板：<kbd>任务查询</kbd> <kbd>任务分类统计</kbd> <kbd>任务明细（crud）</kbd> </span><br>
      <span> 桌面便签：<kbd>普通任务</kbd> <kbd>时间轴任务</kbd> </span><br>
      <span> 工具箱：<kbd>任务日历</kbd> <kbd>桌面倒计时</kbd> <kbd>番茄时钟</kbd></span><br>
      <span> 设置：<kbd>全局基础设置</kbd> <kbd>便签设置</kbd> <kbd>OCR设置</kbd> <kbd>其它设置</kbd></span>
    </div>


    <!-- 截图预览：保留原始检测数量展示 -->
    <fieldset v-if="latestScreenshot" style="margin: 20px 0; border: 1px solid #ccc; padding: 10px;">
      <legend>截图预览：提取到 {{ lastResult.rawResults?.avatarText?.messageCount || 0 }} 条消息截图</legend>
      <img :src="latestScreenshot" style="max-width: 300px; max-height: 200px;" />
      <div v-if="lastResult" style="margin-top: 10px; font-size: 12px; color: #666;">
        <p>🎯 头像/文本模型：{{ lastResult.rawDetections?.avatars || 0 }} 个头像，{{ lastResult.rawDetections?.texts || 0 }} 个文本框</p>
        <p>📇 发送者/日期模型：{{ lastResult.rawResults?.senderDate?.senderCount || 0 }} 个发送者，{{ lastResult.rawResults?.senderDate?.dateCount || 0 }} 个日期</p>
        <p v-if="lastResult.screenshotInfo">🖥️ 来源窗口: {{ lastResult.screenshotInfo.windowName }}</p>
      </div>
    </fieldset>

    <div v-if="tasks.length === 0" style="color: gray; margin-top: 20px;">暂无任务，试试截图吧~</div>
    <div v-else class="task-list">
      <div v-for="task in tasks" :key="task.id" class="task-item">
        <img :src="task.sender_avatar || defaultAvatar" class="avatar" />
        <div class="task-content">
          <div class="task-text">
            <strong :style="{ color: task.direction === 'sent' ? '#4CAF50' : '#2196F3' }">
              {{ task.sender_name || '未知' }} {{ task.direction === 'sent' ? '(我)' : '' }}
            </strong>: {{ task.content }}
          </div>
          <div class="task-meta">
            <span>📌 {{ formatTime(task.source_time || task.created_at) }}</span>
            <span>置信度: {{ (task.confidence * 100).toFixed(0) }}% </span>
            <span>创建: {{ (task.created_at) }} </span>
            <span>发送: {{ (task.source_time) }} </span>
            <span>截止: {{ (task.due_date) }} </span>
            <span>提醒: {{ (task.reminder_time) }} </span>
            <span>优先级: {{ (task.priority) }} </span>
            <span>状态: {{ (task.status) }} </span>
          </div>
        </div>
        <button @click="createStickyFromTask(task)" class="sticky-btn">📌 便签</button>
      </div>
    </div>

    <!-- 发送者确认对话框 -->
    <div v-if="showNameDialog" class="dialog-overlay">
      <div class="dialog">
        <h3>🤔 确认发送者信息</h3>
        <p>检测到 {{ pendingMessages.length }} 条新消息需要确认发送者：</p>
        <div v-for="(msg, idx) in pendingMessages" :key="idx" style="margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px;">
          <img :src="msg.avatarBase64 || defaultAvatar" style="width: 40px; height: 40px; border-radius: 50%; vertical-align: middle; margin-right: 10px;" />
          <div style="display: inline-block; vertical-align: middle;">
            <div style="color: #666; font-size: 12px;">识别内容:</div>
            <div>{{ msg.text.substring(0, 50) }}...</div>
            <div v-if="msg.dateText" style="color: #4CAF50; font-size: 12px;">📅 识别到日期: {{ msg.dateText }}</div>
            <div v-if="msg.senderName" style="color: #2196F3; font-size: 12px;">📇 模型建议发送者: {{ msg.senderName }}</div>
          </div>
        </div>
        <div style="margin: 10px 0;">
          <label>发送者名称：</label>
          <input v-model="manualName" placeholder="输入发送者昵称" style="width: 100%; padding: 8px; margin-top: 5px;" />
        </div>
        <div style="margin: 10px 0;">
          <button @click="submitManualName" style="margin-right: 10px;">💾 确认并保存</button>
          <button @click="skipCurrentMessage">⏭ 跳过</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { v4 as uuidv4 } from 'uuid';

// ⭐ 默认头像（灰色圆形 + 用户图标）
const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";
const tasks = ref([])
const latestScreenshot = ref(null)
const lastResult = ref(null)
const processing = ref(false)

const pendingMessages = ref([])
const showNameDialog = ref(false)
const manualName = ref('')

let unsubscribeClipboard = null
let unsubscribeIntegrated = null

async function loadTasks() {
  tasks.value = await window.electronAPI.getAllTasks()
}

function formatTime(dateStr) {
  if (!dateStr) return '未知'
  return new Date(dateStr).toLocaleString()
}

// ⭐ 核心：处理整合识别结果（Ctrl+Alt+S 新方案）
async function onIntegratedExtractionResult(data) {
  processing.value = false
  
  if (!data.success) {
    alert(`识别失败\n原因: ${data.error || '模型未检测到有效内容'}\n建议: 确保截图包含完整的聊天信息`)
    return
  }
  
  lastResult.value = data
  if (data.localImageBase64) {
    latestScreenshot.value = `data:image/png;base64,${data.localImageBase64}`
  }
  
  if (!data.messages || data.messages.length === 0) {
    alert('未识别到有效的消息内容，请重试')
    return
  }
  
  for (const message of data.messages) {
    if (message.isNewContact || !message.senderName) {
      pendingMessages.value.push(message)
      if (!showNameDialog.value) {
        manualName.value = message.senderName || ''
        showNameDialog.value = true
      }
    } else {
      await createTask(
        message.senderName,
        message.avatarBase64,
        message.text,
        message.confidence,
        message.direction,
        message.sourceTime
      )
    }
  }
}

// 剪贴板截图（备选方案）
async function onScreenshotExtracted(data) {
  const { base64, result } = data
  processing.value = false
  latestScreenshot.value = `data:image/png;base64,${base64}`
  
  if (!result.success || !result.messages || result.messages.length === 0) {
    console.warn('剪贴板截图未识别到有效消息:', result.reason || '未知错误')
    return
  }
  
  for (const message of result.messages) {
    pendingMessages.value.push({
      text: message.text,
      avatarBase64: message.avatarBase64,
      avatarHash: message.avatarHash,
      sourceTime: new Date().toISOString(),
      isNewContact: true,
      senderName: null,
      dateText: null,
      confidence: message.confidence,
      direction: message.direction
    })
    if (!showNameDialog.value) {
      showNameDialog.value = true
      manualName.value = ''
    }
  }
}

async function createTask(senderName, avatarBase64, displayContent, confidence, direction, sourceTime) {
  const task = {
    id: uuidv4(),
    content: displayContent.substring(0, 500),
    sourceTime: sourceTime || new Date().toISOString(),
    senderAvatar: avatarBase64,  // ⭐ 无头像时存入 null，前端展示用 defaultAvatar
    senderName: senderName,
    confidence: confidence,
    direction: direction,
    createdAt: new Date(),
    priority: 'medium',
    status: 'pending',
    isShowDesk: 1
  };
  
  try {
    await window.electronAPI.saveTask(task);
    await loadTasks();
    if (avatarBase64) {
      await window.electronAPI.createStickyNote({ 
        content: displayContent, 
        avatar: avatarBase64 || defaultAvatar, 
        taskId: task.id 
      });
    }
  } catch (err) {
    console.error('创建任务失败:', err);
  }
}

async function submitManualName() {
  const name = manualName.value.trim()
  if (!name) {
    alert('请输入发送者名称')
    return
  }
  
  for (const msg of pendingMessages.value) {
    try {
      // ⭐ 无头像时 avatarHash/avatarBase64 可能为 null，saveContact 支持空值
      await window.electronAPI.saveContact({
        name: name,
        avatarHash: msg.avatarHash || '',
        avatarBase64: msg.avatarBase64 || ''
      });
      await createTask(name, msg.avatarBase64, msg.text, msg.confidence, msg.direction, msg.sourceTime);
    } catch (err) {
      console.error('保存联系人或任务失败:', err);
    }
  }
  
  pendingMessages.value = []
  showNameDialog.value = false
  manualName.value = ''
}

function skipCurrentMessage() {
  pendingMessages.value.shift()
  if (pendingMessages.value.length === 0) {
    showNameDialog.value = false
    manualName.value = ''
  } else {
    manualName.value = pendingMessages.value[0].senderName || ''
  }
}

function createStickyFromTask(task) {
  const content = `[${task.sender_name || '未知'}] ${task.content}`
  if (task.sender_avatar) {
    window.electronAPI.createStickyNote({ content, avatar: task.sender_avatar, taskId: task.id })
  }
}

onMounted(() => {
  loadTasks()
  
  unsubscribeIntegrated = window.electronAPI.onIntegratedExtractionResult((data) => {
    processing.value = true
    onIntegratedExtractionResult(data)
  })

  unsubscribeClipboard = window.electronAPI.onScreenshotExtracted((data) => {
    processing.value = true
    onScreenshotExtracted(data)
  })
})

onUnmounted(() => {
  if (unsubscribeClipboard) unsubscribeClipboard()
  if (unsubscribeIntegrated) unsubscribeIntegrated()
})
</script>

<style scoped>
.dialog-overlay { 
  position: fixed; top:0; left:0; width:100%; height:100%; 
  background:rgba(0,0,0,0.5); display:flex; 
  align-items:center; justify-content:center; z-index:1000; 
}
.dialog { 
  background:white; padding:20px; border-radius:8px; 
  min-width:400px; max-width:600px;
  box-shadow:0 2px 10px rgba(0,0,0,0.3); 
}
.task-list { 
  margin-top:20px; max-height:500px; overflow-y:auto; 
}
.task-item { 
  display:flex; align-items:start;
  border-bottom:1px solid #eee; padding:12px; gap:12px; 
}
.avatar { 
  width:40px; height:40px; border-radius:50%; object-fit:cover; 
  border: 2px solid #e0e0e0;
}
.task-content { flex:1; }
.task-text { margin-bottom:4px; line-height: 1.5; }
.task-meta { 
  font-size:12px; color:gray; display:block; gap:12px; 
}
.sticky-btn { 
  background:#ffb74d; border:none; border-radius:4px; 
  padding:6px 12px; cursor:pointer; 
}
kbd { 
  background:#f7f7f7; border:1px solid #ccc; 
  border-radius:3px; padding:2px 5px; 
}
</style>