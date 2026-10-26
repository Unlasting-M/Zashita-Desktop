const {app,BrowserWindow,ipcMain,dialog,safeStorage,desktopCapturer,powerSaveBlocker}=require('electron');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises');
let win,local,vault,prefs={},wake=null,quitting=false;
const qa=process.argv.includes('--qa');
const qaData=process.argv.find(a=>a.startsWith('--qa-user-data='))?.split('=').slice(1).join('=');
app.setName('Zashita');app.setPath('userData',qa&&qaData?path.resolve(qaData):path.join(app.getPath('appData'),'ZashitaDesktop'));
const isWindows=process.platform==='win32',glassSupported=isWindows&&Number(os.release().split('.')[2])>=22621;
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 const trusted=event=>win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame&&event.senderFrame.url.startsWith(local.origin+'/');
 const info=()=>({isDesktop:true,version:app.getVersion(),platform:process.platform,origin:local.origin,sessionToken:local.token,systemAudioSupported:isWindows,glassSupported,glass:!!prefs.glass,alwaysOnTop:!!prefs.alwaysOnTop,qa});
 const writePrefs=()=>fs.writeFile(path.join(app.getPath('userData'),'desktop.json'),JSON.stringify(prefs)).catch(()=>{});
 app.whenReady().then(async()=>{
  const {startLocalServer}=await import('./server.mjs');const {createVault}=await import('./vault.mjs');
  await fs.mkdir(app.getPath('userData'),{recursive:true});try{prefs=JSON.parse(await fs.readFile(path.join(app.getPath('userData'),'desktop.json'),'utf8'));}catch{}
  prefs.glass=glassSupported&&prefs.glass!==false;prefs.alwaysOnTop=prefs.alwaysOnTop===true;
  vault=createVault({directory:app.getPath('userData'),safeStorage});
  local=await startLocalServer({publicDir:path.join(app.getAppPath(),'public'),mock:qa});
  // Native acrylic preserves resizing/maximize; layered transparent windows do not.
  win=new BrowserWindow({width:1400,height:900,minWidth:980,minHeight:680,title:'Zashita',icon:path.join(app.getAppPath(),'assets/app-icon.ico'),frame:false,transparent:false,backgroundColor:prefs.glass?'#00000000':'#f3f4f5',...(glassSupported?{backgroundMaterial:prefs.glass?'acrylic':'none'}:{}),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:false,spellcheck:false,partition:'persist:zashita-desktop'}});
  const ses=win.webContents.session;
  ses.setPermissionRequestHandler((wc,permission,callback,details)=>callback(!qa&&wc===win.webContents&&details.requestingUrl?.startsWith(local.origin+'/')&&['media','display-capture','screen-wake-lock','persistent-storage'].includes(permission)&&(permission!=='media'||!details.mediaTypes||!details.mediaTypes.includes('video'))));
  ses.setPermissionCheckHandler((wc,permission,origin,details)=>!qa&&wc===win.webContents&&origin===local.origin&&['media','display-capture','screen-wake-lock','persistent-storage'].includes(permission)&&(permission!=='media'||details.mediaType!=='video'));
  ses.setDisplayMediaRequestHandler(async(request,callback)=>{
   if(qa||!isWindows||request.securityOrigin!==local.origin||request.frame!==win.webContents.mainFrame||!request.userGesture||!request.audioRequested){callback(null);return;}
   try{const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});callback(sources.length?{video:sources[0],audio:'loopback'}:null);}catch{callback(null);}
  });
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(local.origin+'/'))event.preventDefault();});
  win.webContents.on('will-attach-webview',event=>event.preventDefault());
  ipcMain.on('desktop:config',event=>{event.returnValue=trusted(event)?info():null;});
  for(const action of ['load','save','clear'])ipcMain.handle('credentials:'+action,async(event,value)=>{if(!trusted(event))throw Error('Invalid sender');return vault[action](value);});
  ipcMain.handle('window:command',async(event,command,value)=>{
   if(!trusted(event))throw Error('Invalid sender');
   if(command==='minimize')win.minimize();else if(command==='maximize')win.isMaximized()?win.unmaximize():win.maximize();else if(command==='close')win.close();
   else if(command==='top'){prefs.alwaysOnTop=value===true;win.setAlwaysOnTop(prefs.alwaysOnTop);await writePrefs();}
   else if(command==='glass'){prefs.glass=glassSupported&&value===true;if(glassSupported)win.setBackgroundMaterial(prefs.glass?'acrylic':'none');win.setBackgroundColor(prefs.glass?'#00000000':'#f3f4f5');await writePrefs();}
   else if(command==='recording'){if(value===true&&!wake)wake=powerSaveBlocker.start('prevent-app-suspension');else if(value!==true&&wake){powerSaveBlocker.stop(wake);wake=null;}}
   else throw Error('Unknown command');return info();
  });
  win.setAlwaysOnTop(prefs.alwaysOnTop);
  win.once('ready-to-show',()=>win.show());
  win.on('closed',()=>{win=null;});
  await win.loadURL(local.origin+'/');
 }).catch(error=>{dialog.showErrorBox('Zashita 无法启动',error.code==='EADDRINUSE'?'本地端口 18789 已被占用。请退出其他 Zashita 实例或占用此端口的程序后重试。':'程序资源无法加载，请重新安装后重试。');app.quit();});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',event=>{if(quitting||!local)return;event.preventDefault();quitting=true;if(wake){powerSaveBlocker.stop(wake);wake=null;}local.close().finally(()=>app.quit());});
}
