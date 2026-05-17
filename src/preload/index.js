// src/preload/index.js
console.log('preload script loaded')
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 双截图（改为invoke，由主进程统一处理识别逻辑）
  finishScreenshot: (region) => ipcRenderer.invoke('finish-screenshot', region),
  cancelScreenshot: () => ipcRenderer.send('cancel-screenshot'),
  startDoubleScreenshot: () => ipcRenderer.invoke('start-double-screenshot'),
  onDoubleScreenshotResult: (callback) => {
    ipcRenderer.on('double-screenshot-result', (event, data) => callback(data));
  },
  
  // ⭐ 新增：整合识别结果（双模型）
  onIntegratedExtractionResult: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('integrated-extraction-result', listener);
    return () => ipcRenderer.removeListener('integrated-extraction-result', listener);
  },
  
  // 便签相关
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  createStickyNote: (data) => ipcRenderer.invoke('create-sticky-note', data),
  
  // 任务数据库
  saveTask: (task) => ipcRenderer.invoke('save-task', task),
  getAllTasks: () => ipcRenderer.invoke('get-all-tasks'),
  
  // 联系人数据库
  getAllContacts: () => ipcRenderer.invoke('get-all-contacts'),
  saveContact: (contact) => ipcRenderer.invoke('save-contact', contact),
  findContactByHash: (hash) => ipcRenderer.invoke('find-contact-by-hash', hash),
  saveNewContact: (data) => ipcRenderer.invoke('save-new-contact', data),
  
  // 名称截图引导
  requestNameScreenshot: () => ipcRenderer.send('request-name-screenshot'),
  onNameCaptureGuide: (callback) => {
    ipcRenderer.on('show-name-capture-guide', callback)
  },
  
  // 剪贴板截图（备选方案）
  onNewScreenshot: (callback) => {
    const listener = (event, base64) => callback(base64)
    ipcRenderer.on('new-screenshot', listener)
    return () => ipcRenderer.removeListener('new-screenshot', listener)
  },
  
  // YOLO提取结果（剪贴板方案）
  onScreenshotExtracted: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('screenshot-extracted', listener)
    return () => ipcRenderer.removeListener('screenshot-extracted', listener)
  },
})