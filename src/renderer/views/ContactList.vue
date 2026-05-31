<template>
  <div class="contactlist-view">
    <div class="contactlist-header">
      <div class="toolbar-search">
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="🔎搜索联系人名称..."
          @input="onSearchInput"
        />
        <span class="contact-count">共 {{ contacts.length }} 位联系人</span>
        <button class="btn btn-sm btn-primary" @click="openAddModal">➕ 添加联系人</button>
      </div>
    </div>

    <div class="contactlist-body">
      <div v-if="filteredContacts.length === 0" class="empty-state">
        <div class="empty-state-icon">👥</div>
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
                <span class="contact-task-count">{{ getTaskCount(contact.name) }} 条任务</span>
              </div>
              <div class="contact-card-meta">
                <span class="tag">📅 {{ formatDate(contact.created_at) }}</span>
                <span class="tag">📌 {{ contact.source || '手动' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 添加联系人弹窗 -->
    <div v-if="showAddModal" class="modal-overlay" @click.self="closeAddModal">
      <div class="modal-panel card add-contact-panel">
        <div class="modal-header">
          <h3>添加联系人</h3>
          <button class="btn btn-sm btn-outline" @click="closeAddModal">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>头像</label>
            <div class="avatar-upload">
              <img :src="newContact.avatarPreview || defaultAvatar" class="avatar-preview" />
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
            <input v-model="newContact.name" type="text" placeholder="请输入联系人名称" />
          </div>
          <div class="form-group">
            <label>来源</label>
            <input v-model="newContact.source" type="text" placeholder="手动" />
          </div>
          <div class="form-group">
            <label>备注</label>
            <textarea v-model="newContact.remark" rows="3" placeholder="请输入备注..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeAddModal">取消</button>
          <button class="btn btn-primary" :disabled="!newContact.name.trim()" @click="submitAddContact">
            保存
          </button>
        </div>
      </div>
    </div>

    <!-- 联系人任务列表弹窗 -->
    <div v-if="showTaskModal" class="modal-overlay" @click.self="showTaskModal = false">
      <div class="modal-panel card">
        <div class="modal-header">
          <div class="modal-title">
            <img :src="selectedContact?.avatar_base64 || defaultAvatar" class="modal-avatar" />
            <div>
              <h3>{{ selectedContact?.name || '未知' }} 的任务</h3>
              <span class="modal-subtitle">共 {{ contactTasks.length }} 条任务</span>
            </div>
          </div>
          <button class="btn btn-sm btn-outline" @click="showTaskModal = false">✕</button>
        </div>
        <div class="modal-body">
          <div v-if="contactTasks.length === 0" class="empty-state">
            <p>该联系人暂无任务</p>
          </div>
          <div v-else class="task-items">
            <div
              v-for="(task, index) in contactTasks"
              :key="task.id"
              class="task-card card"
            >
              <div class="task-card-content">
                <span class="task-index">{{ index + 1 }}.</span>
                {{ task.content }}
              </div>
              <div class="task-card-meta">
                <span :class="getStatusTag(task)">{{ statusText(task.status) }}</span>
                <span :class="getPriorityTag(task)">{{ priorityText(task.priority) }}</span>
                <span v-if="task.due_date">📅 截止: {{ formatDate(task.due_date) }}</span>
                <span>🕐 {{ formatDate(task.created_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E"

const contacts = ref([])
const allTasks = ref([])
const searchKeyword = ref('')
const showTaskModal = ref(false)
const selectedContact = ref(null)

// 添加联系人弹窗状态
const showAddModal = ref(false)
const newContact = ref({
  name: '',
  avatarBase64: '',
  avatarPreview: '',
  source: '',
  remark: ''
})

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

function onSearchInput() {
  // 搜索时无需额外操作
}

function showContactTasks(contact) {
  selectedContact.value = contact
  showTaskModal.value = true
}

function openAddModal() {
  newContact.value = { name: '', avatarBase64: '', avatarPreview: '', source: '', remark: '' }
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
}

function onAvatarChange(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target.result
    newContact.value.avatarPreview = result
    newContact.value.avatarBase64 = result
  }
  reader.readAsDataURL(file)
}

async function submitAddContact() {
  if (!newContact.value.name.trim()) return

  try {
    const result = await window.electronAPI.createContact({
      name: newContact.value.name.trim(),
      avatarBase64: newContact.value.avatarBase64 || '',
      source: newContact.value.source.trim() || 'manual',
      remark: newContact.value.remark.trim() || ''
    })

    if (result.success) {
      closeAddModal()
      await loadData()
    } else {
      alert(result.error || '添加联系人失败')
    }
  } catch (err) {
    console.error('添加联系人失败:', err)
    alert('添加联系人失败')
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
  } catch (err) {
    console.error('加载联系人数据失败:', err)
  }
}

onMounted(() => {
  loadData()
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
}

.contact-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary-light);
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
}

.contact-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
  padding: 12px;
}

.modal-body .task-card-content {
  margin-bottom: 6px;
  line-height: 1.5;
  word-break: break-all;
}

.task-index {
  display: inline-block;
  min-width: 24px;
  color: var(--color-text-secondary);
  font-weight: 600;
  margin-right: 4px;
}

.modal-body .task-card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* 添加联系人弹窗 */
.add-contact-panel {
  width: 420px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 6px;
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

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-light);
}
</style>
