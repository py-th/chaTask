// src/database/repositories/contactRepository.js
const db = require('../db');
const { hammingDistance } = require('../../main/utils/hash');

function getAllContacts() {
  const stmt = db.prepare(`SELECT * FROM contacts ORDER BY name`);
  return stmt.all();
}

function saveContact(contact) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO contacts (name, avatar_hash, avatar_base64, source, remark)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(contact.name, contact.avatarHash, contact.avatarBase64, contact.source || 'unknow', contact.remark || null);
}

function createContact(contact) {
  const stmt = db.prepare(`
    INSERT INTO contacts (name, avatar_hash, avatar_base64, source, remark)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(contact.name, contact.avatarHash, contact.avatarBase64, contact.source || 'unknow', contact.remark || null);
}

/**
 * 模糊匹配头像（汉明距离）
 * @param {string} avatarHash - 当前头像的 aHash
 * @param {number} threshold - 汉明距离阈值（256位hash默认8）
 */
function findContactByHash(avatarHash, threshold = 8) {
  if (!avatarHash) return null;
  
  const contacts = db.prepare(`
    SELECT * FROM contacts 
    WHERE avatar_hash IS NOT NULL AND avatar_hash != ''
  `).all();
  
  let bestMatch = null;
  let bestDist = Infinity;
  
  for (const contact of contacts) {
    if (!contact.avatar_hash || contact.avatar_hash.length !== avatarHash.length) continue;
    const dist = hammingDistance(avatarHash, contact.avatar_hash);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = contact;
    }
  }
  
  return bestMatch && bestDist <= threshold ? bestMatch : null;
}

/** 通过名称查找（不区分大小写） */
function findContactByName(name) {
  if (!name) return null;
  const stmt = db.prepare(`SELECT * FROM contacts WHERE name = ? COLLATE NOCASE`);
  return stmt.get(name);
}

/** 通过ID查找 */
function getContactById(id) {
  if (!id) return null;
  const stmt = db.prepare(`SELECT * FROM contacts WHERE id = ?`);
  return stmt.get(id);
}

/** 更新联系人头像（同一人换头像时调用） */
function updateContactAvatar(name, avatarHash, avatarBase64) {
  const stmt = db.prepare(`
    UPDATE contacts SET avatar_hash = ?, avatar_base64 = ? WHERE name = ?
  `);
  return stmt.run(avatarHash, avatarBase64, name);
}

/** 更新联系人信息 */
function updateContact(id, updates) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);
  const stmt = db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`);
  return stmt.run(values);
}

/** 删除联系人 */
function deleteContact(id) {
  const stmt = db.prepare(`DELETE FROM contacts WHERE id = ?`);
  return stmt.run(id);
}

/** 根据联系人名称删除其所有任务 */
function deleteTasksByContactName(name) {
  const stmt = db.prepare(`DELETE FROM tasks WHERE sender_name = ?`);
  return stmt.run(name);
}

/** 更新指定联系人的任务计数 */
function updateContactTaskCount(contactName) {
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count FROM tasks 
    WHERE sender_name = ? AND is_deleted = 0
  `);
  const result = countStmt.get(contactName);
  const count = result ? result.count : 0;
  
  const updateStmt = db.prepare(`
    UPDATE contacts SET task_count = ? WHERE name = ?
  `);
  return updateStmt.run(count, contactName);
}

/** 更新所有联系人的任务计数 */
function updateAllContactTaskCounts() {
  const contacts = db.prepare(`SELECT name FROM contacts`).all();
  contacts.forEach(contact => {
    updateContactTaskCount(contact.name);
  });
}

/** 同步更新任务表中该联系人的名称、头像和来源 */
function syncContactToTasks(oldName, newName, newAvatar, newSource) {
  const updates = [];
  const values = [];
  
  updates.push('sender_name = ?');
  values.push(newName);
  
  updates.push('sender_avatar = ?');
  values.push(newAvatar || '');
  
  if (newSource !== undefined) {
    updates.push('source = ?');
    values.push(newSource);
  }
  
  values.push(oldName);
  
  const stmt = db.prepare(`
    UPDATE tasks SET ${updates.join(', ')} WHERE sender_name = ?
  `);
  return stmt.run(values);
}

module.exports = {
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
  syncContactToTasks,
  updateContactTaskCount,
  updateAllContactTaskCounts
};
