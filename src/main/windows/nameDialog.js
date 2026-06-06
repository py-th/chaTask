const { BrowserWindow, ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

function showNameDialog(messages, contacts, windowName) {
  return new Promise((resolve) => {
    const channel = 'name-dialog-result-' + Date.now();
    const tempDir = app.getPath('temp');
    const tempFile = path.join(tempDir, `chatask-name-dialog-${Date.now()}.html`);

    const dialog = new BrowserWindow({
      width: 520,
      height: 350,
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
      idx: i,
      text: m.text,
      avatarBase64: m.avatarBase64,
      senderName: m.senderName,
      rawDateText: m.rawDateText,
      sourceTime: m.sourceTime,
      avatarHash: m.avatarHash
    })));

    const imType = windowName || '未知来源';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>确认发送者信息</title><style>
html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; user-select: none; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.dialog-container { width: 100%; height: 100vh; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15); display: flex; flex-direction: column; color: #333; }
.dialog-header { background: #FFC107; color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: move; -webkit-app-region: drag; }
.dialog-title { font-size: 16px; font-weight: 600; }
.dialog-close { background: none; border: none; color: white; font-size: 20px; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: background 0.2s; -webkit-app-region: no-drag; }
.dialog-close:hover { background: rgba(255,255,255,0.2); }
.dialog-body { padding: 16px; flex: 1; overflow-y: auto; overflow-x: hidden; }

/* 文本区域 */
.msg-textarea { width: 100%; min-height: 80px; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: white; color: #333; outline: none; resize: vertical; box-sizing: border-box; margin-bottom: 12px; }
.msg-textarea:focus { border-color: #FFC107; }

/* 信息行 */
.info-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 13px; color: #666; }
.info-row .info-label { color: #999; white-space: nowrap; }
.info-row .info-value { color: #333; }
.info-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; font-size: 13px; color: #666; flex-wrap: wrap; }
.info-bar .info-item { display: flex; align-items: center; gap: 4px; }
.info-bar .info-item .info-label { color: #999; white-space: nowrap; }
.info-bar .info-item .info-value { color: #333; }

/* 联系人选择 */
.contact-selector { display: flex; align-items: center; gap: 8px; flex: 1; }
.contact-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; background: #eee; }
.contact-input-wrap { position: relative; flex: 1; display: flex; align-items: center; }
.contact-input { width: 100%; padding: 6px 28px 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; background: white; color: #333; outline: none; box-sizing: border-box; }
.contact-input:focus { border-color: #FFC107; }
.contact-dropdown-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: none; border: none; color: #999; cursor: pointer; font-size: 11px; padding: 4px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 3px; }
.contact-dropdown-btn:hover { background: rgba(0,0,0,0.05); color: #333; }

/* 下拉选项 */
.custom-select { position: relative; }
.custom-options { position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px; border: 1px solid #ddd; border-radius: 6px; background: white; z-index: 100; display: none; max-height: 200px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.custom-options.open { display: block; }
.custom-option { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; }
.custom-option:hover { background: #f5f5f5; }
.custom-option img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
.custom-option span { font-size: 13px; color: #333; }

/* 日期选择器 */
.date-picker { padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; background: white; color: #333; outline: none; cursor: pointer; }
.date-picker:focus { border-color: #FFC107; }

/* 底部 */
.dialog-footer { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-top: 1px solid #eee; }
.footer-info { font-size: 12px; color: #999; }
.footer-btns { display: flex; gap: 10px; }
.btn { padding: 8px 20px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-cancel { background: #e0e0e0; color: #666; }
.btn-cancel:hover { background: #d0d0d0; }
.btn-confirm { background: #FFC107; color: white; font-weight: 600; }
.btn-confirm:hover { background: #FFB300; }
.overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: none; z-index: 50; }
.overlay.show { display: block; }
</style></head><body>
<div class="dialog-container">
<div class="dialog-header"><span class="dialog-title">确认发送者信息</span><button class="dialog-close" onclick="window.__cancel()">×</button></div>
<div class="dialog-body" id="dialogBody"></div>
<div class="dialog-footer">
  <span class="footer-info" id="footerInfo"></span>
  <div class="footer-btns">
    <button class="btn btn-cancel" onclick="window.__cancel()">取消</button>
    <button class="btn btn-confirm" onclick="window.__confirmAll()">保存</button>
  </div>
</div>
</div>
<div class="overlay" id="overlay" onclick="window.__closeDropdown()"></div>
<script>
(function(){
  'use strict';
  try {
    var _contacts = ${contactsJson};
    var _messages = ${messagesJson};
    var _channel = '${channel}';
    var _defaultAvatar = "${defaultAvatar}";
    var _imType = "${imType}";
    var _ipc = null;
    try {
      _ipc = require('electron').ipcRenderer;
    } catch(err) {
      console.error('ipcRenderer加载失败:', err);
    }

    function e(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

    function render(){
      var body=document.getElementById('dialogBody');
      var footerInfo=document.getElementById('footerInfo');

      if(!body) {
        console.error('dialogBody元素未找到');
        return;
      }

      if(!_messages || _messages.length===0){
        body.innerHTML='<div style="color:#999;text-align:center;padding:40px;">无消息数据</div>';
        return;
      }

      var m=_messages[0];
      var contactName=m.senderName||'';
      var matchedContact=findContactByName(contactName);
      var avatar=(matchedContact&&matchedContact.avatarBase64)||m.avatarBase64||_defaultAvatar;
      var rawDate=m.rawDateText||null;
      var sourceDate=m.sourceTime?formatDateTime(m.sourceTime):'无';

      var originalSenderName = m.senderName || '未知';

      body.innerHTML=
        '<textarea class="msg-textarea" id="msgText">'+e(m.text)+'</textarea>'+
        '<div class="info-row">'+
          '<span class="info-label">来自聊天：</span>'+
          '<div class="contact-selector">'+
            '<img class="contact-avatar" id="contactAvatar" src="'+avatar+'">'+
            '<div class="contact-input-wrap custom-select">'+
              '<input class="contact-input" id="contactInput" value="'+e(contactName)+'" placeholder="输入发送者名称" oninput="window.__onContactInput()">'+
              '<button class="contact-dropdown-btn" onclick="window.__toggleDropdown(event)">▼</button>'+
              '<div class="custom-options" id="contactOptions"></div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="info-bar">'+
          '<div class="info-item">'+
            '<span class="info-label">截止日期：</span>'+
            '<input type="date" class="date-picker" id="dueDatePicker">'+
          '</div>'+
          '<div class="info-item">'+
            '<span class="info-label">消息发送日期：</span>'+
            '<span class="info-value">'+(rawDate?e(rawDate)+' ('+sourceDate+')':'无')+'</span>'+
          '</div>'+
        '</div>';

      renderContactOptions();

      if(footerInfo) footerInfo.textContent='来自聊天：'+originalSenderName+' ['+e(_imType)+']';
    }

    function renderContactOptions(){
      var opts=document.getElementById('contactOptions');
      if(!opts) return;
      if(!_contacts || _contacts.length===0) {
        opts.innerHTML='<div class="custom-option" style="color:#999;">暂无联系人</div>';
        return;
      }
      opts.innerHTML=_contacts.map(function(c){
        var avatarSrc = c.avatarBase64 || _defaultAvatar;
        return '<div class="custom-option" onclick="window.__selectContact('+JSON.stringify(c.name).replace(/"/g,'&quot;')+','+JSON.stringify(avatarSrc).replace(/"/g,'&quot;')+')">'+
          '<img src="'+avatarSrc+'"><span>'+e(c.name)+'</span></div>';
      }).join('');
    }

    function findContactByName(name){
      if(!name || !_contacts) return null;
      for(var i=0;i<_contacts.length;i++){
        if(_contacts[i].name===name) return _contacts[i];
      }
      return null;
    }

    function onContactInput(){
      var input=document.getElementById('contactInput');
      var avatarImg=document.getElementById('contactAvatar');
      if(!input || !avatarImg) return;
      var name=input.value.trim();
      var contact=findContactByName(name);
      if(contact && contact.avatarBase64){
        avatarImg.src=contact.avatarBase64;
      }else if(_messages && _messages[0] && _messages[0].avatarBase64){
        avatarImg.src=_messages[0].avatarBase64;
      }else{
        avatarImg.src=_defaultAvatar;
      }
    }

    function toggleDropdown(ev){
      if(ev) ev.stopPropagation();
      var opts=document.getElementById('contactOptions');
      var overlay=document.getElementById('overlay');
      if(!opts) return;
      if(opts.classList.contains('open')){
        closeDropdown();
      }else{
        opts.classList.add('open');
        if(overlay) overlay.classList.add('show');
      }
    }

    function closeDropdown(){
      var opts=document.getElementById('contactOptions');
      var overlay=document.getElementById('overlay');
      if(opts) opts.classList.remove('open');
      if(overlay) overlay.classList.remove('show');
    }

    function selectContact(name,avatar){
      var input=document.getElementById('contactInput');
      var avatarImg=document.getElementById('contactAvatar');
      if(input) input.value=name;
      if(avatarImg) avatarImg.src=avatar || _defaultAvatar;
      closeDropdown();
    }

    function formatDateTime(isoStr){
      try{
        var d=new Date(isoStr);
        return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0')+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
      }catch(e){ return isoStr; }
    }

    function confirmAll(){
      var input=document.getElementById('contactInput');
      var textarea=document.getElementById('msgText');
      var dueDatePicker=document.getElementById('dueDatePicker');
      var avatarImg=document.getElementById('contactAvatar');
      if(!input || !textarea) return;

      var name=input.value.trim();
      if(!name){ input.focus(); return; }

      var text=textarea.value.trim();
      var dueDate=dueDatePicker ? dueDatePicker.value : null;
      var currentAvatar=avatarImg ? avatarImg.src : null;
      var originalMsg=(_messages && _messages[0]) ? _messages[0] : {idx:0};

      var result={
        results:[{idx:originalMsg.idx, name:name, text:text, avatarBase64:currentAvatar || ''}],
        contactUpdates:[]
      };
      if(dueDate) result.results[0].dueDate=dueDate;

      var matchedContact=findContactByName(name);
      if(matchedContact){
        // 如果选择的是已有联系人，使用数据库中的头像
        if(matchedContact.avatarBase64){
          result.results[0].avatarBase64 = matchedContact.avatarBase64;
        }
        // 如果当前显示的头像与数据库不一致（且不是默认头像），更新联系人头像
        if(currentAvatar && currentAvatar!==matchedContact.avatarBase64 && currentAvatar!==_defaultAvatar){
          result.contactUpdates.push({
            name:name,
            avatarHash:originalMsg.avatarHash || '',
            avatarBase64:currentAvatar
          });
        }
      }

      if(_ipc) {
        _ipc.send(_channel, result);
      } else {
        console.error('IPC未初始化，无法发送结果');
      }
    }

    function cancel(){
      if(_ipc) {
        _ipc.send(_channel, null);
      } else {
        console.error('IPC未初始化，无法取消');
        window.close();
      }
    }

    // 暴露到全局
    window.__render = render;
    window.__onContactInput = onContactInput;
    window.__toggleDropdown = toggleDropdown;
    window.__closeDropdown = closeDropdown;
    window.__selectContact = selectContact;
    window.__confirmAll = confirmAll;
    window.__cancel = cancel;

    // 初始化渲染
    render();
  } catch(err) {
    console.error('NameDialog初始化失败:', err);
    document.body.innerHTML = '<div style="padding:20px;color:red;">对话框加载失败: '+e(err.message)+'</div>';
  }
})();
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
