import {chunksOf} from './core.mjs';
import {readPDFPageText} from './pdf-text.mjs';
export async function importDocument(file){
 if(file.size>20*1024*1024)throw Error('单份资料最大20MB，请分章导入');
 const bytes=await file.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes),id=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const chunks=[];let total=0;
 const add=(text,page=1)=>{total+=text.length;if(total>1_000_000)throw Error('文档文字过多，请分章导入');chunks.push(...chunksOf(text,id,page));};
 const ext=file.name.split('.').pop().toLowerCase();
 if(ext==='pdf'){
  const pdfjs=await import('/vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';
  const loading=pdfjs.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,disableFontFace:true,useSystemFonts:true});
  let encrypted=false;loading.onPassword=()=>{encrypted=true;void loading.destroy();};
  try{const document=await loading.promise;if(document.numPages>250)throw Error('PDF超过250页，请分章导入');for(let n=1;n<=document.numPages;n++){const page=await document.getPage(n);add(await readPDFPageText(page),n);page.cleanup();}}catch(error){if(encrypted)throw Error('此PDF已加密，请导入解除密码后的版本');throw error;}finally{await loading.destroy().catch(()=>{});}
 }else if(ext==='docx'){
  const {unzipSync,strFromU8}=await import('fflate');
  let tooLarge=false;
  const files=unzipSync(new Uint8Array(bytes),{filter:item=>{if(item.name==='word/document.xml'&&item.originalSize>10_000_000)tooLarge=true;return item.name==='word/document.xml'&&item.originalSize<=10_000_000;}});
  if(tooLarge)throw Error('DOCX文字过多，请分章导入');
  if(!files['word/document.xml'])throw Error('DOCX文档格式无效');
  const xml=new DOMParser().parseFromString(strFromU8(files['word/document.xml']),'application/xml');
  if(xml.getElementsByTagName('parsererror').length)throw Error('DOCX文字解析失败');
  add([...xml.getElementsByTagNameNS('*','p')].map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join('')).join('\n'));
 }else if(['txt','md'].includes(ext)){add(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 else throw Error('请导入 PDF、DOCX、UTF-8 TXT 或 Markdown');
 if(chunks.reduce((n,c)=>n+c.text.trim().length,0)<20)throw Error('没有提取到足够文字；扫描版PDF需要先做OCR，当前版本不含OCR');
 return {id,name:file.name,createdAt:new Date().toISOString(),chunks};
}
