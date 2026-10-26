// Safari 17/older iPadOS streams expose getReader(), but no async iterator.
// Bypass PDF.js getTextContent()'s `for await (value of readableStream)`.
export async function readPDFPageText(page){
 const reader=page.streamTextContent().getReader();let text='',completed=false;
 try{
  while(true){
   const {value,done}=await reader.read();if(done){completed=true;return text;}
   for(const item of value?.items||[]){if(typeof item.str!=='string')continue;text+=item.str+(item.hasEOL?'\n':' ');if(text.length>1_000_000)throw Error('单页PDF文字过多，请分章导入');}
  }
 }finally{
  if(!completed)try{await reader.cancel();}catch{}
  reader.releaseLock();
 }
}
