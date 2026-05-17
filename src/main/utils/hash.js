// src/main/utils/hash.js
const sharp = require('sharp');

// 计算平均哈希（aHash）- 使用16x16提高精度（256位）
async function computeImageHash(imageBuffer) {
  const { data } = await sharp(imageBuffer)
    .resize(16, 16, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / data.length;
  let hash = '';
  for (let i = 0; i < data.length; i++) {
    hash += data[i] > avg ? '1' : '0';
  }
  return hash;
}

// 汉明距离
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) return Infinity;
  let diff = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) diff++;
  }
  return diff;
}

// 计算颜色直方图相似度（辅助验证，防止不同头像哈希冲突）
async function computeColorSimilarity(buffer1, buffer2) {
  try {
    const [data1, data2] = await Promise.all([
      sharp(buffer1).resize(32, 32).raw().toBuffer({ resolveWithObject: true }),
      sharp(buffer2).resize(32, 32).raw().toBuffer({ resolveWithObject: true })
    ]);
    
    let diff = 0;
    const len = Math.min(data1.data.length, data2.data.length);
    for (let i = 0; i < len; i++) {
      diff += Math.abs(data1.data[i] - data2.data[i]);
    }
    const similarity = 1 - (diff / (len * 255));
    return similarity;
  } catch (e) {
    return 0;
  }
}

/**
 * 综合匹配头像（哈希 + 颜色双重验证）
 * @param {Buffer} currentBuffer - 当前头像Buffer
 * @param {string} currentHash - 当前头像哈希
 * @param {Array} contacts - 联系人列表
 * @param {number} hashThreshold - 哈希距离阈值（256位推荐8）
 * @param {number} colorThreshold - 颜色相似度阈值（0-1，推荐0.7）
 */
async function matchAvatar(currentBuffer, currentHash, contacts, hashThreshold = 8, colorThreshold = 0.7) {
  let bestMatch = null;
  let bestScore = -Infinity;
  
  for (const contact of contacts) {
    if (!contact.avatar_hash) continue;
    
    const dist = hammingDistance(currentHash, contact.avatar_hash);
    if (dist > hashThreshold) continue;
    
    // 哈希通过后，进行颜色相似度验证
    let colorScore = 0.5;
    if (contact.avatar_base64) {
      try {
        const contactBuffer = Buffer.from(contact.avatar_base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        colorScore = await computeColorSimilarity(currentBuffer, contactBuffer);
      } catch (e) {
        colorScore = 0.5;
      }
    }
    
    // 如果颜色相似度太低，跳过（防止不同头像哈希冲突）
    if (colorScore < colorThreshold) continue;
    
    // 综合评分：哈希权重60%，颜色权重40%
    const hashScore = 1 - (dist / hashThreshold);
    const score = hashScore * 0.6 + colorScore * 0.4;
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = contact;
    }
  }
  
  return bestMatch;
}

module.exports = { computeImageHash, hammingDistance, matchAvatar };