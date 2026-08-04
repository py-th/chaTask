<template>
  <div class="contactlist-view">
    <div class="contactlist-header">
      <div class="toolbar-search">
        <div class="search-input-wrap">
          <Search class="search-icon" />
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索联系人名称..."
            @input="onSearchInput"
          />
        </div>
        <span class="contact-count">共 {{ contacts.length }} 位联系人</span>
        <button class="btn btn-sm btn-primary" @click="openAddModal"><UserPlus class="btn-icon" /> 添加联系人</button>
      </div>
    </div>

    <div class="contactlist-body">
      <div v-if="filteredContacts.length === 0" class="empty-state">
        <Users class="empty-state-icon" />
        <p>{{ searchKeyword ? '没有匹配的联系人' : '暂无联系人，试试截图识别任务吧~' }}</p>
      </div>

      <div v-else class="contact-items">
        <div
          v-for="contact in filteredContacts"
          :key="contact.id"
          class="contact-card card"
          @dblclick="showContactTasks(contact)"
        >
          <div class="contact-card-main">
            <img :src="contact.avatar_base64 || defaultAvatar" class="contact-avatar" />
            <div class="contact-card-info">
              <div class="contact-card-name">
                <strong>{{ contact.name || '未知' }}</strong>
                <span class="contact-task-count" @click.stop="showContactTasks(contact)">
                  {{ contact.task_count || 0 }} 条任务
                </span>
              </div>
              <div class="contact-card-meta">
                <span class="tag"><CalendarDays class="tag-icon" /> {{ formatDate(contact.created_at) }}</span>
                <span class="tag"><Tag class="tag-icon" /> {{ contact.source || '手动' }}</span>
              </div>
            </div>
          </div>
          <!-- 悬浮操作按钮 -->
          <div class="contact-card-actions">
            <button
              v-if="canCreateTimeline(contact) || hasTimelineRecord(contact)"
              class="btn btn-xs btn-timeline"
              :class="{ 'btn-timeline-open': isTimelineOpen(contact) }"
              @click.stop="toggleTimelineNote(contact)"
            >
              <template v-if="isTimelineOpen(contact)">
                <EyeOff class="btn-icon" /> 隐藏
              </template>
              <template v-else-if="hasTimelineRecord(contact)">
                <Eye class="btn-icon" /> 打开
              </template>
              <template v-else>
                <CalendarDays class="btn-icon" /> 时间轴
              </template>
            </button>
            <button class="btn btn-xs btn-edit" @click.stop="openEditModal(contact)"><Pencil class="btn-icon" /></button>
            <button class="btn btn-xs btn-danger" @click.stop="confirmDeleteContact(contact)"><Trash2 class="btn-icon" /></button>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加/编辑联系人弹窗 -->
    <div v-if="showAddModal || showEditModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-panel card add-contact-panel">
        <div class="modal-header">
          <h3>{{ showEditModal ? '修改联系人' : '添加联系人' }}</h3>
          <button class="btn btn-sm btn-outline" @click="closeModal"><X class="btn-icon" /></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>头像</label>
            <div class="avatar-upload">
              <img :src="modalContact.avatarPreview || defaultAvatar" class="avatar-preview" />
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                style="display: none"
                @change="onAvatarChange"
              />
              <button class="btn btn-sm btn-outline" @click="$refs.avatarInput.click()">
                选择图片
              </button>
            </div>
          </div>
          <div class="form-group">
            <label>名称 <span class="required">*</span></label>
            <input v-model="modalContact.name" type="text" placeholder="请输入联系人名称" />
          </div>
          <div class="form-group">
            <label>来源</label>
            <input v-model="modalContact.source" type="text" placeholder="手动" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea v-model="modalContact.remark" rows="2" placeholder="请输入备注..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeModal">取消</button>
          <button class="btn btn-primary" :disabled="!modalContact.name.trim()" @click="submitContact">
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 联系人任务列表弹窗 -->
    <div v-if="showTaskModal" class="modal-overlay" @click.self="showTaskModal = false">
      <div class="modal-panel card task-list-panel">
        <div class="modal-header">
          <div class="modal-title">
            <img :src="selectedContact?.avatar_base64 || defaultAvatar" class="modal-avatar" />
            <div>
              <h3>{{ selectedContact?.name || '未知' }} 的任务</h3>
              <span class="modal-subtitle">共 {{ contactTasks.length }} 条任务</span>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" @click="showTaskModal = false"><X class="btn-icon" /></button>
        </div>
        <div class="modal-body">
          <div v-if="contactTasks.length === 0" class="empty-state">
            <ClipboardList class="empty-state-icon" />
            <p>该联系人暂无任务</p>
          </div>
          <div v-else class="task-items">
            <div
              v-for="(task, index) in contactTasks"
              :key="task.id"
              class="task-card card"
              @mouseenter="hoveredTaskId = task.id"
              @mouseleave="hoveredTaskId = null"
            >
              <div class="task-card-container">
                <span v-if="editingTaskId === task.id" class="task-edit-hint">Ctrl+Enter 保存 · Esc 取消</span>
                <div class="task-card-left">
                  <span class="task-index">{{ index + 1 }}</span>
                </div>
                <div class="task-card-right">
                  <div class="task-card-content">
                    <div class="task-text-wrapper">
                      <span
                        v-if="editingTaskId !== task.id"
                        class="task-text"
                        @dblclick.stop="startEditTask(task)"
                      >{{ task.content }}</span>
                      <textarea
                        v-if="editingTaskId === task.id"
                        :ref="el => { if (el) taskEditRefs.set(task.id, el) }"
                        v-model="editingTaskContent"
                        class="task-edit-textarea"
                        rows="3"
                        @blur="saveTaskEdit(task)"
                        @keydown.enter.ctrl="saveTaskEdit(task)"
                        @keydown.enter.meta="saveTaskEdit(task)"
                        @keydown.esc="cancelTaskEdit"
                      />
                    </div>
                    <div
                      v-show="hoveredTaskId === task.id && editingTaskId !== task.id"
                      class="task-actions"
                    >
                      <button
                        v-if="task.is_completed !== 1"
                        class="btn btn-xs btn-success task-action-btn"
                        @click.stop="completeTask(task)"
                      >
                        <Check class="btn-icon" />
                      </button>
                      <button
                        v-if="task.is_deleted !== 1"
                        class="btn btn-xs btn-danger task-action-btn"
                        @click.stop="deleteTask(task)"
                      >
                        <Trash2 class="btn-icon" />
                      </button>
                    </div>
                  </div>
                  <div class="task-card-meta">
                    <span><History class="tag-icon" /> 创建: {{ formatDate(task.created_at) }}</span>
                    <span v-if="task.due_date"><CalendarDays class="tag-icon" /> 截止: {{ formatDate(task.due_date) }}</span>
                    <span v-if="task.completed_at"><Check class="tag-icon" /> 完成: {{ formatDate(task.completed_at) }}</span>
                    <span v-if="task.is_completed === 1"><Check class="tag-icon" /> 已完成</span>
                    <span v-if="task.is_deleted === 1"><Trash2 class="tag-icon" /> 已删除</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { UserPlus, Pencil, Trash2, X, Eye, EyeOff, ListTodo, Users, CalendarDays, Tag, Check, Search, History, Clock, MessageCircle, ClipboardList } from 'lucide-vue-next'
