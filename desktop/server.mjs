import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {timingSafeEqual,randomBytes} from 'node:crypto';
import WebSocket,{WebSocketServer} from 'ws';
import {chat,startQwenBridge} from '../src/backend.mjs';

export const DESKTOP_PORT=18789;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};
const equal=(a,b)=>{if(typeof a!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export async function startLocalServer({publicDir,port=DESKTOP_PORT,token=randomBytes(32).toString('base64url'),mock=false,fetcher=fetch,qwenConnector}={}){
 let origin;const active=new Set(),mockRequests=[];
 const headers=()=>({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'microphone=(self), camera=()','Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws://${new URL(origin).host}; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`});
 const json=(res,status,value)=>{res.writeHead(status,{...headers(),'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 const validHost=req=>req.headers.host===new URL(origin).host;
 const validAPI=req=>req.headers.origin===origin&&equal(req.headers['x-zashita-session'],token);
 const server=http.createServer(async(req,res)=>{
  try{
   if(!validHost(req)){json(res,403,{error:'Host denied'});return;}
   const url=new URL(req.url,origin);if(url.origin!==origin){json(res,403,{error:'Origin denied'});return;}
   if(url.pathname.startsWith('/api/')){
    if(!validAPI(req)){json(res,403,{error:'This endpoint is reserved for the desktop app'});return;}
    if(url.pathname==='/api/chat'&&req.method==='POST'){
     if(!req.headers['content-type']?.includes('application/json')){json(res,415,{error:'JSON required'});return;}
     const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>50000){json(res,413,{error:'问题与上下文过长'});return;}chunks.push(chunk);}
     let body;try{body=JSON.parse(Buffer.concat(chunks));}catch{json(res,400,{error:'请求格式无效'});return;}
     const response=await chat(body,mock?async(_url,opts)=>{
      const input=JSON.parse(JSON.parse(opts.body).messages[1].content);mockRequests.push({operation:body.operation,input});
      const value=body.operation==='extract'?{questions:[{text:input.current,zh:'测试问题的中文译文',query_ru:input.current,query_zh:'货币政策',uncertainty:''}]}:{question_zh:'测试问题的中文译文',ru:'Это демонстрационный ответ. Решения центрального банка влияют на кредит, спрос и инфляцию.',zh:'这是本地验收模拟答案：央行决策影响信贷、需求与通胀。'};
      return Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
     }:fetcher);
     res.writeHead(response.status,{...headers(),...Object.fromEntries(response.headers)});res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    json(res,404,{error:'Not found'});return;
   }
   if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return;}
   let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';
   const root=path.resolve(publicDir),file=path.resolve(root,'.'+name);
   if(!file.startsWith(root+path.sep)||!types[path.extname(file)]){json(res,404,{error:'Not found'});return;}
   const bytes=await fs.readFile(file);res.writeHead(200,{...headers(),'Content-Type':types[path.extname(file)],'Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(error){if(!res.headersSent)json(res,error.code==='ENOENT'?404:400,{error:'本地服务未完成请求，请重试。'});else res.end();}
 });
 server.requestTimeout=60000;server.headersTimeout=15000;server.maxConnections=40;
 const wss=new WebSocketServer({noServer:true,maxPayload:40000,perMessageDeflate:false,handleProtocols:protocols=>protocols.has('zashita')?'zashita':false});
 server.on('upgrade',(req,socket,head)=>{
  const protocols=String(req.headers['sec-websocket-protocol']||'').split(',').map(s=>s.trim());
  if(!validHost(req)||req.headers.origin!==origin||req.url!=='/api/asr'||!protocols.includes('zashita')||!protocols.some(p=>equal(p,token))){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,client=>{
   active.add(client);client.once('close',()=>active.delete(client));
   startQwenBridge(client,async(url,opts)=>{
    if(mock)throw Error('Audio capture is disabled in QA mode');
    if(qwenConnector)return qwenConnector(url,opts);
    const upstream=new WebSocket(url.replace(/^https:/,'wss:'),{headers:opts.headers,handshakeTimeout:15000,perMessageDeflate:false,maxPayload:1024*1024});
    await new Promise((resolve,reject)=>{upstream.once('open',resolve);upstream.once('error',reject);});upstream.accept=()=>{};return{status:101,webSocket:upstream};
   });
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin='http://127.0.0.1:'+server.address().port;
 return{origin,token,mockRequests,close:async()=>{for(const client of active)client.terminate();wss.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
