import test from 'node:test';import assert from 'node:assert/strict';
import {candidate,repairTerm,PCM16Resampler,parseASREvent,appendQuestion,chunksOf,retrieve,qwenSession} from '../src/core.mjs';
test('Seven real Russian timeline cases and contextual abbreviation repair',()=>{
 const cases=[['teacher','что такое трансмиссионный механизм денежно кредитной политики',true],['student','существует.',false],['teacher','какие каналы трансмиссионного механизма денежно кредитной политики есть',true],['student','да.',false],['student','какие каким вопросам.',false],['student','Алло?',false],['teacher','какие каналы тммдкп работают в экономике Китая',true]];
 for(const [role,text,expected]of cases)assert.equal(candidate(text,role),expected,text);
 const text=repairTerm(cases[6][1],cases.slice(0,6).map(c=>({text:c[1]})));assert.match(text,/трансмиссионного механизма денежно-кредитной политики/);assert.equal(repairTerm(cases[6][1],[]),cases[6][1]);
 for(const question of ['расскажите о методологии исследования','влияет ли ставка на инфляцию','какая методика была использована'])assert.equal(candidate(question),true);
});
test('Continuous 44.1/48kHz resampling produces exact 16kHz PCM across arbitrary chunks',()=>{
 for(const rate of [44100,48000]){const input=new Float32Array(rate).fill(.5),whole=new PCM16Resampler(rate).process(input),split=new PCM16Resampler(rate),parts=[];for(let i=0;i<input.length;i+=137)parts.push(split.process(input.slice(i,i+137)));const combined=Buffer.concat(parts);assert.equal(whole.length,32000);assert.deepEqual(combined,Buffer.from(whole));assert.equal(new DataView(whole.buffer).getInt16(0,true),16384);}
});
test('Interim replaces preview; only final enters extraction; duplicate finals are ignored',()=>{
 const seen=new Set();assert.equal(parseASREvent({type:'conversation.item.input_audio_transcription.text',item_id:'a',text:'что ',stash:'такое'},seen).text,'что такое');assert.equal(seen.size,0);assert.equal(parseASREvent({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'что такое методология'},seen).final,true);assert.equal(parseASREvent({type:'conversation.item.input_audio_transcription.completed',item_id:'a',transcript:'duplicate'},seen),null);
});
test('Background questions preserve current answer, including after persistence',()=>{
 const s={questions:[],selectedId:null};appendQuestion(s,{id:'1',text:'Какой метод использован?',ru:'one'});appendQuestion(s,{id:'2',text:'Почему выбран этот метод?',ru:'two'});assert.equal(s.selectedId,'1');assert.equal(appendQuestion(s,{id:'3',text:'какой метод использован'}),false);assert.equal(JSON.parse(JSON.stringify(s)).selectedId,'1');
});
test('Bilingual local retrieval includes actual source passages and no fabricated match',()=>{
 const docs=[{id:'ru',name:'论文.txt',chunks:chunksOf('Трансмиссионный механизм денежно-кредитной политики: процентный канал и кредитный канал.', 'ru')},{id:'zh',name:'中文论文.txt',chunks:chunksOf('货币政策传导渠道主要包括利率渠道和信贷渠道。','zh')}];
 assert.ok(retrieve('процентный канал',docs).some(c=>c.documentId==='ru'));assert.ok(retrieve('货币政策传导 利率渠道',docs).some(c=>c.documentId==='zh'));assert.deepEqual(retrieve('photosynthesis chlorophyll',docs),[]);
 assert.ok(retrieve('каналы трансмиссионного механизма денежной политики',docs).some(c=>c.documentId==='ru'));
});
test('Qwen protocol always uses Russian, 16k PCM and server VAD; limits are bounded',()=>{const s=qwenSession(90000,'денежно-кредитная политика');assert.equal(s.sample_rate,16000);assert.equal(s.input_audio_transcription.language,'ru');assert.equal(s.turn_detection.type,'server_vad');assert.equal(s.turn_detection.silence_duration_ms,3000);});
