// src/main/services/contactMatcher.js
const { matchAvatar } = require('../utils/hash');
const { getEffectiveConfig } = require('../configManager');

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
    }
  }
  return matrix[b.length][a.length];
}

function stringSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const a = s1.trim().toLowerCase();
  const b = s2.trim().toLowerCase();
  if (a === b) return 1.0;
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / len;
}

function generateUniqueName(baseName, contacts) {
  let name = baseName;
  let counter = 2;
  const exists = (n) => contacts.some(c => c.name === n);
  while (exists(name)) {
    name = `${baseName}_${counter}`;
    counter++;
  }
  return name;
}

/**
 * 智能匹配联系人
 * 
 * a) 头像匹配，sender不匹配 → 信任头像，使用数据库名称
 * b) 头像不匹配，sender匹配 → 宽松阈值二次验证，同一人则更新头像，不同人则创建新名称
 */
async function matchContact(avatarBuffer, avatarHash, detectedSender, contacts) {
  // ========== 步骤1：如果有头像，尝试严格匹配 ==========
  let avatarMatch = null;
  if (avatarBuffer && avatarHash) {
    const cfg = getEffectiveConfig();
    avatarMatch = await matchAvatar(avatarBuffer, avatarHash, contacts, cfg.matching.avatarHashThreshold, cfg.matching.avatarColorThreshold);
  }
  
  if (avatarMatch) {
    const dbName = avatarMatch.name;
    const sim = stringSimilarity(detectedSender, dbName);
    
    // 情况 a：头像匹配，但 sender 名称与数据库不一致
    if (detectedSender && sim < 0.5) {
      console.log(`[ContactMatcher] 情况a：头像匹配到[${dbName}]，但识别名称为[${detectedSender}]，信任头像`);
      return {
        senderName: dbName,
        isNewContact: false,
        matchedContact: avatarMatch,
        shouldUpdateAvatar: false,
        reason: `头像匹配到[${dbName}]，OCR名称[${detectedSender}]差异过大，以头像为准`
      };
    }
    
    return {
      senderName: dbName,
      isNewContact: false,
      matchedContact: avatarMatch,
      shouldUpdateAvatar: false,
      reason: '头像匹配成功'
    };
  }
  
  // ========== 步骤2：头像未匹配（或无头像），尝试名称匹配 ==========
  if (detectedSender) {
    const nameMatch = contacts.find(c => 
      c.name && c.name.toLowerCase() === detectedSender.toLowerCase()
    );
    
    if (nameMatch) {
      console.log(`[ContactMatcher] 情况b：名称匹配到[${nameMatch.name}]，头像严格匹配失败或无头像`);
      
      // 如果有头像，尝试宽松匹配判断是否同一人换头像
      if (avatarBuffer && avatarHash && nameMatch.avatar_hash && nameMatch.avatar_base64) {
        const cfg = getEffectiveConfig();
        const looseMatch = await matchAvatar(avatarBuffer, avatarHash, [nameMatch], cfg.matching.looseHashThreshold, cfg.matching.looseColorThreshold);
        
        if (looseMatch) {
          return {
            senderName: nameMatch.name,
            isNewContact: false,
            matchedContact: nameMatch,
            shouldUpdateAvatar: true,
            updateAvatarData: {
              hash: avatarHash,
              base64: `data:image/png;base64,${avatarBuffer.toString('base64')}`
            },
            reason: '名称匹配成功，头像在宽松阈值内匹配，自动更新头像'
          };
        } else {
          const newName = generateUniqueName(detectedSender, contacts);
          console.log(`[ContactMatcher] 头像差异过大，创建新联系人[${newName}]`);
          return {
            senderName: newName,
            isNewContact: true,
            matchedContact: null,
            shouldUpdateAvatar: false,
            reason: `名称[${detectedSender}]已存在但头像差异过大，创建新联系人[${newName}]`
          };
        }
      }
      
      // 数据库中无头像 或 当前无头像：直接使用该联系人
      if (avatarBuffer && avatarHash) {
        // 当前有头像，数据库无头像 → 补充头像
        return {
          senderName: nameMatch.name,
          isNewContact: false,
          matchedContact: nameMatch,
          shouldUpdateAvatar: true,
          updateAvatarData: {
            hash: avatarHash,
            base64: `data:image/png;base64,${avatarBuffer.toString('base64')}`
          },
          reason: '名称匹配成功，补充头像到现有联系人'
        };
      } else {
        // 当前无头像，数据库也无头像 → 直接使用
        return {
          senderName: nameMatch.name,
          isNewContact: false,
          matchedContact: nameMatch,
          shouldUpdateAvatar: false,
          reason: '名称匹配成功（无头像）'
        };
      }
    }
  }
  
  // ========== 步骤3：都未匹配 ==========
  return {
    senderName: detectedSender || null,
    isNewContact: true,
    matchedContact: null,
    shouldUpdateAvatar: false,
    reason: '头像和名称均未匹配到现有联系人'
  };
}

module.exports = { matchContact, stringSimilarity };