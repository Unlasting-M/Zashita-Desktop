import {_electron as electron} from 'playwright-core';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
const require=createRequire(import.meta.url),root=process.cwd(),out=path.resolve('output/desktop-qa'),profile=path.join(out,'profile-'+Date.now());
await fs.mkdir(out,{recursive:true});
const fixtureText='Трансмиссионный механизм денежно-кредитной политики включает процентный канал и кредитный канал.';
await fs.writeFile(path.join(out,'paper.txt'),fixtureText);
const pdfObjects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
const pdfText='BT /F1 12 Tf 40 740 Td (Monetary policy transmission: interest rate and credit channels.) Tj ET';pdfObjects.push(`<< /Length ${pdfText.length} >>\nstream\n${pdfText}\nendstream`);
let pdf='%PDF-1.4\n',offsets=[0];for(const [i,obj]of pdfObjects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;await fs.writeFile(path.join(out,'paper.pdf'),pdf);
await fs.writeFile(path.join(out,'paper.docx'),zipSync({'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>'+fixtureText+'</w:t></w:r></w:p></w:body></w:document>')}));
const packaged=!!process.env.ZASHITA_QA_EXE||process.argv.includes('--packaged'),executablePath=process.env.ZASHITA_QA_EXE||(packaged?path.resolve('release/win-unpacked/Zashita.exe'):require('electron'));
let app,page;const errors=[],urls=[];
async function launch(){
 app=await electron.launch({executablePath,args:[...(packaged?[]:['.']),'--qa','--qa-user-data='+profile],cwd:root,timeout:30000});
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>urls.push(r.url()));await page.getByRole('heading',{name:'开始现场答辩',exact:true}).or(page.getByRole('heading',{name:'实时答辩',exact:true})).waitFor();
 assert.equal(new URL(page.url()).hostname,'127.0.0.1');assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>window.zashitaDesktop.isDesktop),true);
}
try{
 await launch();
 await page.getByRole('button',{name:'最大化或还原',exact:true}).click();assert.equal(await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];for(let i=0;i<30&&!w.isMaximized();i++)await new Promise(r=>setTimeout(r,50));return w.isMaximized();}),true);
 await page.getByRole('button',{name:'最大化或还原',exact:true}).click();assert.equal(await app.evaluate(async({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];for(let i=0;i<30&&w.isMaximized();i++)await new Promise(r=>setTimeout(r,50));return w.isMaximized();}),false);
 await page.getByRole('button',{name:'窗口置顶',exact:true}).click();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isAlwaysOnTop()),true);await page.getByRole('button',{name:'窗口置顶',exact:true}).click();
 await page.locator('nav [data-nav="settings"]').click();
 await page.locator('#qwen-key').fill('sk-fake-desktop-qwen');await page.locator('#deepseek-key').fill('sk-fake-desktop-deepseek');await page.getByRole('button',{name:'保存密钥',exact:true}).click();await page.getByText('密钥已保存到此设备，下次打开会自动恢复',{exact:true}).waitFor();
 await page.locator('#audio-source').selectOption('system');await page.locator('#terms').fill('ТМ ДКП — трансмиссионный механизм');await page.locator('#terms').blur();
 await page.locator('#audio-source').selectOption('microphone');
 // Persist a disconnected device just as Windows does when a remote mic disappears.
 await page.evaluate(()=>{const el=document.querySelector('#audio-device');el.add(new Option('UU virtual QA','uu-virtual-qa'));el.value='uu-virtual-qa';el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent.includes('已保存'));
 await page.locator('nav [data-nav="library"]').click();await page.locator('nav [data-nav="settings"]').click();assert.equal(await page.locator('#audio-device').inputValue(),'uu-virtual-qa');
 await page.locator('nav [data-nav="library"]').click();await page.locator('#document-input').setInputFiles([path.join(out,'paper.txt'),path.join(out,'paper.docx'),path.join(out,'paper.pdf')]);await page.getByRole('heading',{name:'paper.pdf',exact:true}).waitFor();
 await page.locator('nav [data-nav="live"]').click();await page.locator('details.manual summary').click();
 await page.locator('#manual-question').fill('что такое трансмиссионный механизм денежно кредитной политики');await page.getByRole('button',{name:'结合上下文抓取问题',exact:true}).click();await page.locator('.answer-ru').waitFor();
 const first=await page.locator('.question-panel h2').innerText();
 await page.locator('#manual-question').fill('какие каналы тммдкп работают в экономике Китая');await page.getByRole('button',{name:'结合上下文抓取问题',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('#question-select option').length===2);await page.waitForFunction(()=>!document.querySelector('#connection-status')?.textContent.includes('处理中'));
 assert.equal(await page.locator('.question-panel h2').innerText(),first);await page.getByRole('button',{name:'下一题',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.question-panel h2')?.textContent.includes('Китая'));assert.ok(!(await page.locator('.question-panel h2').innerText()).includes('тммдкп'));
 await page.screenshot({path:path.join(out,packaged?'packaged-live.png':'live.png')});
 await page.setViewportSize({width:1080,height:740});await page.screenshot({path:path.join(out,'compact.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('nav [data-nav="settings"]').click();await page.screenshot({path:path.join(out,'settings.png')});
 assert.equal(await app.evaluate(({safeStorage})=>safeStorage.isEncryptionAvailable()),true);
 const encrypted=await fs.readFile(path.join(profile,'cloud-credentials.json'),'utf8');assert.ok(!encrypted.includes('sk-fake'));
 await app.close();app=null;
 await launch();await page.locator('nav [data-nav="settings"]').click();assert.equal(await page.locator('#qwen-key').inputValue(),'sk-fake-desktop-qwen');assert.equal(await page.locator('#deepseek-key').inputValue(),'sk-fake-desktop-deepseek');assert.equal(await page.locator('#audio-device').inputValue(),'uu-virtual-qa');assert.match(await page.locator('#terms').inputValue(),/ТМ ДКП/);
 await page.locator('nav [data-nav="library"]').click();assert.equal(await page.locator('.document-row').count(),3);
 // QA permission handler must deny real microphone access.
 assert.equal(await page.evaluate(async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());return 'opened';}catch{return 'denied';}}),'denied');
 assert.deepEqual(errors,[]);assert.ok(urls.every(url=>new URL(url).hostname==='127.0.0.1'||url.startsWith('blob:')));
 const result={packaged,passed:true,checks:['isolated local origin','no Node.js in renderer','Windows encrypted key restart','device and terms persistence','PDF, TXT and DOCX import','contextual acronym repair','stable question queue','1080px layout','microphone denied during QA','no external web host'],requests:urls.length};await fs.writeFile(path.join(out,packaged?'packaged-result.json':'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await app?.close();}
