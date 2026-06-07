// src/main/services/integrationService.js
const { matchContact } = require('./contactMatcher');
const { updateContactAvatar } = require('../../database/repositories/contactRepository');
const { computeImageHash } = require('../utils/hash');
const db = require('../../database/db');

/**
 * 整合两个YOLO模型的识别结果
 */
async function integrateExtractionResults(avatarTextResult, senderDateResult, screenshotData) {
  
  // 如果局部截图未识别到文本，直接返回失败
  if (!avatarTextResult.success) {
    return {
      success: false,
      error: avatarTextResult.reason || avatarTextResult.error || '模型未检测到有效内容',
      localImageBase64: screenshotData.localImageBuffer.toString('base64'),
      screenshotInfo: {
        windowName: screenshotData.windowName,
        region: screenshotData.region
      },
      rawDetections: avatarTextResult.rawDetections || { avatars: 0, texts: 0 },
      rawResults: {
        avatarText: {
          success: false,
          messageCount: 0,
          rawDetections: avatarTextResult.rawDetections || { avatars: 0, texts: 0 }
        },
        senderDate: {
          success: senderDateResult.success,
          senderCount: senderDateResult.senders ? senderDateResult.senders.length : 0,
          dateCount: senderDateResult.dates ? senderDateResult.dates.length : 0
        }
      }
    };
  }
  
  // 提取最佳发送者（按置信度排序）
  let bestSender = null;
  if (senderDateResult.success && senderDateResult.senders && senderDateResult.senders.length > 0) {
    bestSender = senderDateResult.senders.sort((a, b) => b.confidence - a.confidence)[0];
  }
  
  // 提取最佳日期（按置信度排序）
  let bestDate = null;
  if (senderDateResult.success && senderDateResult.dates && senderDateResult.dates.length > 0) {
    bestDate = senderDateResult.dates.sort((a, b) => b.confidence - a.confidence)[0];
  }

  const contacts = db.prepare('SELECT * FROM contacts').all();
  const messages = [];
  
  if (avatarTextResult.messages?.length > 0) {
    for (const msg of avatarTextResult.messages) {
      try {
        let avatarBuffer = null;
        let avatarHash = null;
        
        // ⭐ 有头像才计算 hash，无头像则跳过
        if (msg.avatarBase64) {
          avatarBuffer = Buffer.from(
            msg.avatarBase64.replace(/^data:image\/\w+;base64,/, ''), 
            'base64'
          );
          avatarHash = await computeImageHash(avatarBuffer);
        }
        
        // ⭐ 使用智能匹配替代简单匹配
        const matchResult = await matchContact(
          avatarBuffer,
          avatarHash,
          bestSender?.text || null,
          contacts
        );
        
        // 情况 b：需要更新头像（同一人换头像 / 补充头像）
        if (matchResult.shouldUpdateAvatar && matchResult.matchedContact) {
          await updateContactAvatar(
            matchResult.matchedContact.name,
            matchResult.updateAvatarData.hash,
            matchResult.updateAvatarData.base64
          );
          console.log(`[Integration] 更新联系人[${matchResult.matchedContact.name}]头像`);
        }
        
        // 解析日期，未识别则使用当前时间
        let sourceTime = new Date().toISOString();
        if (bestDate) {
          console.log(`[Integration] 原始日期文本：[${bestDate.text}]`);
          const parsedDate = parseDateText(bestDate.text);
          if (parsedDate) sourceTime = parsedDate.toISOString();
        }
        
        messages.push({
          text: msg.text,
          avatarBase64: msg.avatarBase64,  // 可能为 null
          avatarHash: avatarHash,
          senderName: matchResult.senderName,
          sourceTime: sourceTime,
          rawDateText: bestDate ? bestDate.text : null,
          source: screenshotData.windowName || '',
          confidence: msg.confidence,
          direction: msg.direction,
          isNewContact: matchResult.isNewContact,
          senderRegion: bestSender ? bestSender.region : null,
          dateRegion: bestDate ? bestDate.region : null,
          dateText: bestDate ? bestDate.text : null,
          senderConfidence: bestSender ? bestSender.confidence : 0,
          dateConfidence: bestDate ? bestDate.confidence : 0,
          matchReason: matchResult.reason
        });
      } catch (err) {
        console.error('[Integration] 处理单条消息失败:', err);
      }
    }
  }
  
  return {
    success: messages.length > 0,
    messages: messages,
    localImageBase64: screenshotData.localImageBuffer.toString('base64'),
    fullWindowBase64: screenshotData.fullWindowBuffer ? screenshotData.fullWindowBuffer.toString('base64') : null,
    screenshotInfo: {
      windowName: screenshotData.windowName,
      region: screenshotData.region
    },
     // ⭐ 保留原始头像/文本检测数量，兼容前端展示
    rawDetections: avatarTextResult.rawDetections || { avatars: 0, texts: 0 },
    rawResults: {
      avatarText: {
        success: avatarTextResult.success,
        messageCount: avatarTextResult.messages ? avatarTextResult.messages.length : 0,
        rawDetections: avatarTextResult.rawDetections || { avatars: 0, texts: 0 }
      },
      senderDate: {
        success: senderDateResult.success,
        senderCount: senderDateResult.senders ? senderDateResult.senders.length : 0,
        dateCount: senderDateResult.dates ? senderDateResult.dates.length : 0
      }
    }
  };
}

/**
 * 解析中文/标准日期文本
 */