import { DEFAULT_AVATAR_SVG_45 } from '../shared/constants.js';
const defaultAvatar = DEFAULT_AVATAR_SVG_45;

const contacts = ref([])
const allTasks = ref([])
const searchKeyword = ref('')
const showTaskModal = ref(false)
const selectedContact = ref(null)
const timelineStatus = ref({ allNotes: [], openNames: [] })

// 添加/编辑联系人弹窗状态
const showAddModal = ref(false)
const showEditModal = ref(false)
const editingContactId = ref(null)
const modalContact = ref({
  name: '',
  avatarBase64: '',
  avatarPreview: '',
  source: '',
  remark: ''
})

// 任务编辑状态
const hoveredTaskId = ref(null)
const editingTaskId = ref(null)
const editingTaskContent = ref('')
const taskEditRefs = ref(new Map())

const filteredContacts = computed(() => {
  let list = [...contacts.value]
  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter(c => c.name && c.name.toLowerCase().includes(kw))
  }
  return list
})

const contactTasks = computed(() => {
  if (!selectedContact.value) return []
  return allTasks.value.filter(t =>
    t.sender_name === selectedContact.value.name
  )
})

function getTaskCount(contactName) {
  return allTasks.value.filter(t => t.sender_name === contactName).length
}

function getContactTasks(contactName) {
  return allTasks.value.filter(t => t.sender_name === contactName && t.is_deleted !== 1)
}

