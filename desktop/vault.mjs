import fs from 'node:fs/promises';
import path from 'node:path';
import {safeKey} from '../src/core.mjs';
export function createVault({directory,safeStorage}){
 const target=path.join(directory,'cloud-credentials.json');let writes=Promise.resolve();
 const serialize=fn=>{const next=writes.catch(()=>{}).then(fn);writes=next;return next;};
 const ready=()=>{if(!safeStorage.isEncryptionAvailable())throw Error('Windows 当前无法安全保存密钥，请在正常登录的用户环境中重试。');};
 const clean=value=>({qwen:value.qwen?.trim()?safeKey(value.qwen):'',deepseek:value.deepseek?.trim()?safeKey(value.deepseek):''});
 return{
  load:()=>serialize(async()=>{try{ready();const data=JSON.parse(await fs.readFile(target,'utf8'));if(data.version!==1||typeof data.encrypted!=='string'||data.encrypted.length>24000)throw Error();return clean(JSON.parse(safeStorage.decryptString(Buffer.from(data.encrypted,'base64'))));}catch(e){if(e.code==='ENOENT')return{qwen:'',deepseek:''};throw Error('已保存的密钥无法读取，请重新填写并保存。');}}),
  save:value=>serialize(async()=>{const keys=clean(value);if(!keys.qwen&&!keys.deepseek)throw Error('请至少填写一个 API Key 后再保存。');ready();const encrypted=safeStorage.encryptString(JSON.stringify(keys)).toString('base64');await fs.mkdir(directory,{recursive:true});const tmp=target+'.tmp';await fs.writeFile(tmp,JSON.stringify({version:1,encrypted}),{mode:0o600});await fs.rename(tmp,target);return keys;}),
  clear:()=>serialize(async()=>{await fs.unlink(target).catch(e=>{if(e.code!=='ENOENT')throw e;});})
 };
}
