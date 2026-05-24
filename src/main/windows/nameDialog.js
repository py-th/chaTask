const { BrowserWindow, ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

function showNameDialog(messages, contacts) {
  return new Promise((resolve) => {
    const channel = 'name-dialog-result-' + Date.now();
    const tempDir = app.getPath('temp');
    const tempFile = path.join(tempDir, `chatask-name-dialog-${Date.now()}.html`);

    const dialog = new BrowserWindow({
      width: 400,
      height: 380,
      resizable: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      center: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: null,
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    let resolved = false;

    ipcMain.once(channel, (event, result) => {
      resolved = true;
      if (dialog && !dialog.isDestroyed()) dialog.close();
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
      resolve(result);
    });

    dialog.on('closed', () => {
      if (!resolved) {
        ipcMain.removeAllListeners(channel);
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
        resolve(null);
      }
    });

    const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='45' height='45' viewBox='0 0 45 45'%3E%3Ccircle cx='22.5' cy='22.5' r='22.5' fill='%23e8e8e8'/%3E%3Ccircle cx='22.5' cy='16.5' r='7' fill='none' stroke='%23888' stroke-width='2.5'/%3E%3Cpath d='M8 37.5Q22.5 26 37 37.5' fill='none' stroke='%23888' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E";
    const contactsJson = JSON.stringify(contacts.map(c => ({ name: c.name, avatarBase64: c.avatar_base64 })));
    const messagesJson = JSON.stringify(messages.map((m, i) => ({
      idx: i, text: m.text, avatarBase64: m.avatarBase64, senderName: m.senderName, dateText: m.dateText
    })));

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>确认联系人</title><style>
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; user-select: none; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.dialog-container { width: 100%; height: 100vh; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15); display: flex; flex-direction: column; }
.dialog-header { background: #FFC107; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; -webkit-app-region: drag; }
.dialog-title { font-size: 16px; font-weight: 600; }
.dialog-close { background: none; border: none; color: white; font-size: 20px; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: background 0.2s; -webkit-app-region: no-drag; }
.dialog-close:hover { background: rgba(255,255,255,0.2); }
.dialog-body { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }
.form-row { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.form-label { font-size: 14px; color: #666; min-width: 80px; flex-shrink: 0; }
input { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; background: white; outline: none; }
input:focus { border-color: #FFC107; }
.custom-select { position: relative; width: 100%; margin-right:30px;}
.custom-select-trigger { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; background: white; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
.custom-select-trigger:focus { outline: none; border-color: #FFC107; }
.custom-select-trigger::after { content: '▼'; font-size: 10px; color: #999; }
.custom-options { position: absolute; top: 100%; left: 0; right: 0; margin-top: 2px; border: 1px solid #ddd; border-radius: 4px; background: white; z-index: 100; display: none; max-height: 180px; overflow-y: auto; }
.custom-options.open { display: block; }
.custom-option { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; }
.custom-option:hover { background: #f5f5f5; }
.custom-option img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
.custom-option span { font-size: 14px; }
.m-row { display: flex; gap: 10px; align-items: flex-start; background: #fafafa; border-radius: 6px; padding: 12px; margin-bottom: 10px; }
.m-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.m-info { flex: 1; min-width: 0; }
.m-text { font-size: 13px; line-height: 1.5; word-break: break-all; margin-bottom: 4px; }
.m-meta { font-size: 12px; color: #86909C; }
.m-input-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
.m-input-row label { white-space: nowrap; font-size: 12px; color: #666; }
.m-input-row input { flex: 1; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; outline: none; }
.m-input-row input:focus { border-color: #FFC107; }
.dialog-footer { display: flex; gap: 10px; padding: 12px 16px; border-top: 1px solid #eee; }
.btn { flex: 1; padding: 10px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-delete { background: #e0e0e0; color: #666; }
.btn-delete:hover { background: #d0d0d0; }
.btn-confirm { background: #FFC107; color: white; font-weight: 600; }
.btn-confirm:hover { background: #FFB300; }
.overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: none; }
.overlay.show { display: block; }
</style></head><body>
<div class="dialog-container">
<div class="dialog-header"><span class="dialog-title">确认发送者信息</span><button class="dialog-close" onclick="cancel()">×</button></div>
<div class="dialog-body">
<div class="form-row">
<span class="form-label">选择联系人:</span>
<div class="custom-select">
<div class="custom-select-trigger" onclick="toggleDropdown()">请选择联系人</div>
<div class="custom-options" id="contactOptions"></div>
</div>
</div>
<div id="msgList"></div>
</div>
<div class="dialog-footer"><button class="btn btn-delete" onclick="cancel()">取消</button><button class="btn btn-confirm" onclick="confirmAll()">确认并保存</button></div>
</div>
<div class="overlay" id="overlay" onclick="closeDropdown()"></div>
<script>
var _contacts = ${contactsJson};
var _messages = ${messagesJson};
var _channel = '${channel}';
var _defaultAvatar = "${defaultAvatar}";
var _ipc = require('electron').ipcRenderer;

function e(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function a(s){return(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;')}

function render(){
  var opts=document.getElementById('contactOptions');
  opts.innerHTML=_contacts.map(function(c){
    return '<div class="custom-option" onclick="selectContact(\\''+a(c.name)+'\\')"><img src="'+(c.avatarBase64||_defaultAvatar)+'"><span>'+e(c.name)+'</span></div>';
  }).join('');

  var l=document.getElementById('msgList');
  l.innerHTML=_messages.map(function(m,i){
    return '<div class="m-row">'+
      '<img class="m-avatar" src="'+(m.avatarBase64||_defaultAvatar)+'">'+
      '<div class="m-info">'+
        '<div class="m-text">'+e(m.text.substring(0,80))+'</div>'+
        '<div class="m-meta">'+(m.dateText?'日期: '+e(m.dateText)+' | ':'')+(m.senderName?'建议: '+e(m.senderName):'未识别发送者')+'</div>'+
        '<div class="m-input-row"><label>发送者:</label><input id="inp'+i+'" value="'+a(m.senderName||'')+'" placeholder="输入名称" onkeydown="if(event.key===\\'Enter\\'){confirmAll()}"/></div>'+
      '</div></div>';
  }).join('');
}

function toggleDropdown(){
  var opts=document.getElementById('contactOptions');
  var overlay=document.getElementById('overlay');
  opts.classList.toggle('open');
  overlay.classList.toggle('show');
}

function closeDropdown(){
  var opts=document.getElementById('contactOptions');
  var overlay=document.getElementById('overlay');
  opts.classList.remove('open');
  overlay.classList.remove('show');
}

function selectContact(name){
  if(!name)return;
  var inputs=document.querySelectorAll('[id^=inp]');
  for(var i=0;i<inputs.length;i++){inputs[i].value=name;}
  closeDropdown();
}

function confirmAll(){
  var inputs=document.querySelectorAll('[id^=inp]');
  var results=[];
  for(var i=0;i<inputs.length;i++){
    var v=inputs[i].value.trim();
    if(!v){inputs[i].focus();return;}
    results.push({idx:_messages[i].idx,name:v});
  }
  _ipc.send(_channel,results);
}

function cancel(){_ipc.send(_channel,null)}
render();
var fi=document.querySelector('[id^=inp]');if(fi)fi.focus();
</script></body></html>`;

    try {
      fs.writeFileSync(tempFile, html, 'utf8');
      dialog.loadFile(tempFile);

      dialog.once('ready-to-show', () => {
        dialog.show();
      });
    } catch (err) {
      console.error('[NameDialog] 创建对话框窗口失败:', err);
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (e) {}
      resolve(null);
    }
  });
}

module.exports = { showNameDialog };