// src/main/services/skinService.js
// 皮肤配置服务：提供默认皮肤和增值皮肤模板

const SINGLE_SKINS = [
  {
    id: 'default',
    name: '默认',
    type: 'single',
    description: '简洁清晰的默认风格',
    isPremium: false,
    style: {
      opacity: 0.98,
      bgColor: '',
      textColor: '#1D2129',
      bold: false,
      fontSize: 14.5,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      lineHeight: 1.55,
      textAlign: 'left',
      padding: '6px 10px',
      borderRadius: 10
    }
  },
  {
    id: 'wechat',
    name: '微信',
    type: 'single',
    description: '微信聊天风格',
    isPremium: true,
    style: {
      opacity: 1,
      bgColor: '#95EC69',
      textColor: '#000000',
      bold: false,
      fontSize: 14,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      lineHeight: 1.5,
      textAlign: 'left',
      padding: '6px 10px',
      borderRadius: 12
    }
  },
  {
    id: 'feishu',
    name: '飞书',
    type: 'single',
    description: '飞书文档风格',
    isPremium: true,
    style: {
      opacity: 1,
      bgColor: '#E8F1FF',
      textColor: '#1F2329',
      bold: false,
      fontSize: 14,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      lineHeight: 1.5,
      textAlign: 'left',
      padding: '6px 10px',
      borderRadius: 8
    }
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    type: 'single',
    description: '钉钉会话风格',
    isPremium: true,
    style: {
      opacity: 1,
      bgColor: '#FFF2E8',
      textColor: '#1F2329',
      bold: false,
      fontSize: 14,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      lineHeight: 1.5,
      textAlign: 'left',
      padding: '6px 10px',
      borderRadius: 8
    }
  }
];

const TIMELINE_SKINS = [
  {
    id: 'default',
    name: '默认',
    type: 'timeline',
    description: '温暖便签纸风格',
    isPremium: false,
    style: {
      opacity: 0.98,
      bgColor: 'rgba(255, 249, 196, 0.98)'
    }
  }
];

function getDefaultSingleSkin() {
  return SINGLE_SKINS[0];
}

function getDefaultTimelineSkin() {
  return TIMELINE_SKINS[0];
}

function getSkinById(id, type = 'single') {
  const list = type === 'timeline' ? TIMELINE_SKINS : SINGLE_SKINS;
  return list.find(skin => skin.id === id) || (type === 'timeline' ? getDefaultTimelineSkin() : getDefaultSingleSkin());
}

function getAllSkins(type = 'single') {
  return type === 'timeline' ? [...TIMELINE_SKINS] : [...SINGLE_SKINS];
}

function isSkinPremium(id, type = 'single') {
  const skin = getSkinById(id, type);
  return !!skin.isPremium;
}

function getSkinStyle(id, type = 'single') {
  const skin = getSkinById(id, type);
  return skin ? { ...skin.style } : {};
}

module.exports = {
  SINGLE_SKINS,
  TIMELINE_SKINS,
  getDefaultSingleSkin,
  getDefaultTimelineSkin,
  getSkinById,
  getAllSkins,
  isSkinPremium,
  getSkinStyle
};
