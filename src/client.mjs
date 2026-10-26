import {APP_VERSION,candidate,repairTerm,retrieve,appendQuestion,parseASREvent} from './core.mjs';
import {read,write,remove} from './store.mjs';
import {createCredentialStore} from './credentials.mjs';
import {importDocument} from './files.mjs';
import {Microphone} from './audio.mjs';

const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const desktop=globalThis.zashitaDesktop;
let audioDevices=[];
const defaults={audioSource:'microphone',deviceId:'',region:'cn',silence:1100,mergeDelay:1600,terms:'',instruction:'俄语自然简洁，适合现场口述；中文忠实对照，不虚构论文数据。'};
const credentialStore=createCredentialStore({read,write,remove});
const state={view:'live',pane:'answer',sessions:[],documents:[],settings:{...defaults},currentId:null,keys:{qwen:'',deepseek:''},recording:false,connecting:false,role:'teacher',partial:'',notice:'',error:'',manual:'',saved:true,processing:0,showChinese:true};
let socket,microphone,pending=[],extractTimer,work=Promise.resolve(),finishedResolve,wakeLock,stopInProgress=false,asrReady=false,readerId=null,seen=new Set(),roles=new Map(),connectionGeneration=0;
let saveWork=Promise.resolve(),lastRestoreSession=null;
const current=()=>state.sessions.find(s=>s.id===state.currentId);
const selected=()=>current()?.questions.find(q=>q.id===current().selectedId);
const newID=()=>crypto.randomUUID();
function message(text,error=false){state[error?'error':'notice']=text;render();}
function updateKeyStatus(){
 const label=$('#key-save-state');if(!label)return;
 const saved=state.savedKeys||{qwen:'',deepseek:''};
 const changed=state.keys.qwen!==saved.qwen||state.keys.deepseek!==saved.deepseek;
 label.textContent=state.keyBusy?'正在保存…':changed?'密钥尚未保存或已修改，请点击“保存密钥”':saved.qwen||saved.deepseek?'已保存到此设备，下次打开会自动恢复':'尚未保存密钥';
}
async function saveCredentials(clear=false){
 if(state.keyBusy)return;const draft={...state.keys};state.keyBusy=true;state.error='';state.notice='';render();
 try{
  if(clear){await credentialStore.clear();state.keys={qwen:'',deepseek:''};state.notice='当前页面和此设备已保存的密钥均已清除';}
  else{state.keys=await credentialStore.save(draft);state.notice='密钥已保存到此设备，下次打开会自动恢复';}
  state.savedKeys={...state.keys};
 }catch(error){state.error=error.message;}finally{state.keyBusy=false;render();}
}
function persist(){
 state.saved=false;
 const snapshot=JSON.parse(JSON.stringify({sessions:state.sessions,documents:state.documents,settings:state.settings,currentId:state.currentId}));
 saveWork=saveWork.catch(()=>{}).then(()=>write('app',snapshot)).then(()=>{state.saved=true;updateStatus();}).catch(e=>{state.error=e.message;state.saved=false;updateStatus();});
 return saveWork;
}
function newSession(demo=false){
 const session={id:newID(),title:demo?'界面演练 · 非真实识别':'俄语答辩 '+new Date().toLocaleDateString('zh-CN'),createdAt:new Date().toISOString(),transcripts:[],questions:[],selectedId:null,demo};
 state.sessions.unshift(session);state.currentId=session.id;state.view='live';state.partial='';state.notice='';state.error='';seen.clear();roles.clear();return session;
}
function queueLabel(){const s=current(),q=selected();if(!s||!q)return '等待问题';return `第 ${s.questions.findIndex(x=>x.id===q.id)+1} / ${s.questions.length} 题`;}
const icons={live:'<path d="M8 5v14l11-7z"/>',library:'<path d="M4 4h7v16H4zm9 0h7v16h-7z"/>',history:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>'};
function icon(id){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icons[id]}</svg>`;}
function render(){
 const expanded=['.manual','.evidence','.evidence details'].filter(s=>$(s)?.open);
 const old=$('#answer-scroll'),scroll=old?.scrollTop||0,oldId=readerId;
 const focused=document.activeElement?.id,selection=document.activeElement?.selectionStart;
 const nav=[['live','答辩'],['library','资料库'],['history','历史'],['settings','设置']];
 $('#app').innerHTML=`<header class="brand"><img src="/app-icon.png" width="36" height="36" alt=""><div><strong>Zashita</strong><span>Windows ${APP_VERSION} · ${esc(current()?.demo&&state.view==='live'?'界面演练':'现场答辩')}</span></div><span id="save-state" class="save-state"></span></header><nav aria-label="主导航">${nav.map(([id,label])=>`<button data-nav="${id}" class="${state.view===id?'active':''}" ${state.view===id?'aria-current="page"':''}>${icon(id)}<span>${label}</span></button>`).join('')}</nav><main>${state.error?`<div class="notice error" role="alert"><span>${esc(state.error)}</span><button data-action="dismiss-error" aria-label="关闭错误">关闭</button></div>`:''}${state.notice?`<div class="notice"><span>${esc(state.notice)}</span><button data-action="dismiss-notice" aria-label="关闭提示">关闭</button></div>`:''}${state.view==='live'?renderLive():state.view==='library'?renderLibrary():state.view==='history'?renderHistory():renderSettings()}</main><input id="document-input" type="file" accept=".pdf,.docx,.txt,.md" multiple hidden><input id="backup-input" type="file" accept=".json" hidden>`;
 for(const selector of expanded)if($(selector))$(selector).open=true;
 readerId=selected()?.id;if(oldId===readerId&&$('#answer-scroll'))$('#answer-scroll').scrollTop=scroll;
 if(focused&&document.getElementById(focused)){const input=document.getElementById(focused);input.focus({preventScroll:true});if(typeof selection==='number'&&input.setSelectionRange)try{input.setSelectionRange(selection,selection);}catch{}}
 updateStatus();updateKeyStatus();
}
function renderLive(){
 const s=current(),q=selected(),index=s?.questions.findIndex(t=>t.id===q?.id)??-1;
 return `<div class="page-head"><div><h1>${s?'实时答辩':'开始现场答辩'}</h1><p>${s?esc(s.title):'用麦克风或系统音频接收老师提问，生成中俄双语回答。'}</p></div><div class="session-actions"><span id="connection-status" role="status"></span><button data-action="${state.recording?'stop':'start'}" class="primary" ${state.connecting?'disabled':''}>${state.connecting?'正在连接…':state.recording?'暂停收音':'开始收音'}</button>${s?'<button data-action="end">结束答辩</button>':''}</div></div>${!s?`<section class="setup"><h2>准备你的答辩</h2><p>先配置百炼和 DeepSeek 密钥，再导入论文。没有论文时也可先做通用问答。</p><div class="inline"><button class="primary" data-nav="settings">配置云端服务</button><button data-action="import-documents">导入论文</button><button data-action="demo">查看界面演练</button></div><p class="subtle">可在设置中选择麦克风或系统音频。最小化窗口可继续收音；锁屏、休眠或设备断开可能中断采集。</p></section>`:''}
 <div class="live-controls"><div class="role-picker" role="group" aria-label="当前发言人"><button data-role="teacher" aria-pressed="${state.role==='teacher'}">老师提问</button><button data-role="student" aria-pressed="${state.role==='student'}">我在回答</button></div><span class="subtle">${state.role==='teacher'?'自动抓取老师的新问题':'保留转写，暂不自动抓取问题'}</span><button class="text-button" data-action="new" ${state.recording||state.connecting?'disabled':''}>新建答辩</button></div>
 <div class="workspace ${state.pane==='transcript'?'show-transcript':''}"><section class="reader"><div class="queue"><div><strong>问题队列</strong><span>${queueLabel()}${s?.questions.length>index+1&&index>=0?` · 后续 ${s.questions.length-index-1} 题已排队`:''}</span></div><div class="queue-actions"><button data-action="previous" ${index<=0?'disabled':''}>上一题</button><select id="question-select" aria-label="选择问题" ${!s?.questions.length?'disabled':''}>${s?.questions.length?s.questions.map((v,i)=>`<option value="${esc(v.id)}" ${q?.id===v.id?'selected':''}>${i+1}. ${esc(v.text)}</option>`).join(''):'<option>等待老师提问</option>'}</select><button data-action="next" class="primary" ${!s||index>=s.questions.length-1?'disabled':''}>下一题</button></div></div>
 <div class="pane-switch" role="group" aria-label="工作区"><button data-pane="answer" aria-pressed="${state.pane==='answer'}">问题与答案</button><button data-pane="transcript" aria-pressed="${state.pane==='transcript'}">实时转写 ${s?.transcripts.length||0}</button></div>
 <section class="question-panel"><div class="section-label">当前问题 <span>${q?({queued:'排队中',generating:'生成中',completed:'已回答',failed:'待重试'}[q.status]||'待回答'):'等待识别'}</span></div>${q?`<h2 lang="ru">${esc(q.text)}</h2><p>${esc(q.zh||'暂无中文译文')}</p>${q.uncertainty?`<p class="uncertainty">识别提示：${esc(q.uncertainty)}</p>`:''}`:'<p class="empty">完整问题会在此显示。自动检测不依赖问号。</p>'}</section>
 <section class="answer-panel"><div class="answer-heading"><h2>双语回答</h2><label><input id="show-chinese" type="checkbox" ${state.showChinese?'checked':''}> 中文对照</label></div><div id="answer-scroll" class="answer-scroll">${q?.ru?`<span class="section-label">Ответ на русском</span><div class="answer-ru" lang="ru">${esc(q.ru)}</div>${state.showChinese?`<div class="translation"><span class="section-label">中文对照</span><div>${esc(q.answerZh)}</div></div>`:''}`:`<p class="empty">${q?.status==='generating'?'正在结合论文资料生成回答…':q?.error?esc(q.error):'等待问题。新问题会后台排队，不会覆盖正在阅读的答案。'}</p>`}</div><div class="answer-actions"><button data-action="retry-answer" ${!q||q.status==='generating'?'disabled':''}>${q?.ru?'重新生成':'重试回答'}</button><button data-action="copy-answer" ${!q?.ru?'disabled':''}>复制双语答案</button></div></section>
 ${q?`<details class="evidence"><summary>知识依据 · ${q.citations?.length||0} 段资料</summary>${q.citations?.length?q.citations.map(c=>`<article><strong>${esc(c.name)} · 第${c.page}页</strong><p>${esc(c.text)}</p></article>`).join(''):'<p>未找到匹配资料；回答仅作一般解释，不代表论文结论。</p>'}<details><summary>问题的转写上下文</summary>${(q.context||[]).map(t=>`<p><strong>${t.role==='student'?'答辩人':'老师'}</strong> ${esc(t.text)}</p>`).join('')}</details></details>`:''}
 <details class="manual"><summary>手动提问或补抓</summary><label for="manual-question">俄语问题或待补抓的转写</label><textarea id="manual-question" rows="3" placeholder="粘贴俄语提问，可包含前后文">${esc(state.manual)}</textarea><div class="inline"><button data-action="manual-extract">结合上下文抓取问题</button><button data-action="manual-answer">作为问题直接回答</button></div></details></section>
 <aside class="transcript-panel"><div class="transcript-heading"><h2>实时对话</h2><span>${s?.transcripts.length||0} 段</span></div><div class="transcript-list">${s?.transcripts.length?s.transcripts.slice(-120).map(t=>`<article class="transcript ${t.role}"><div class="section-label">${t.role==='student'?'答辩人':'答辩老师'} · ${new Date(t.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div><p lang="ru">${esc(t.text)}</p><button data-capture="${esc(t.id)}" class="text-button">补抓这段</button></article>`).join(''):'<p class="empty">开始收音后，识别结果会出现在这里。只有最终结果进入问题检测。</p>'}<div class="partial" data-live-text lang="ru">${esc(state.partial)}</div></div></aside></div>`;
}
function renderLibrary(){return `<div class="page-head"><div><h1>论文资料库</h1><p>资料仅保存在当前设备。问答时只发送匹配片段。</p></div><button class="primary" data-action="import-documents">导入资料</button></div><section class="plain-note">支持可选中文字的 PDF、DOCX、UTF-8 TXT 和 Markdown。单份20MB，PDF最多250页。扫描版PDF请先做OCR。</section><div class="document-list">${state.documents.length?state.documents.map(d=>`<article class="document-row"><div><h2>${esc(d.name)}</h2><p>${d.chunks.length} 段检索文字 · ${new Date(d.createdAt).toLocaleDateString('zh-CN')}</p></div><button data-delete-doc="${d.id}">删除</button></article>`).join(''):'<section class="empty-state"><h2>导入你的论文</h2><p>先添加论文或答辩讲稿。还没有资料，也可直接开始通用问答。</p><button data-action="import-documents">选择文件</button></section>'}</div><p class="subtle">本版使用本地关键词检索，结合 DeepSeek 生成的中俄检索词。文档在本机提取文字，不下载本地语音模型。</p>`;}
function renderHistory(){return `<div class="page-head"><div><h1>答辩记录</h1><p>记录保存在这台电脑，可导出备份。</p></div><button data-action="export">导出备份</button></div><div class="history-list">${state.sessions.length?state.sessions.map(s=>`<article class="history-row"><div><h2>${esc(s.title)}</h2><p>${new Date(s.createdAt).toLocaleString('zh-CN')} · ${s.transcripts.length} 段转写 · ${s.questions.length} 题${s.demo?' · 演练数据':''}</p></div><div class="inline"><button data-session="${s.id}">查看</button><button data-delete-session="${s.id}" ${s.id===state.currentId&&state.recording?'disabled':''}>删除</button></div></article>`).join(''):'<section class="empty-state"><h2>还没有答辩记录</h2><p>完成一次答辩后，可在这里重新阅读问题与双语答案。</p><button data-nav="live">开始答辩</button></section>'}</div>`;}
function renderSettings(){const c=state.settings;return `<div class="page-head"><div><h1>设置</h1><p>偏好自动保存；填写密钥后点击保存，下次打开自动恢复。</p></div><button data-action="clear-keys" ${state.keyBusy?'disabled':''}>清除已保存密钥</button></div><section class="settings-section"><h2>云端服务</h2><p class="subtle">内置本地服务直接连接阿里云和 DeepSeek。音频发送到百炼，问题和匹配的论文片段发送到 DeepSeek。</p><label for="qwen-key">百炼 API Key</label><input type="password" id="qwen-key" data-key="qwen" ${state.keyBusy?'disabled':''} value="${esc(state.keys.qwen)}" placeholder="sk-…" autocomplete="off" spellcheck="false"><label for="region">语音服务地域</label><select id="region" data-setting="region"><option value="cn" ${c.region==='cn'?'selected':''}>中国内地（北京）</option><option value="intl" ${c.region==='intl'?'selected':''}>国际（新加坡）</option></select><p class="field-note">Key必须与地域一致，使用支持Qwen实时语音的按量付费Key。</p><label for="deepseek-key">DeepSeek API Key</label><input type="password" id="deepseek-key" data-key="deepseek" ${state.keyBusy?'disabled':''} value="${esc(state.keys.deepseek)}" placeholder="sk-…" autocomplete="off" spellcheck="false"><p class="field-note">本版使用 deepseek-chat。配置后，可手动发送一条问题检查问答服务。</p><div class="inline"><button class="primary" data-action="save-keys" ${state.keyBusy?'disabled':''}>${state.keyBusy?'正在保存…':'保存密钥'}</button><span id="key-save-state" class="subtle" role="status"></span></div><p class="field-note">密钥使用 Windows 系统加密保存到当前用户账户，不随备份导出。共用电脑时可清除已保存密钥。</p></section><section class="settings-section"><h2>音频来源</h2><label for="audio-source">采集来源</label><select id="audio-source" data-setting="audioSource" ${state.recording||state.connecting?'disabled':''}><option value="microphone" ${c.audioSource!=='system'?'selected':''}>麦克风 · 现场答辩</option><option value="system" ${c.audioSource==='system'?'selected':''}>系统音频 · 线上会议</option></select><label for="audio-device">麦克风设备</label><select id="audio-device" data-setting="deviceId" ${state.recording||state.connecting||c.audioSource==='system'?'disabled':''}><option value="">跟随 Windows 默认设备</option>${c.deviceId&&!audioDevices.some(d=>d.deviceId===c.deviceId)?`<option value="${esc(c.deviceId)}" selected>已保存设备（未连接或尚未授权）</option>`:''}${audioDevices.map((d,i)=>`<option value="${esc(d.deviceId)}" ${c.deviceId===d.deviceId?'selected':''}>${esc(d.label||'麦克风 '+(i+1))}</option>`).join('')}</select><div class="inline"><button data-action="refresh-devices">刷新设备</button></div><p class="field-note">设备选择会立即保存。系统音频采集整台电脑正在播放的声音，请在实时答辩中选择当前发言角色；本版不自动区分同一来源中的多人。</p></section><section class="settings-section"><h2>转写与回答</h2>
<label for="silence">语句结束静音（毫秒）</label><input id="silence" type="number" min="400" max="3000" step="100" data-setting="silence" value="${c.silence}"><p class="field-note">默认1100毫秒，减少一句话被自然停顿拆开。结束后再等待短暂续句，并携带上下文提取。</p><label for="terms">论文术语提示</label><textarea id="terms" data-setting="terms" rows="3" maxlength="6000">${esc(c.terms)}</textarea><label for="instruction">回答偏好</label><textarea id="instruction" data-setting="instruction" rows="3" maxlength="1000">${esc(c.instruction)}</textarea></section><section class="settings-section"><h2>资料与备份</h2><p>独立 Windows 程序，内置本地服务。无需打开网页或登录 GPT 账号。旧网页版的 JSON 备份可直接导入。</p><div class="inline"><button data-action="export">导出本机备份</button><button data-action="import-backup">导入备份</button></div><p class="field-note">资料保存在当前 Windows 用户的 ZashitaDesktop 目录，建议定期导出。备份不含 API Key。离线可阅读记录，实时识别与生成需要网络。</p><p class="subtle">Windows 独立版 ${APP_VERSION} · Windows 11 支持桌面磨砂透视，可在标题栏切换。</p></section><footer class="settings-author">by xinyu</footer>`;}
function updateStatus(){const save=$('#save-state');if(save)save.textContent=state.saved?'本机已保存':'正在保存…';const c=$('#connection-status');if(c)c.textContent=state.recording?'正在收音':state.connecting?'连接中':state.processing?`后台处理 ${state.processing}`:'已暂停';}
async function api(operation,data){
 if(!state.keys.deepseek)throw Error('请先在设置中填写 DeepSeek API Key');
 const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Zashita-Session':desktop.sessionToken},body:JSON.stringify({operation,key:state.keys.deepseek,...data})});
 let body;try{body=await response.json();}catch{throw Error('本地服务未响应，请关闭并重新启动 Zashita');}
 if(!response.ok)throw Error(body.error||'问答请求失败');return body;
}
function scheduleExtraction(){clearTimeout(extractTimer);extractTimer=setTimeout(flushExtraction,state.settings.mergeDelay);}
function acceptFinal(text,itemId,role){
 const s=current();if(!s||!text.trim())return;
 const t={id:newID(),itemId,role,text:text.trim(),createdAt:new Date().toISOString()};s.transcripts.push(t);state.partial='';
 if(role==='teacher'){pending.push(t);scheduleExtraction();}persist();render();
}
function flushExtraction(){clearTimeout(extractTimer);if(!pending.length)return;const focus=pending;pending=[];const s=current();if(!s)return;enqueue(()=>extract(s,focus));}
function enqueue(fn){state.processing++;updateStatus();work=work.then(fn).catch(e=>{state.error=e.message;render();}).finally(()=>{state.processing--;updateStatus();});return work;}
async function extract(s,focus,force=false){
 const text=focus.map(t=>t.text).join(' ');if(!force&&!candidate(text,'teacher'))return;
 const first=s.transcripts.findIndex(t=>t.id===focus[0]?.id),context=first>=0?s.transcripts.slice(Math.max(0,first-5),first):s.transcripts.slice(-5);
 const data=await api('extract',{current:repairTerm(text,[...context,...focus]),focus,context,handled:s.questions.map(q=>q.text)});
 const added=[];for(const result of data.questions){const q={...result,id:newID(),status:'queued',ru:'',answerZh:'',citations:[],context:[...context,...focus],error:''};if(appendQuestion(s,q))added.push(q);}
 persist();render();for(const q of added)await answer(s,q);
 if(force&&!added.length)message('未提取到新的完整问题，可编辑后直接作为问题回答。');
}
async function answer(s,q){
 q.status='generating';q.error='';q.citations=retrieve([q.query_ru||q.text,q.query_zh||q.zh].join(' '),state.documents);persist();render();
 try{const data=await api('answer',{question:q.text,context:q.context?.slice(-5)||[],evidence:q.citations,instruction:state.settings.instruction});q.ru=data.ru;q.answerZh=data.zh;if(!q.zh&&data.question_zh)q.zh=data.question_zh;q.status='completed';}
 catch(e){q.error=e.message;q.status='failed';}persist();render();
}
async function start(){
 if(state.recording||state.connecting||stopInProgress)return;
 if(!state.keys.qwen||!state.keys.deepseek){state.view='settings';message('请先填写百炼与 DeepSeek 两个 API Key');return;}
 if(!navigator.onLine){message('当前离线，联网后可开始识别。',true);return;}
 if(!current()||current().demo)newSession();
 state.error='';state.notice='';state.connecting=true;render();const generation=++connectionGeneration;
 try{
  microphone=new Microphone(frame=>{
   if((!state.recording&&!stopInProgress)||!asrReady||!socket||socket.readyState!==1)return;
   if(socket.bufferedAmount>512000){void stop('网络上传积压，已暂停收音，请检查网络后重连。');return;}
   let binary='';for(const b of frame)binary+=String.fromCharCode(b);socket.send(JSON.stringify({type:'input_audio_buffer.append',audio:btoa(binary)}));
  },error=>void stop(error));
  await microphone.start({source:state.settings.audioSource,deviceId:state.settings.deviceId});if(generation!==connectionGeneration){await microphone.stop();return;}
  const connected=await new Promise((resolve,reject)=>{
   const ws=new WebSocket(`ws://${location.host}/api/asr`,['zashita',desktop.sessionToken]);socket=ws;
   const timeout=setTimeout(()=>reject(Error('云端语音连接超时，请检查密钥和网络')),20000);
   ws.onopen=()=>ws.send(JSON.stringify({type:'bridge.start',key:state.keys.qwen,region:state.settings.region,silence:state.settings.silence,terms:state.settings.terms}));
   ws.onmessage=e=>{try{const value=JSON.parse(e.data);if(generation!==connectionGeneration)return;if(value.type==='bridge.error'){reject(Error(value.message));if(state.recording)void stop(value.message);return;}if(value.type==='session.updated'){clearTimeout(timeout);resolve(true);}if(value.type==='session.finished'){finishedResolve?.();return;}if(value.type==='input_audio_buffer.speech_started'&&value.item_id)roles.set(value.item_id,state.role);const transcript=parseASREvent(value,seen);if(transcript){if(!roles.has(transcript.id))roles.set(transcript.id,state.role);if(transcript.final)acceptFinal(transcript.text,transcript.id,roles.get(transcript.id));else{state.partial=transcript.text;const el=$('[data-live-text]');if(el)el.textContent=state.partial;}}}catch{reject(Error('语音服务返回无效数据'));}};
   ws.onerror=()=>reject(Error('实时连接失败，请检查网络后重试'));
   ws.onclose=()=>{clearTimeout(timeout);reject(Error('语音连接已关闭'));finishedResolve?.();if(state.recording)void stop('语音连接中断，已保留文字，请重新连接。');};
  });
  if(!connected||generation!==connectionGeneration)throw Error('连接已取消');
  asrReady=true;state.recording=true;state.connecting=false;await desktop.window.command('recording',true);try{wakeLock=await navigator.wakeLock?.request('screen');}catch{}
  persist();render();
 }catch(error){asrReady=false;state.connecting=false;state.recording=false;try{socket?.close();}catch{}socket=null;await microphone?.stop();microphone=null;message(error.name==='NotAllowedError'?'无法使用音频设备。请检查 Windows 麦克风隐私权限、设备连接及采集来源。':error.message,true);}
}
async function stop(reason=''){
 if(stopInProgress)return;stopInProgress=true;state.recording=false;state.connecting=false;
 try{
  await microphone?.stop();microphone=null;
  if(socket?.readyState===1){const finished=new Promise(resolve=>{finishedResolve=resolve;setTimeout(resolve,8000);});socket.send(JSON.stringify({type:'session.finish'}));await finished;}
  asrReady=false;++connectionGeneration;try{socket?.close();}catch{}socket=null;finishedResolve=null;
  clearTimeout(extractTimer);flushExtraction();await wakeLock?.release().catch(()=>{});wakeLock=null;
  if(reason)state.error=reason;state.partial='';await persist();render();
 }finally{stopInProgress=false;await desktop.window.command('recording',false);}
}
async function exportBackup(){
 await persist();const snapshot={format:'russian-defense-ipad',version:1,exportedAt:new Date().toISOString(),sessions:state.sessions,documents:state.documents,settings:state.settings};
 const blob=new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Zashita-备份-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function demo(){const s=newSession(true);s.transcripts=[{id:newID(),role:'teacher',text:'что такое трансмиссионный механизм денежно кредитной политики',createdAt:new Date().toISOString()},{id:newID(),role:'teacher',text:'какие каналы тммдкп работают в экономике Китая',createdAt:new Date().toISOString()}];for(const [i,t]of s.transcripts.entries())appendQuestion(s,{id:newID(),text:repairTerm(t.text,s.transcripts),zh:i?'中国经济中有哪些货币政策传导机制渠道在发挥作用？':'什么是货币政策传导机制？',status:'completed',ru:i?'В этой демонстрации показан второй ответ. В реальной защите нужно сопоставить общие каналы денежно-кредитной политики с данными и выводами вашей работы.':'Трансмиссионный механизм денежно-кредитной политики описывает, как решения центрального банка влияют на финансовые условия, спрос и цены. Для ответа по вашей работе нужно дополнительно указать, какие каналы вы исследовали и какие данные использовали.',answerZh:i?'这是第二题的界面演练答案。真实答辩需结合论文数据与结论解释具体渠道。':'货币政策传导机制描述中央银行的政策决定如何影响金融条件、需求和价格。结合论文回答时，应补充研究了哪些渠道、使用了什么数据。',citations:[],context:s.transcripts,error:''});state.notice='当前为静态界面演练，未录音、未调用模型；开始收音时会新建真实答辩。';persist();render();}

document.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 try{
  if(button.dataset.nav){state.view=button.dataset.nav;render();return;}
  if(button.dataset.role){state.role=button.dataset.role;render();return;}
  if(button.dataset.pane){state.pane=button.dataset.pane;render();return;}
  if(button.dataset.session){if(state.recording||state.connecting||state.processing){message('请先暂停收音，等待后台处理完成，再切换历史记录。');return;}state.currentId=button.dataset.session;state.view='live';persist();render();return;}
  if(button.dataset.deleteDoc){if(confirm('删除这份资料的本机检索文字？')){state.documents=state.documents.filter(d=>d.id!==button.dataset.deleteDoc);await persist();render();}return;}
  if(button.dataset.deleteSession){if(state.processing){message('后台处理完成后再删除记录。');return;}if(confirm('删除这场答辩的本机记录？')){state.sessions=state.sessions.filter(s=>s.id!==button.dataset.deleteSession);if(!current())state.currentId=null;await persist();render();}return;}
  if(button.dataset.capture){const s=current(),t=s?.transcripts.find(t=>t.id===button.dataset.capture);if(s?.demo){message('演练不调用模型，请先新建真实答辩。');return;}if(t)enqueue(()=>extract(s,[t],true));return;}
  switch(button.dataset.action){
   case 'start':await start();break;case 'stop':await stop();break;
   case 'end':await stop();await work;message('答辩已保存，可在历史记录中重新打开。');break;
   case 'new':if(state.processing){message('后台处理完成后可新建答辩');break;}newSession();persist();render();break;
   case 'previous':case 'next':{const s=current();if(!s)break;const index=s.questions.findIndex(q=>q.id===s.selectedId)+(button.dataset.action==='next'?1:-1);if(s.questions[index])s.selectedId=s.questions[index].id;persist();render();break;}
   case 'dismiss-error':state.error='';render();break;case 'dismiss-notice':state.notice='';render();break;
   case 'import-documents':$('#document-input').click();break;case 'import-backup':$('#backup-input').click();break;
   case 'export':await exportBackup();break;
   case 'persist-storage':{const ok=await navigator.storage?.persist?.();message(ok?'浏览器已授予持续存储权限，仍建议定期导出。':'浏览器未授予持续存储权限，请定期导出备份。');break;}
   case 'clear-keys':await saveCredentials(true);break;
   case 'save-keys':await saveCredentials();break;
    case 'refresh-devices':await refreshDevices();break;
   case 'demo':if(state.recording||state.processing)break;demo();break;
   case 'copy-answer':{const q=selected();if(q)await navigator.clipboard.writeText(`${q.text}\n${q.zh}\n\n${q.ru}\n\n${q.answerZh}`);message('双语答案已复制');break;}
   case 'retry-answer':{const s=current(),q=selected();if(s?.demo){message('演练不调用模型，请先新建真实答辩。');break;}if(q)enqueue(()=>answer(s,q));break;}
   case 'manual-extract':case 'manual-answer':{const text=state.manual.trim();if(!text){message('请先填写俄语问题',true);break;}const s=current()||newSession();if(button.dataset.action==='manual-extract'){const t={id:newID(),role:'teacher',text,createdAt:new Date().toISOString()};s.transcripts.push(t);enqueue(()=>extract(s,[t],true));}else{const q={id:newID(),text:repairTerm(text,s.transcripts.slice(-5)),zh:'',query_ru:text,query_zh:'',status:'queued',context:s.transcripts.slice(-5),citations:[],error:''};if(appendQuestion(s,q))enqueue(()=>answer(s,q));else message('这道问题已在队列中');}persist();render();break;}
  }
 }catch(error){message(error.message,true);}
});
document.addEventListener('input',event=>{const el=event.target;if(el.dataset.key){state.keys[el.dataset.key]=el.value;updateKeyStatus();}if(el.dataset.setting){let value=el.value;if(el.dataset.setting==='silence')value=Math.max(400,Math.min(3000,Number(value)||1100));state.settings[el.dataset.setting]=value;persist();}if(el.id==='manual-question')state.manual=el.value;});
document.addEventListener('change',async event=>{
 const el=event.target;
 if(el.dataset.setting){state.settings[el.dataset.setting]=el.value;await persist();if(el.dataset.setting==='audioSource')render();}
 if(el.id==='question-select'&&current()){current().selectedId=el.value;persist();render();}
 if(el.id==='show-chinese'){state.showChinese=el.checked;render();}
 if(el.id==='document-input'){
  const files=[...el.files];if(!files.length)return;state.error='';message('正在提取文档文字，请保持页面打开。');
  try{for(const file of files){const doc=await importDocument(file);if(state.documents.some(d=>d.id===doc.id))continue;const length=state.documents.reduce((sum,d)=>sum+d.chunks.reduce((n,c)=>n+c.text.length,0),0);if(length+doc.chunks.reduce((n,c)=>n+c.text.length,0)>5_000_000)throw Error('本机检索文字已超过500万字，请先删除不需要的资料');state.documents.push(doc);await persist();}state.view='library';message('资料导入完成，原文件未上传云端。');}catch(error){state.notice='';message(error.message,true);}
 }
 if(el.id==='backup-input')try{
  if(state.recording||state.connecting||state.processing)throw Error('请先结束当前收音并等待处理完成');
  const file=el.files[0];if(!file)return;if(file.size>30*1024*1024)throw Error('备份文件过大');const value=JSON.parse(await file.text());
  if(value.format!=='russian-defense-ipad'||value.version!==1||!Array.isArray(value.sessions)||!Array.isArray(value.documents))throw Error('不是本应用的备份文件');
  if(!value.sessions.every(s=>typeof s.id==='string'&&Array.isArray(s.transcripts)&&Array.isArray(s.questions))||!value.documents.every(d=>typeof d.id==='string'&&typeof d.name==='string'&&Array.isArray(d.chunks)&&d.chunks.every(c=>typeof c.text==='string')))throw Error('备份内容不完整');
  for(const s of value.sessions)if(!state.sessions.some(t=>t.id===s.id))state.sessions.push(s);
  for(const d of value.documents)if(!state.documents.some(t=>t.id===d.id))state.documents.push(d);
  await persist();message('备份已合并；现有资料、设置和密钥保留。');
 }catch(error){message(error.message,true);}
});

window.addEventListener('offline',()=>{if(state.recording||state.connecting)void stop('网络已断开，收音已暂停。已保存的内容仍可阅读。');});
window.addEventListener('pagehide',()=>{if(state.recording||state.connecting)void stop();void persist();});
async function refreshDevices(redraw=true){try{audioDevices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput'&&d.deviceId&&d.deviceId!=='default'&&d.deviceId!=='communications');if(redraw)render();}catch(error){if(redraw)message(error.message,true);}}
navigator.mediaDevices?.addEventListener('devicechange',()=>void refreshDevices(state.view==='settings'));
async function init(){
 try{const data=await read('app',null);if(data){state.sessions=data.sessions||[];state.documents=data.documents||[];state.settings={...defaults,...data.settings};state.currentId=data.currentId;for(const s of state.sessions)for(const q of s.questions)if(['queued','generating'].includes(q.status)){q.status='failed';q.error='上次页面关闭时处理未完成，可点击重试回答';}lastRestoreSession=state.currentId;await persist();}}
 catch(error){state.error=error.message;}
 try{state.keys=await credentialStore.load();state.savedKeys={...state.keys};}catch(error){state.error=error.message;}
 await refreshDevices(false);render();
}
void init();