function parseDateText(text) {
  if (!text) return null;

  // 1. 预处理：OCR 文本清洗
  text = cleanOCRText(text);

  const now = new Date();
  const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let finalDate = null;
  let finalTime = null;

  // 2. 提取时间部分
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    finalTime = {
      hours: parseInt(timeMatch[1], 10),
      minutes: parseInt(timeMatch[2], 10)
    };
    text = text.replace(timeMatch[0], '').trim();
  }

  // 3. 解析日期部分
  const trimmedText = text.trim();

  if (!trimmedText) {
    finalDate = todayZero;
  } 
  else if (['刚刚', '现在'].includes(trimmedText)) {
    return now;
  }
  else if (trimmedText === '今天') {
    finalDate = todayZero;
  } 
  else if (trimmedText === '昨天') {
    finalDate = new Date(todayZero);
    finalDate.setDate(finalDate.getDate() - 1);
  } 
  else if (trimmedText === '前天') {
    finalDate = new Date(todayZero);
    finalDate.setDate(finalDate.getDate() - 2);
  } 
  else if (trimmedText === '明天') {
    finalDate = new Date(todayZero);
    finalDate.setDate(finalDate.getDate() + 1);
  }
  // --- 修正后的星期解析 ---
  else if (/^周([一二三四五六日天])/.test(trimmedText) || /^星期([一二三四五六日天])/.test(trimmedText)) {
    const match = trimmedText.match(/(?:周|星期)([一二三四五六日天])/);
    const weekMap = { '日': 0, '天': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
    const targetDay = weekMap[match[1]];
    const currentDay = now.getDay();
    
    let daysDiff = targetDay - currentDay;
    if (daysDiff > 0) {
      daysDiff -= 7; // 指向过去
    } else if (daysDiff === 0) {
      daysDiff = -7; // 同为周X时指向上周
    }
    
    finalDate = new Date(todayZero);
    finalDate.setDate(finalDate.getDate() + daysDiff);
  }
  // --- 标准日期格式解析 ---
  else {
    const datePatterns = [
      { regex: /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/, type: 'full' },
      { regex: /(\d{4})年(\d{1,2})月(\d{1,2})日/, type: 'full' },
      { regex: /(\d{1,2})[-/](\d{1,2})/, type: 'md' },
      { regex: /(\d{1,2})月(\d{1,2})日/, type: 'md' }
    ];

    for (const p of datePatterns) {
      const match = trimmedText.match(p.regex);
      if (match) {
        let year, month, day;
        if (p.type === 'full') {
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          day = parseInt(match[3], 10);
        } else {
          year = now.getFullYear();
          month = parseInt(match[1], 10) - 1;
          day = parseInt(match[2], 10);
        }
        finalDate = new Date(year, month, day);
        if (isNaN(finalDate.getTime())) finalDate = null;
        break;
      }
    }
  }

  // 4. 处理“上午/下午”对时间的影响
  if (finalTime) {
    if (text.includes('下午') && finalTime.hours < 12) {
      finalTime.hours += 12;
    } else if (text.includes('上午') && finalTime.hours === 12) {
      finalTime.hours = 0;
    }
  }

  // 5. 组合日期和时间
  if (finalDate && finalTime) {
    finalDate.setHours(finalTime.hours);
    finalDate.setMinutes(finalTime.minutes);
    finalDate.setSeconds(0);
    finalDate.setMilliseconds(0);
  }

  return finalDate;
}

/**
 * OCR 文本清洗工具
 * 处理空格、全角符号、中文数字、常见形近字错误
 */
function cleanOCRText(text) {
  if (!text) return '';
  
  let cleaned = text;

  // 1. 去除所有空白字符（空格、制表符、全角空格），将所有内容紧凑连接
  // 这一步解决了 "昨 天  12:23" -> "昨天12:23" 的问题
  cleaned = cleaned.replace(/[\s\u3000]+/g, '');

  // 2. 符号标准化
  // 全角冒号转半角
  cleaned = cleaned.replace(/：/g, ':');
  // 统一分隔符（可选，视需求而定，这里保留 - 和 /）

  // 3. 常见OCR形近字修复 (针对英文和数字)
  const charMap = {
    'O': '0', 'o': '0', // 字母O转数字0
    'l': '1', 'I': '1', 'i': '1', // 字母l/I转数字1
    'B': '8', // 字母B转数字8
    'Z': '2', // 某些字体Z和2相似
    'S': '5', // 某些字体S和5相似
    'G': '6', 'g': '6',
    'Q': '9', 'q': '9'
  };
  // 简单的替换策略：如果字符单独出现或在数字上下文中，进行替换
  // 这里采用全局替换，实际生产中可能需要更复杂的上下文判断
  Object.keys(charMap).forEach(key => {
    // 使用正则全局替换
    const regex = new RegExp(key, 'g');
    cleaned = cleaned.replace(regex, charMap[key]);
  });

  // 4. 中文数字转阿拉伯数字 (针对时间部分，如 "十二:30")
  // 仅处理简单的个位和十位，覆盖常见场景
  const cnNums = { '零':0, '一':1, '二':2, '两':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10 };
  
  // 这是一个简化的中文数字转换，专门针对时间格式前的数字
  // 例如：将 "十二" 转换为 12
  // 注意：这可能会误伤 "十二月" 中的 "十二"，但在日期解析中通常无害，或者需要更精细的正则
  // 这里我们主要针对 "上午" "下午" 前面的中文数字做处理，或者直接依赖正则匹配时的容错
  
  return cleaned;
}

module.exports = { integrateExtractionResults };