function canCreateTimeline(contact) {
  return getContactTasks(contact.name).length >= 2
}

function hasTimelineRecord(contact) {
  return timelineStatus.value.allNotes.some(n => n.sender_name === contact.name)
}

function isTimelineOpen(contact) {
  return timelineStatus.value.openNames.includes(contact.name)
}

async function loadTimelineStatus() {
  try {
    timelineStatus.value = await window.electronAPI.getTimelineNotesStatus()
  } catch (err) {
    console.error('加载时间轴便签状态失败:', err)
  }
}

async function toggleTimelineNote(contact) {
  try {
    if (isTimelineOpen(contact)) {
      await window.electronAPI.closeTimelineNote(contact.name)
    } else if (hasTimelineRecord(contact)) {
      await window.electronAPI.openTimelineNote(contact.name)
    } else if (canCreateTimeline(contact)) {
      await window.electronAPI.createTimelineNote(contact.name, contact.avatar_base64 || '')
    }
    await loadTimelineStatus()
  } catch (err) {
    console.error('切换时间轴便签失败:', err)
    window.$toast.error('切换时间轴便签失败')
  }
}

function onSearchInput() {
  // 搜索时无需额外操作
}

function showContactTasks(contact) {
  selectedContact.value = contact
  showTaskModal.value = true
}

function openAddModal() {
  editingContactId.value = null
  modalContact.value = { name: '', avatarBase64: '', avatarPreview: '', source: '', remark: '' }
  showAddModal.value = true
  showEditModal.value = false
}

function openEditModal(contact) {
  editingContactId.value = contact.id
  modalContact.value = {
    name: contact.name || '',
    avatarBase64: contact.avatar_base64 || '',
    avatarPreview: contact.avatar_base64 || '',
    source: contact.source || '',
    remark: contact.remark || ''
  }
  showEditModal.value = true
  showAddModal.value = false
}

function closeModal() {
  showAddModal.value = false
  showEditModal.value = false
  editingContactId.value = null
}

function onAvatarChange(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target.result
    modalContact.value.avatarPreview = result
    modalContact.value.avatarBase64 = result
  }
  reader.readAsDataURL(file)
}

