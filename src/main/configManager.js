const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

const builtinDefaults = {
  modelPath_avatar_text: path.join(process.cwd(), 'public/models/best_avatar_text.onnx'),
  modelPath_sender_date: path.join(process.cwd(), 'public/models/best_sender_date.onnx'),
  rapidOCR: {
    detModelPath: path.join(process.cwd(), 'public/models/ch_PP-OCRv5_det_mobile.onnx'),
    recModelPath: path.join(process.cwd(), 'public/models/ch_PP-OCRv5_rec_mobile.onnx'),
    dictionaryPath: path.join(process.cwd(), 'public/models/ppocrv5_mobile_dict.txt'),
  },
  yolo: {
    inputSize: 640,
    confThreshold: 0.5,
    nmsThreshold: 0.45,
    classes: ['avatar', 'text_info']
  },
  ocr: {
    scaleThresholdSmall: 48,
    scaleThresholdMedium: 80,
    scaleFactorSmall: 3,
    scaleFactorMedium: 2,
    onnxExecutionProviders: ['cpu'],
    onnxIntraOpThreads: 1,
    onnxInterOpThreads: 1
  },
  matching: {
    avatarHashThreshold: 8,
    avatarColorThreshold: 0.7,
    looseHashThreshold: 15,
    looseColorThreshold: 0.5
  },
  dateString: ['刚刚', '现在', '昨天', '今天', '明天'],
  mainWindow: {
    width: 900,
    height: 700
  },
  sticky: {
    defaultWidth: 300,
    minHeight: 60,
    foldedSize: 45,
    timelineWidth: 300,
    timelineHeight: 400
  },
  reminder: {
    popupWidth: 400,
    popupHeight: 500,
    triggerWindowMs: 60000,
    cleanupDays: 30
  }
};

const userDefaults = {
  general: {
    autoLaunch: false,
    minimizeToTray: true,
    theme: 'system',
    foldedDimDelay: 1
  },
  sticky: {
    defaultOpacity: 100,
    edgeSnap: true,
    edgeSnapThreshold: 10,
    skipTaskbar: true,
    foldedAvatarSize: 45,
    foldedEdge: 'right',
    taskTextMaxLength: 200,
    defaultWidth: 300,
    timelineWidth: 300,
    timelineHeight: 400
  },
  screenshot: {
    mode: 'shortcut',
    confirmMode: 'on_mismatch',
    clipboardInterval: 1000,
    clipboardMinWidth: 50,
    clipboardMaxWidth: 500,
    clipboardMinHeight: 20,
    clipboardMaxHeight: 300
  },
  ocr: {
    engine: 'paddle',
    language: 'ch'
  },
  shortcuts: {
    screenshot: 'Ctrl+Alt+S',
    showWindow: 'Ctrl+Shift+A'
  },
  reminder: {
    defaultTime: '09:00',
    advanceMinutes: 0,
    checkInterval: 30000,
    snoozeMinutes: 3
  },
  yolo: {
    confThreshold: 0.5
  },
  matching: {
    avatarHashThreshold: 8,
    avatarColorThreshold: 0.7
  }
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function migrateOcrConfig(ocrConfig) {
  // 从旧格式迁移到基础版纯本地 OCR 格式
  if (!ocrConfig) return null;

  if (ocrConfig.mode !== undefined && ocrConfig.engine === undefined) {
    const migrated = { ...ocrConfig };
    // 基础版仅支持本地引擎
    migrated.engine = 'paddle';
    delete migrated.mode;
    delete migrated.cloud;
    delete migrated.baidu;
    delete migrated.aliyun;
    delete migrated.tencent;
    delete migrated.timeout;
    return migrated;
  }

  // 清理可能残留的云端 OCR 配置
  delete ocrConfig.baidu;
  delete ocrConfig.aliyun;
  delete ocrConfig.tencent;
  delete ocrConfig.timeout;
  if (ocrConfig.engine && ocrConfig.engine !== 'paddle') {
    ocrConfig.engine = 'paddle';
  }
  return ocrConfig;
}

function loadUserSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      let parsed = JSON.parse(raw);

      // 清理已移除的云端同步配置
      delete parsed.cloudSync;

      // 迁移 OCR 配置
      if (parsed.ocr) {
        parsed.ocr = migrateOcrConfig(parsed.ocr);
      }

      // 迁移贴边折叠延时半透明时间：从 sticky 迁移到 general
      if (parsed.sticky && parsed.sticky.foldedDimDelay !== undefined) {
        if (!parsed.general) parsed.general = {};
        if (parsed.general.foldedDimDelay === undefined) {
          parsed.general.foldedDimDelay = parsed.sticky.foldedDimDelay;
        }
        delete parsed.sticky.foldedDimDelay;
      }

      return deepMerge(userDefaults, parsed);
    }
  } catch (err) {
    console.error('[ConfigManager] 读取用户设置失败:', err.message);
  }
  return { ...userDefaults };
}

function saveUserSettings(settings) {
  try {
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[ConfigManager] 保存用户设置失败:', err.message);
    return false;
  }
}

function getEffectiveConfig() {
  const userSettings = loadUserSettings();
  const result = { ...builtinDefaults };

  result.screenshot = { ...builtinDefaults.screenshot || {}, ...userSettings.screenshot };
  result.sticky = deepMerge(
    { ...builtinDefaults.sticky, ...userSettings.sticky },
    builtinDefaults.sticky
  );
  result.reminder = deepMerge(
    { ...builtinDefaults.reminder, ...userSettings.reminder },
    builtinDefaults.reminder
  );

  result.ocr = deepMerge(
    { ...builtinDefaults.ocr, ...userSettings.ocr },
    builtinDefaults.ocr
  );

  result.matching = { ...builtinDefaults.matching, ...userSettings.matching };
  result.yolo = { ...builtinDefaults.yolo, ...userSettings.yolo };
  result.general = { ...userSettings.general };
  result.shortcuts = { ...userSettings.shortcuts };

  return result;
}

module.exports = {
  builtinDefaults,
  userDefaults,
  loadUserSettings,
  saveUserSettings,
  getEffectiveConfig,
  settingsPath
};