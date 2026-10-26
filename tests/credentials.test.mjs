import test from 'node:test';import assert from 'node:assert/strict';import {createCredentialStore} from '../src/credentials.mjs';
function memory(){const records=new Map();return {records,read:async(k,f)=>records.has(k)?structuredClone(records.get(k)):f,write:async(k,v)=>records.set(k,structuredClone(v)),remove:async k=>records.delete(k)};}
test('Saved credentials survive a fresh store and contain no plaintext or extractable key',async()=>{
 const storage=memory(),store=createCredentialStore(storage);await store.save({qwen:' sk-isolated-bailian ',deepseek:'Bearer sk-isolated-deepseek'});
 const record=[...storage.records.values()][0];assert.equal(record.key.extractable,false);assert.ok(!JSON.stringify(record).includes('sk-isolated'));
 assert.deepEqual(await createCredentialStore(storage).load(),{qwen:'sk-isolated-bailian',deepseek:'sk-isolated-deepseek'});
 await store.clear();assert.deepEqual(await createCredentialStore(storage).load(),{qwen:'',deepseek:''});
});
test('Invalid input, failed writes and damaged data never falsely report successful persistence',async()=>{
 const storage=memory(),store=createCredentialStore(storage);await store.save({qwen:'sk-original-bailian',deepseek:''});
 await assert.rejects(store.save({qwen:'not a key',deepseek:''}));assert.equal((await store.load()).qwen,'sk-original-bailian');
 const failed=createCredentialStore({...storage,write:async()=>{throw Error('disk full sk-secret');}});await assert.rejects(failed.save({qwen:'sk-changed-bailian',deepseek:''}),error=>!error.message.includes('sk-secret'));
 assert.equal((await store.load()).qwen,'sk-original-bailian');
 const record=[...storage.records.values()][0];new Uint8Array(record.ciphertext)[0]^=1;storage.records.set('cloud-credentials-v1',record);await assert.rejects(store.load(),/无法读取/);
});
