import {safeKey} from './core.mjs';
const RECORD='cloud-credentials-v1';
export function createCredentialStore(storage,cryptoProvider=globalThis.crypto){
 if(globalThis.zashitaDesktop?.credentials)return globalThis.zashitaDesktop.credentials;
 return {
  async load(){
   const record=await storage.read(RECORD,null);if(!record)return {qwen:'',deepseek:''};
   try{
    if(record.version!==1||!record.key||!record.iv||!record.ciphertext)throw Error('Invalid record');
    const plain=await cryptoProvider.subtle.decrypt({name:'AES-GCM',iv:record.iv},record.key,record.ciphertext);
    const keys=JSON.parse(new TextDecoder().decode(plain));
    return {qwen:keys.qwen?safeKey(keys.qwen):'',deepseek:keys.deepseek?safeKey(keys.deepseek):''};
   }catch{throw Error('本机已存密钥无法读取，请重新输入并保存，或清除已保存密钥');}
  },
  async save(values){
   const keys={qwen:values.qwen?.trim()?safeKey(values.qwen):'',deepseek:values.deepseek?.trim()?safeKey(values.deepseek):''};
   if(!keys.qwen&&!keys.deepseek)throw Error('请至少填写一个 API Key；删除密钥请使用“清除已保存密钥”');
   if(!cryptoProvider?.subtle)throw Error('当前浏览器无法保存密钥，请用Safari打开HTTPS正式网址');
   try{
    const key=await cryptoProvider.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    const iv=cryptoProvider.getRandomValues(new Uint8Array(12));
    const ciphertext=await cryptoProvider.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(keys)));
    // One transaction saves the matching key and ciphertext together.
    await storage.write(RECORD,{version:1,key,iv,ciphertext});return keys;
   }catch{throw Error('密钥未保存成功，请检查浏览器存储权限或空间后重试');}
  },
  async clear(){await storage.remove(RECORD);}
 };
}
