const {contextBridge,ipcRenderer}=require('electron');
const config=ipcRenderer.sendSync('desktop:config');
contextBridge.exposeInMainWorld('zashitaDesktop',Object.freeze({
 ...config,
 credentials:{load:()=>ipcRenderer.invoke('credentials:load'),save:value=>ipcRenderer.invoke('credentials:save',value),clear:()=>ipcRenderer.invoke('credentials:clear')},
 window:{command:(command,value)=>ipcRenderer.invoke('window:command',command,value)}
}));
