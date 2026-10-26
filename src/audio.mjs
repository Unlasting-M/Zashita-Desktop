import {PCM16Resampler} from './core.mjs';
export async function acquireAudio(mediaDevices,{source='microphone',deviceId=''}={}){
 if(source==='system'){
  if(!mediaDevices.getDisplayMedia)throw Error('此系统不支持系统音频采集');
  const stream=await mediaDevices.getDisplayMedia({audio:true,video:true});
  // WASAPI loopback supplies audio and a required dummy screen track.
  // Discard video immediately; no screen frames are processed or transmitted.
  stream.getVideoTracks().forEach(track=>{track.stop();stream.removeTrack(track);});
  if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());throw Error('未获得系统音频，请改用麦克风或检查播放设备');}
  return stream;
 }
 if(source!=='microphone')throw Error('音频来源无效');
 return mediaDevices.getUserMedia({audio:{...(deviceId?{deviceId:{exact:deviceId}}:{}),channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
}
export class Microphone{
 constructor(onFrame,onFailure){this.onFrame=onFrame;this.onFailure=onFailure;this.pending=new Uint8Array();}
 async start(options){
  if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('音频接口不可用，请重启 Zashita');
  try{
   const Context=window.AudioContext||window.webkitAudioContext;this.context=new Context();const resumed=this.context.resume();
   this.stream=await acquireAudio(navigator.mediaDevices,options);await resumed;
   this.stream.getAudioTracks().forEach(track=>track.onended=()=>this.onFailure('麦克风已停止，请重新连接。'));
   const resampler=new PCM16Resampler(this.context.sampleRate);this.source=this.context.createMediaStreamSource(this.stream);
   const send=input=>{if(!this.context)return;const bytes=resampler.process(input),joined=new Uint8Array(this.pending.length+bytes.length);joined.set(this.pending);joined.set(bytes,this.pending.length);let offset=0;while(joined.length-offset>=3200){this.onFrame(joined.slice(offset,offset+3200));offset+=3200;}this.pending=joined.slice(offset);};
   if(this.context.audioWorklet){await this.context.audioWorklet.addModule('/pcm-worklet.js');this.node=new AudioWorkletNode(this.context,'defense-pcm',{channelCount:1,channelCountMode:'explicit',channelInterpretation:'speakers'});this.node.port.onmessage=e=>{if(e.data?.flushed)this.flushResolve?.();else send(e.data);};}
   else{this.node=this.context.createScriptProcessor(2048,1,1);this.node.onaudioprocess=e=>send(e.inputBuffer.getChannelData(0));}
   this.silence=this.context.createGain();this.silence.gain.value=0;this.source.connect(this.node);this.node.connect(this.silence);this.silence.connect(this.context.destination);
   this.context.onstatechange=()=>{if(this.context?.state==='interrupted')this.onFailure('系统中断了音频采集，请重新连接。');};
  }catch(error){await this.stop();throw error;}
 }
 async stop(){
  if(this.node?.port&&this.context?.state==='running')await new Promise(resolve=>{this.flushResolve=resolve;this.node.port.postMessage({flush:true});setTimeout(resolve,150);});
  this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;
  this.node?.disconnect();this.source?.disconnect();this.silence?.disconnect();
  if(this.pending.length)this.onFrame(this.pending);this.pending=new Uint8Array();
  const context=this.context;this.context=null;if(context){context.onstatechange=null;await context.close().catch(()=>{});}
 }
}
