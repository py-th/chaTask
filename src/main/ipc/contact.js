// src/main/ipc/contact.js
const { ipcMain } = require('electron');
const {
  getAllContacts,
  saveContact,
  createContact,
  findContactByHash,
  findContactByName,
  getContactById,
  updateContactAvatar,
  updateContact,
  deleteContact,
  deleteTasksByContactName,
  syncContactToTasks
} = require('../../database/repositories/contactRepository');
const { computeImageHash } = require('../utils/hash');

function registerContactHandlers() {
  ipcMain.handle('get-all-contacts', () => getAllContacts());
  ipcMain.handle('save-contact', (event, contact) => saveContact(contact));

   // 模糊匹配头像（支持自定义阈值，默认8）
  ipcMain.handle('find-contact-by-hash', (event, hash, threshold = 8) => {
    return findContactByHash(hash, threshold);
  });

  ipcMain.handle('find-contact-by-name', (event, name) => {
    return findContactByName(name);
  });

  ipcMain.handle('save-new-contact', async (event, { avatarHash, avatarBase64, name }) => {
    await saveContact({ name, avatarHash, avatarBase64 });
    return { success: true };
  });

  // 更新联系人头像（同一人换头像场景）
  ipcMain.handle('update-contact-avatar', async (event, { name, avatarHash, avatarBase64 }) => {
    await updateContactAvatar(name, avatarHash, avatarBase64);
    return { success: true };
  });

  // 手动创建联系人（前端传入头像base64，主进程计算hash后持久化）
  ipcMain.handle('create-contact', async (event, { name, avatarBase64, source, remark }) => {
    if (!name || !name.trim()) {
      return { success: false, error: '联系人名称不能为空' };
    }

    const trimmedName = name.trim();
    let avatarHash = null;
    let processedBase64 = null;

    // 处理头像：计算hash并标准化base64格式
    if (avatarBase64) {
      try {
        const base64Data = avatarBase64.replace(/^data:image\/\w+;base64,/, '');
        const avatarBuffer = Buffer.from(base64Data, 'base64');
        avatarHash = await computeImageHash(avatarBuffer);
        processedBase64 = `data:image/png;base64,${base64Data}`;
      } catch (err) {
        console.error('[contact] 头像处理失败:', err);
      }
    }

    try {
      const result = createContact({
        name: trimmedName,
        avatarHash,
        avatarBase64: processedBase64,
        source: source || 'manual',
        remark: remark || null
      });
      return { success: true, contactId: result.lastInsertRowid };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '联系人名称已存在' };
      }
      console.error('[contact] 创建联系人失败:', err);
      return { success: false, error: err.message };
    }
  });

  // 更新联系人信息
  ipcMain.handle('update-contact', async (event, { id, name, avatarBase64, source, remark }) => {
    if (!name || !name.trim()) {
      return { success: false, error: '联系人名称不能为空' };
    }

    const trimmedName = name.trim();
    let avatarHash = null;
    let processedBase64 = null;

    // 处理头像：计算hash并标准化base64格式
    if (avatarBase64) {
      try {
        const base64Data = avatarBase64.replace(/^data:image\/\w+;base64,/, '');
        const avatarBuffer = Buffer.from(base64Data, 'base64');
        avatarHash = await computeImageHash(avatarBuffer);
        processedBase64 = `data:image/png;base64,${base64Data}`;
      } catch (err) {
        console.error('[contact] 头像处理失败:', err);
      }
    }

    try {
      // 获取旧联系人信息，用于同步更新任务表
      const oldContact = getContactById(id);
      const oldName = oldContact ? oldContact.name : trimmedName;

      const updates = {
        name: trimmedName,
        source: source || 'manual',
        remark: remark || null
      };
      if (processedBase64) {
        updates.avatar_hash = avatarHash;
        updates.avatar_base64 = processedBase64;
      }
      updateContact(id, updates);

      // 同步更新 tasks 表中该联系人的名称和头像
      const newAvatar = processedBase64 || (oldContact ? oldContact.avatar_base64 : '');
      syncContactToTasks(oldName, trimmedName, newAvatar);

      return { success: true };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return { success: false, error: '联系人名称已存在' };
      }
      console.error('[contact] 更新联系人失败:', err);
      return { success: false, error: err.message };
    }
  });

  // 删除联系人及其所有任务
  ipcMain.handle('delete-contact', async (event, { id, name }) => {
    try {
      // 先删除该联系人的所有任务
      deleteTasksByContactName(name);
      // 再删除联系人
      deleteContact(id);
      return { success: true };
    } catch (err) {
      console.error('[contact] 删除联系人失败:', err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerContactHandlers };