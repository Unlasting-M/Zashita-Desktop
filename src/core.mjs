export const APP_VERSION='2.0.0';
const FEATURE=/(?:^|[^\p{L}])(?:что|чем|чего|чему|какой|какая|какое|какие|каких|каким|какими|каков|какова|каковы|как|почему|зачем|отчего|сколько|скольких|чей|чья|чь[её]|чьи|где|куда|откуда|когда|насколько|кто|кого|кому|кем|ли|расскажите|объясните|поясните|уточните|назовите|охарактеризуйте|сравните|обоснуйте|приведите|прокомментируйте|скажите|определите|перечислите|раскройте)(?=$|[^\p{L}])/iu;
export function candidate(text,role='teacher'){
 const n=(text.match(/[\p{L}\p{N}]+/gu)||[]).length;
 if(n<=2||role==='student')return false;
 return /[?？]/.test(text)||FEATURE.test(text)&&(n>=(role==='teacher'?3:5))||role==='teacher'&&n>=6;
}
export function repairTerm(text,context=[]){
 const all=context.map(x=>x.text||'').join(' ');
 const supported=/трансмиссионн[\p{L}]*\s+механизм[\p{L}]*\s+денежно[\s-]+кредитн[\p{L}]*\s+политик[\p{L}]*/iu.test(all);
 return supported?text.replace(/(?<![\p{L}])(?:тммдкп|тмдкп|tmmdkp|tmdkp)(?![\p{L}])/giu,'трансмиссионного механизма денежно-кредитной политики (ТМ ДКП)'):text;
}
export function normalize(text){return text.toLowerCase().replaceAll('ё','е').replace(/[\p{P}\p{S}\s]+/gu,' ').trim();}
export function sameQuestion(a,b){return normalize(a)===normalize(b);}
const STOP=new Set('и в на с к по из у а но да это как что вы мы для или не ли есть of the a an to in 的 了 是 和 与'.split(' '));
export function tokens(text){
 const words=normalize(text).match(/[a-zа-я0-9]{2,}|[\p{Script=Han}]+/gu)||[];
 return words.flatMap(w=>/\p{Script=Han}/u.test(w)?[...w].slice(0,-1).map((c,i)=>c+[...w][i+1]):[w]).filter(w=>!STOP.has(w)).map(w=>/^[а-я]{5,}$/.test(w)?w.replace(/(?:иями|ями|ами|ого|его|ому|ему|ыми|ими|ий|ый|ой|ая|яя|ое|ее|ые|ие|ов|ев|ам|ям|ах|ях|ом|ем|ы|и|а|я|у|ю|е|о)$/,''):w);
}
export function chunksOf(text,documentId,page=1){
 const clean=text.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim(),out=[];
 for(let start=0;start<clean.length;){
  let end=Math.min(clean.length,start+1100);
  if(end<clean.length){const boundary=clean.lastIndexOf(' ',end);if(boundary>start+700)end=boundary;}
  out.push({id:`${documentId}:${page}:${out.length}`,documentId,page,text:clean.slice(start,end)});
  if(end===clean.length)break;start=Math.max(start+1,end-160);
 }
 return out;
}
export function retrieve(query,documents,limit=5){
 const chunks=documents.flatMap(d=>d.chunks.map(c=>({...c,name:d.name}))),terms=[...new Set(tokens(query))];
 if(!chunks.length||!terms.length)return [];
 const freq=new Map(),rows=chunks.map(c=>{const t=tokens(c.text),m=new Map();for(const w of t)m.set(w,(m.get(w)||0)+1);for(const w of terms)if(m.has(w))freq.set(w,(freq.get(w)||0)+1);return {c,m,n:t.length};});
 const avg=rows.reduce((n,r)=>n+r.n,0)/rows.length||1;
 return rows.map(({c,m,n})=>({...c,score:terms.reduce((sum,w)=>{const f=m.get(w)||0;if(!f)return sum;const idf=Math.log(1+(rows.length-(freq.get(w)||0)+.5)/((freq.get(w)||0)+.5));return sum+idf*f*2.2/(f+1.2*(.25+.75*n/avg));},0)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,limit);
}
// Weighted continuous resampling keeps fractional input samples across callbacks.
export class PCM16Resampler{
 constructor(rate){if(rate<16000)throw Error('麦克风采样率低于 16kHz');this.step=rate/16000;this.left=this.step;this.sum=0;}
 process(input){const out=[];for(const raw of input){let weight=1;const sample=Number.isFinite(raw)?Math.max(-1,Math.min(1,raw)):0;while(weight>1e-8){const part=Math.min(weight,this.left);this.sum+=sample*part;this.left-=part;weight-=part;if(this.left<1e-8){const value=this.sum/this.step;out.push(Math.round(value*(value<0?32768:32767)));this.left=this.step;this.sum=0;}}}const bytes=new Uint8Array(out.length*2),view=new DataView(bytes.buffer);out.forEach((v,i)=>view.setInt16(i*2,v,true));return bytes;}
}
export function appendQuestion(session,question){
 if(session.questions.some(q=>sameQuestion(q.text,question.text)))return false;
 session.questions.push(question);if(!session.selectedId)session.selectedId=question.id;return true;
}
export function parseASREvent(event,seen){
 if(event.type==='conversation.item.input_audio_transcription.completed'){
  if(!event.item_id||seen.has(event.item_id))return null;
  seen.add(event.item_id);return {id:event.item_id,text:String(event.transcript||'').trim(),final:true};
 }
 if(event.type==='conversation.item.input_audio_transcription.text'&&!seen.has(event.item_id))return {id:event.item_id,text:String(event.text||'')+String(event.stash||''),final:false};
 return null;
}
export function safeKey(value){const key=String(value||'').trim().replace(/^Bearer\s+/i,'');if(!/^sk-[A-Za-z0-9._-]{5,497}$/.test(key))throw Error('请填写完整 sk- 开头的 API Key');return key;}
export function qwenSession(silence=1100,terms=''){
 const transcription={language:'ru'};if(terms.trim())transcription.corpus={text:terms.slice(0,6000)};
 return {input_audio_format:'pcm',sample_rate:16000,input_audio_transcription:transcription,turn_detection:{type:'server_vad',threshold:.2,silence_duration_ms:Math.max(400,Math.min(3000,Number(silence)||1100))}};
}
