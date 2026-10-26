import test from 'node:test';import assert from 'node:assert/strict';import {readPDFPageText} from '../src/pdf-text.mjs';
test('Reads PDF text without ReadableStream async-iterator and always releases reader',async()=>{
 let index=0,released=false,cancelled=false;
 const values=[{items:[{str:'Русская',hasEOL:false},{str:'论文',hasEOL:true}]},{items:[{str:'методология',hasEOL:false},{type:'beginMarkedContent'}]}];
 const stream={getReader:()=>({read:async()=>index<values.length?{value:values[index++],done:false}:{done:true},releaseLock:()=>released=true,cancel:async()=>cancelled=true})};
 assert.equal(stream[Symbol.asyncIterator],undefined);
 const text=await readPDFPageText({streamTextContent:()=>stream,getTextContent:()=>{throw Error('Legacy API must not be used');}});
 assert.equal(text,'Русская 论文\nметодология ');assert.equal(released,true);assert.equal(cancelled,false);
});
test('Cancels and releases PDF reader on parse failure',async()=>{
 let released=false,cancelled=false;
 await assert.rejects(readPDFPageText({streamTextContent:()=>({getReader:()=>({read:async()=>{throw Error('damaged PDF');},cancel:async()=>cancelled=true,releaseLock:()=>released=true})})}),/damaged PDF/);
 assert.equal(released,true);assert.equal(cancelled,true);
});
