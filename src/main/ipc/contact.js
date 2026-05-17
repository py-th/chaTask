// src/main/ipc/contact.js
const { ipcMain } = require('electron');
const { 
  getAllContacts, 
  saveContact, 
  findContactByHash,
  findContactByName,
  updateContactAvatar
} = require('../../database/repositories/contactRepository');

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
}

module.exports = { registerContactHandlers };