async function submitContact() {
  if (!modalContact.value.name.trim()) return

  try {
    let result
    if (showEditModal.value && editingContactId.value) {
      result = await window.electronAPI.updateContact({
        id: editingContactId.value,
        name: modalContact.value.name.trim(),
        avatarBase64: modalContact.value.avatarBase64 || '',
        source: modalContact.value.source.trim() || 'unknow',
        remark: modalContact.value.remark.trim() || ''
      })
    } else {
      result = await window.electronAPI.createContact({
        name: modalContact.value.name.trim(),
        avatarBase64: modalContact.value.avatarBase64 || '',
        source: modalContact.value.source.trim() || 'unknow',
        remark: modalContact.value.remark.trim() || ''
      })
    }

    if (result.success) {
      closeModal()
      await loadData()
    } else {
      await window.$confirm({
        title: '操作失败',
        message: result.error || '操作失败',
        type: 'warning',
        confirmText: '知道了',
        cancelText: ''
      })
    }
  } catch (err) {
    console.error('操作联系人失败:', err)
    window.$toast.error('操作联系人失败')
    await window.$confirm({
      title: '操作失败',
      message: '操作失败',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
  }
}

async function confirmDeleteContact(contact) {
  const taskCount = contact.task_count || 0
  const message = taskCount > 0
    ? `确定要删除联系人「${contact.name}」吗？该联系人有 ${taskCount} 条任务，删除后联系人及其所有任务将不可恢复！`
    : `确定要删除联系人「${contact.name}」吗？删除后不可恢复！`

  const confirmed = await window.$confirm({
    title: '确认删除联系人',
    message,
    type: 'danger',
    confirmText: '删除'
  })
  if (!confirmed) return

  try {
    const result = await window.electronAPI.deleteContact({
      id: contact.id,
      name: contact.name
    })
    if (result.success) {
      await loadData()
    } else {
      await window.$confirm({
        title: '删除失败',
        message: result.error || '删除失败',
        type: 'warning',
        confirmText: '知道了',
        cancelText: ''
      })
    }
  } catch (err) {
    console.error('删除联系人失败:', err)
    window.$toast.error('删除联系人失败')
    await window.$confirm({
      title: '删除失败',
      message: '删除失败',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
  }
}

// 任务编辑
function startEditTask(task) {
  editingTaskId.value = task.id
  editingTaskContent.value = task.content
  nextTick(() => {
    const inputEl = taskEditRefs.value.get(task.id)
    if (inputEl) {
      inputEl.focus()
    }
  })
}

async function saveTaskEdit(task) {
  if (!editingTaskId.value) return
  const newContent = editingTaskContent.value.trim()
  if (!newContent || newContent === task.content) {
    cancelTaskEdit()
    return
  }

  try {
    await window.electronAPI.updateTask(task.id, { content: newContent })
    task.content = newContent
  } catch (err) {
    console.error('更新任务失败:', err)
    window.$toast.error('更新任务失败')
    await window.$confirm({
      title: '更新失败',
      message: '更新任务失败',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
  } finally {
    cancelTaskEdit()
  }
}

function cancelTaskEdit() {
  editingTaskId.value = null
  editingTaskContent.value = ''
}

async function completeTask(task) {
  const confirmed = await window.$confirm({
    title: '确认完成任务',
    message: `确定要将这条任务标记为完成吗？`,
    detail: `${task.content.substring(0, 50)}${task.content.length > 50 ? '...' : ''}`,
    type: 'warning',
    confirmText: '完成'
  })
  if (!confirmed) return

  try {
    await window.electronAPI.completeTask(task.id)
    await loadData()
  } catch (err) {
    console.error('标记完成任务失败:', err)
    window.$toast.error('标记完成任务失败')
    await window.$confirm({
      title: '标记失败',
      message: '标记完成失败',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
  }
}

async function deleteTask(task) {
  const confirmed = await window.$confirm({
    title: '确认移入回收站',
    message: '确定要将这条任务移入回收站吗？',
    detail: `${task.content.substring(0, 50)}${task.content.length > 50 ? '...' : ''}\n[Tips: 可以在任务列表的回收站中恢复]`,
    type: 'warning',
    confirmText: '移入回收站'
  })
  if (!confirmed) return

  try {
    await window.electronAPI.updateTask(task.id, { is_deleted: 1 })
    await loadData()
  } catch (err) {
    console.error('删除任务失败:', err)
    window.$toast.error('删除任务失败')
    await window.$confirm({
      title: '删除失败',
      message: '删除任务失败',
      type: 'warning',
      confirmText: '知道了',
      cancelText: ''
    })
  }
}

function statusText(s) {
  switch (s) {
    case 'pending': return '待办'
    case 'in_progress': return '进行中'
    case 'completed': return '完成'
    case 'overdue': return '逾期'
    default: return s
  }
}

function priorityText(p) {
  switch (p) {
    case 'high': return '高优先'
    case 'medium': return '中优先'
    case 'low': return '低优先'
    default: return '无'
  }
}

function getStatusTag(task) {
  if (task.is_completed === 1) return 'tag tag-done'
  if (task.status === 'overdue') return 'tag tag-overdue'
  if (task.status === 'in_progress') return 'tag tag-medium'
  return 'tag'
}

function getPriorityTag(task) {
  switch (task.priority) {
    case 'high': return 'tag tag-high'
    case 'medium': return 'tag tag-medium'
    case 'low': return 'tag tag-low'
    default: return 'tag'
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

async function loadData() {
  try {
    const [contactList, taskList, completedTasks, deletedTasks] = await Promise.all([
      window.electronAPI.getAllContacts(),
      window.electronAPI.getAllTasks(),
      window.electronAPI.getCompletedTasks(),
      window.electronAPI.getDeletedTasks()
    ])
    contacts.value = contactList
    allTasks.value = [...taskList, ...completedTasks, ...deletedTasks]
    await loadTimelineStatus()
  } catch (err) {
    console.error('加载联系人数据失败:', err)
    window.$toast.error('加载联系人数据失败')
  }
}

let unregisterRefresh = null

onMounted(() => {
  loadData()
  // 监听任务列表刷新事件（桌面便签或其他页面修改任务后同步刷新）
  if (window.electronAPI && window.electronAPI.onRefreshTaskList) {
    unregisterRefresh = window.electronAPI.onRefreshTaskList(loadData)
  }
})

onUnmounted(() => {
  if (unregisterRefresh) {
    unregisterRefresh()
  }
})
</script>

<style scoped>
.contactlist-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.contactlist-header {
  position: sticky;
  top: -20px;
  z-index: 10;
  background: var(--color-bg);
  margin: -20px -20px 0;
  padding: 10px 20px 8px;
  border-bottom: 1px solid var(--color-border-light);
}

.toolbar-search {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-search input {
  width: 100%;
  max-width: 400px;
  padding-left: 32px;
}

.search-input-wrap {
  position: relative;
  flex: 1;
  max-width: 400px;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--color-text-secondary);
  pointer-events: none;
}

.contact-count {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.contactlist-body {
  flex: 1;
  min-height: 300px;
}

.contact-items {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.contact-card {
  padding: 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.contact-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-light);
}

.contact-card:hover .contact-card-actions {
  opacity: 1;
  pointer-events: auto;
}

.contact-card-main {
  display: flex;
  align-items: center;
  gap: 14px;
}

.contact-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.contact-card-info {
  flex: 1;
  min-width: 0;
}

.contact-card-name {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.contact-card-name strong {
  font-size: var(--font-size-base);
}

.contact-task-count {
  font-size: var(--font-size-sm);
  color: var(--color-text);
  background: var(--color-border-light);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.contact-task-count:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.contact-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 悬浮操作按钮 */
.contact-card-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition-fast);
}

.btn-timeline {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn-timeline-open {
  background: var(--color-success-light, #e6f7e6);
  color: var(--color-success, #52c41a);
  border: 1px solid var(--color-success, #52c41a);
}

/* 弹窗样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-panel {
  width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}

.task-list-panel {
  width: 700px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.modal-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.modal-body .task-card {
  padding: 10px;
  position: relative;
}

.modal-body .task-card-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  position: relative;
}

.modal-body .task-card-left {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.modal-body .task-card-right {
  flex: 1;
  min-width: 0;
  position: relative;
}

.modal-body .task-card-content {
  margin-bottom: 6px;
  line-height: 1.5;
  word-break: break-all;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
}

.modal-body .task-card-content .task-text-wrapper {
  flex: 1;
  min-width: 0;
}

.task-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
  font-size: var(--font-size-sm);
  margin-right: 8px;
  flex-shrink: 0;
}

.task-text {
  cursor: text;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.task-text:hover {
  background: var(--color-border-light);
}

.task-text-wrapper {
  width: 100%;
}

.task-edit-textarea {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-base);
  outline: none;
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
  line-height: 1.5;
  box-sizing: border-box;
}

.task-edit-hint {
  position: absolute;
  top: -20px;
  right: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  pointer-events: none;
  z-index: 10;
}

.task-actions {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  z-index: 10;
}

.modal-body .task-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 添加/编辑联系人弹窗 */
.add-contact-panel {
  width: 380px;
  max-height: none;
  overflow: visible;
  padding: 20px;
}

.add-contact-panel .modal-header {
  margin-bottom: 12px;
}

.add-contact-panel .modal-body {
  gap: 10px;
}

.form-group {
  margin-bottom: 0;
}

.form-group label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.form-group .required {
  color: #f56c6c;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-base);
  outline: none;
  transition: border-color var(--transition-fast);
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: var(--color-primary);
}

.add-contact-panel .form-group textarea {
  resize: vertical;
  min-height: 40px;
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-preview {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border-light);
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.empty-state-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.tag-icon {
  width: 12px;
  height: 12px;
  vertical-align: -2px;
}
</style>
