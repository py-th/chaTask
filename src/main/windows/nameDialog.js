const { BrowserWindow, ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

function showNameDialog(messages, contacts, windowName, screenshotInfo) {
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
    const screenshotJson = JSON.stringify(screenshotInfo || {});

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

/* 消息列表 */
.msg-list { display: flex; flex-direction: column; gap: 12px; }
.msg-card { border: 1px solid #eee; border-radius: 8px; padding: 12px; background: #fafafa; }
.msg-card.active { border-color: #FFC107; background: #fffbf0; }
.msg-card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; color: #666; }
.msg-card-header .msg-index { background: #FFC107; color: white; font-size: 11px; font-weight: 600; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.msg-card-header .msg-sender { font-weight: 500; color: #333; }

/* 文本区域 */
.msg-textarea { width: 100%; min-height: 60px; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; background: white; color: #333; outline: none; resize: vertical; box-sizing: border-box; margin-bottom: 10px; }
.msg-textarea:focus { border-color: #FFC107; }

/* 信息行 */
.info-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 13px; color: #666; }
.info-row .info-label { color: #999; white-space: nowrap; }
.info-row .info-value { color: #333; }
.info-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; font-size: 13px; color: #666; flex-wrap: wrap; }
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

/* 截图预览折叠面板 */
.screenshot-collapse { margin-top: 8px; border: 1px solid #eee; border-radius: 6px; overflow: hidden; }
.screenshot-collapse-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fafafa; cursor: pointer; font-size: 13px; color: #666; }
.screenshot-collapse-header:hover { background: #f5f5f5; }
.screenshot-collapse-header .collapse-title { display: flex; align-items: center; gap: 6px; }
.screenshot-collapse-header .collapse-arrow { transition: transform 0.2s; font-size: 11px; }
.screenshot-collapse-header.open .collapse-arrow { transform: rotate(90deg); }
.screenshot-collapse-body { display: none; padding: 12px; background: #fafafa; border-top: 1px solid #eee; }
.screenshot-collapse-body.open { display: block; }
.screenshot-collapse-body img { max-width: 100%; max-height: 180px; border-radius: 4px; border: 1px solid #ddd; display: block; margin-bottom: 8px; }
.screenshot-stats { font-size: 12px; color: #666; line-height: 1.8; }
.screenshot-stats p { margin: 0; }
</style></head><body>
<div class="dialog-container">
<div class="dialog-header"><span class="dialog-title">确认发送者信息</span><button class="dialog-close" onclick="window.__cancel()">×</button></div>
<div class="dialog-body" id="dialogBody"></div>
<div class="dialog-footer">
  <span class="footer-info" id="footerInfo"></span>
  <div class="footer-btns">
    <button class="btn btn-cancel" onclick="window.__cancel()">取消</button>
    <button class="btn btn-confirm" onclick="window.__confirmAll()">保存全部</button>
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
    var _screenshotInfo = ${screenshotJson};
    var _ipc = null;
    try {
      _ipc = require('electron').ipcRenderer;
    } catch(err) {
      console.error('ipcRenderer加载失败:', err);
    }

    function e(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

    // 存储每条消息的编辑状态
    var _msgStates = [];

    function initMsgStates(){
      _msgStates = _messages.map(function(m, i){
        var contactName = m.senderName || '';
        var matchedContact = findContactByName(contactName);
        var avatar = (matchedContact && matchedContact.avatarBase64) || m.avatarBase64 || _defaultAvatar;
        return {
          idx: m.idx,
          name: contactName,
          text: m.text || '',
          avatar: avatar,
          dueDate: null,
          rawDate: m.rawDateText || null,
          sourceTime: m.sourceTime || null,
          avatarHash: m.avatarHash || ''
        };
      });
    }

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

      if(_msgStates.length === 0) initMsgStates();

      var screenshotHtml = '';
      if(_screenshotInfo && _screenshotInfo.localImageBase64){
        var msgCount = _screenshotInfo.messageCount || 0;
        var avatarCount = _screenshotInfo.avatarCount || 0;
        var textCount = _screenshotInfo.textCount || 0;
        var senderCount = _screenshotInfo.senderCount || 0;
        var dateCount = _screenshotInfo.dateCount || 0;
        var srcWindow = _screenshotInfo.windowName || '未知';
        screenshotHtml =
          '<div class="screenshot-collapse">'+
            '<div class="screenshot-collapse-header" id="screenshotHeader" onclick="window.__toggleScreenshot()">'+
              '<span class="collapse-title">📷 截图预览 <span style="color:#999;font-size:12px;">(点击展开)</span></span>'+
              '<span class="collapse-arrow">▶</span>'+
            '</div>'+
            '<div class="screenshot-collapse-body" id="screenshotBody">'+
              '<img src="data:image/png;base64,'+_screenshotInfo.localImageBase64+'">'+
              '<div class="screenshot-stats">'+
                '<p>提取到 '+msgCount+' 条消息</p>'+
                '<p>头像/文本模型识别：'+avatarCount+' 个头像，'+textCount+' 个文本框</p>'+
                '<p>发送者/日期模型识别：'+senderCount+' 个发送者，'+dateCount+' 个日期</p>'+
                '<p>来源窗口: '+e(srcWindow)+'</p>'+
              '</div>'+
            '</div>'+
          '</div>';
      }

      var msgsHtml = '<div class="msg-list">';
      for(var mi = 0; mi < _msgStates.length; mi++){
        var st = _msgStates[mi];
        var sourceDate = st.sourceTime ? formatDateTime(st.sourceTime) : '无';
        msgsHtml +=
          '<div class="msg-card">'+
            '<div class="msg-card-header">'+
              '<span class="msg-index">'+(mi+1)+'</span>'+
              '<span class="msg-sender">消息 '+(mi+1)+'</span>'+
            '</div>'+
            '<textarea class="msg-textarea" id="msgText_'+mi+'" oninput="window.__onTextChange('+mi+',this.value)">'+e(st.text)+'</textarea>'+
            '<div class="info-row">'+
              '<span class="info-label">来自聊天：</span>'+
              '<div class="contact-selector">'+
                '<img class="contact-avatar" id="contactAvatar_'+mi+'" src="'+st.avatar+'">'+
                '<div class="contact-input-wrap custom-select">'+
                  '<input class="contact-input" id="contactInput_'+mi+'" value="'+e(st.name)+'" placeholder="输入发送者名称" oninput="window.__onContactInput('+mi+')">'+
                  '<button class="contact-dropdown-btn" onclick="window.__toggleDropdown(event,'+mi+')">▼</button>'+
                  '<div class="custom-options" id="contactOptions_'+mi+'"></div>'+
                '</div>'+
              '</div>'+
            '</div>'+
            '<div class="info-bar">'+
              '<div class="info-item">'+
                '<span class="info-label">截止日期：</span>'+
                '<input type="date" class="date-picker" id="dueDatePicker_'+mi+'" onchange="window.__onDueDateChange('+mi+',this.value)">'+ 
              '</div>'+
              '<div class="info-item">'+
                '<span class="info-label">消息发送日期：</span>'+
                '<span class="info-value">'+(st.rawDate?e(st.rawDate)+' ('+sourceDate+')':'无')+'</span>'+
              '</div>'+
            '</div>'+
          '</div>';
      }
      msgsHtml += '</div>';

      body.innerHTML = msgsHtml + screenshotHtml;

      if(footerInfo) footerInfo.textContent='共 '+_msgStates.length+' 条消息 ['+e(_imType)+']';
    }

    function renderContactOptions(msgIdx){
      var opts=document.getElementById('contactOptions_'+msgIdx);
      if(!opts) return;
      if(!_contacts || _contacts.length===0) {
        opts.innerHTML='<div class="custom-option" style="color:#999;">暂无联系人</div>';
        return;
      }
      opts.innerHTML=_contacts.map(function(c){
        var avatarSrc = c.avatarBase64 || _defaultAvatar;
        return '<div class="custom-option" onclick="window.__selectContact('+msgIdx+','+JSON.stringify(c.name).replace(/"/g,'&quot;')+','+JSON.stringify(avatarSrc).replace(/"/g,'&quot;')+')">'+
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

    function onTextChange(msgIdx, value){
      if(_msgStates[msgIdx]) _msgStates[msgIdx].text = value;
    }

    function onDueDateChange(msgIdx, value){
      if(_msgStates[msgIdx]) _msgStates[msgIdx].dueDate = value;
    }

    function onContactInput(msgIdx){
      var input=document.getElementById('contactInput_'+msgIdx);
      var avatarImg=document.getElementById('contactAvatar_'+msgIdx);
      if(!input || !avatarImg) return;
      var name=input.value.trim();
      if(_msgStates[msgIdx]) _msgStates[msgIdx].name = name;
      var contact=findContactByName(name);
      if(contact && contact.avatarBase64){
        avatarImg.src=contact.avatarBase64;
        if(_msgStates[msgIdx]) _msgStates[msgIdx].avatar = contact.avatarBase64;
      }else if(_messages && _messages[msgIdx] && _messages[msgIdx].avatarBase64){
        avatarImg.src=_messages[msgIdx].avatarBase64;
        if(_msgStates[msgIdx]) _msgStates[msgIdx].avatar = _messages[msgIdx].avatarBase64;
      }else{
        avatarImg.src=_defaultAvatar;
        if(_msgStates[msgIdx]) _msgStates[msgIdx].avatar = _defaultAvatar;
      }
    }

    function toggleDropdown(ev, msgIdx){
      if(ev) ev.stopPropagation();
      // 先关闭所有下拉
      closeAllDropdowns();
      var opts=document.getElementById('contactOptions_'+msgIdx);
      var overlay=document.getElementById('overlay');
      if(!opts) return;
      renderContactOptions(msgIdx);
      opts.classList.add('open');
      if(overlay) overlay.classList.add('show');
      _activeDropdown = msgIdx;
    }

    var _activeDropdown = -1;

    function closeAllDropdowns(){
      var overlays=document.getElementById('overlay');
      for(var i=0;i<_msgStates.length;i++){
        var opts=document.getElementById('contactOptions_'+i);
        if(opts) opts.classList.remove('open');
      }
      if(overlays) overlays.classList.remove('show');
      _activeDropdown = -1;
    }

    function closeDropdown(){
      closeAllDropdowns();
    }

    function selectContact(msgIdx, name, avatar){
      var input=document.getElementById('contactInput_'+msgIdx);
      var avatarImg=document.getElementById('contactAvatar_'+msgIdx);
      if(input) input.value=name;
      if(avatarImg) avatarImg.src=avatar || _defaultAvatar;
      if(_msgStates[msgIdx]){
        _msgStates[msgIdx].name = name;
        _msgStates[msgIdx].avatar = avatar || _defaultAvatar;
      }
      closeDropdown();
    }

    function toggleScreenshot(){
      var header=document.getElementById('screenshotHeader');
      var body=document.getElementById('screenshotBody');
      if(!header || !body) return;
      if(body.classList.contains('open')){
        body.classList.remove('open');
        header.classList.remove('open');
      }else{
        body.classList.add('open');
        header.classList.add('open');
      }
    }

    function formatDateTime(isoStr){
      try{
        var d=new Date(isoStr);
        return d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0')+'-'+d.getDate().toString().padStart(2,'0')+' '+d.getHours().toString().padStart(2,'0')+':'+d.getMinutes().toString().padStart(2,'0');
      }catch(e){ return isoStr; }
    }

    function confirmAll(){
      var results = [];
      var contactUpdates = [];

      for(var i=0; i<_msgStates.length; i++){
        var st = _msgStates[i];
        var name = st.name ? st.name.trim() : '';
        if(!name){
          // 滚动到未填写的消息
          var card = document.querySelectorAll('.msg-card')[i];
          if(card) card.scrollIntoView({behavior:'smooth', block:'center'});
          var input = document.getElementById('contactInput_'+i);
          if(input) input.focus();
          return;
        }

        var resultItem = {
          idx: st.idx,
          name: name,
          text: st.text ? st.text.trim() : '',
          avatarBase64: st.avatar || ''
        };
        if(st.dueDate) resultItem.dueDate = st.dueDate;

        var matchedContact = findContactByName(name);
        if(matchedContact){
          if(matchedContact.avatarBase64){
            resultItem.avatarBase64 = matchedContact.avatarBase64;
          }
          if(st.avatar && st.avatar !== matchedContact.avatarBase64 && st.avatar !== _defaultAvatar){
            contactUpdates.push({
              name: name,
              avatarHash: st.avatarHash || '',
              avatarBase64: st.avatar
            });
          }
        }

        results.push(resultItem);
      }

      var result = { results: results, contactUpdates: contactUpdates };

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
    window.__onTextChange = onTextChange;
    window.__onDueDateChange = onDueDateChange;
    window.__toggleDropdown = toggleDropdown;
    window.__closeDropdown = closeDropdown;
    window.__selectContact = selectContact;
    window.__toggleScreenshot = toggleScreenshot;
    window.__confirmAll = confirmAll;
    window.__cancel = cancel;

    // 初始化渲染
    initMsgStates();
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
