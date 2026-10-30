'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Engine=require('./engine');
const PORT=Number(process.env.PORT||3000),ROOT=__dirname;
const STORE=process.env.STATE_FILE||path.join(ROOT,'room-state.json');
const TTL=24*60*60*1000,rooms=new Map();
try{let saved=JSON.parse(fs.readFileSync(STORE,'utf8'));for(const r of saved){if(Date.now()-r.updated<TTL){r.members.forEach(m=>m.ws=null);rooms.set(r.code,r)}}}catch(_){}
function persist(){const tmp=STORE+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify([...rooms.values()].map(r=>({...r,members:r.members.map(m=>({name:m.name,token:m.token}))}))));fs.renameSync(tmp,STORE)}catch(e){console.error('Could not persist rooms:',e.message)}}
const TYPES={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/data.js':'text/javascript; charset=utf-8'};
const server=http.createServer((req,res)=>{let url=new URL(req.url,'http://localhost');if(req.method!=='GET'){res.writeHead(405);return res.end()}
 if(url.pathname==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({ok:true,rooms:rooms.size}))}
 const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!TYPES[url.pathname]){res.writeHead(404);return res.end('Not found')}
 res.writeHead(200,{'Content-Type':TYPES[url.pathname],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; connect-src 'self' ws: wss:; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});fs.createReadStream(path.join(ROOT,file)).pipe(res)
});
function wsFrame(op,data){let payload=Buffer.isBuffer(data)?data:Buffer.from(data||'');let header=payload.length<126?Buffer.from([128|op,payload.length]):payload.length<65536?Buffer.from([128|op,126,payload.length>>8,payload.length&255]):Buffer.concat([Buffer.from([128|op,127]),Buffer.from([0,0,0,0,0,0,0,0])]);if(payload.length>=65536)header.writeBigUInt64BE(BigInt(payload.length),2);return Buffer.concat([header,payload])}
function createPeer(socket){const peer={socket,buffer:Buffer.alloc(0),room:null,seat:-1,closed:false,actions:[],send(obj){if(!this.closed&&this.socket.writable)this.socket.write(wsFrame(1,JSON.stringify(obj)))},close(){if(!this.closed){this.closed=true;try{this.socket.end(wsFrame(8,''))}catch(_){} }}};
 socket.on('data',chunk=>{peer.buffer=Buffer.concat([peer.buffer,chunk]);if(peer.buffer.length>131072)return peer.close();while(peer.buffer.length>=2){const b=peer.buffer,opcode=b[0]&15,mask=!!(b[1]&128);if(!mask)return peer.close();let n=b[1]&127,h=2;if(n===126){if(b.length<4)break;n=b.readUInt16BE(2);h=4}else if(n===127){if(b.length<10)break;const big=b.readBigUInt64BE(2);if(big>65536n)return peer.close();n=Number(big);h=10}if(n>65536)return peer.close();if(b.length<h+4+n)break;const key=b.subarray(h,h+4),pay=Buffer.from(b.subarray(h+4,h+4+n));for(let i=0;i<pay.length;i++)pay[i]^=key[i%4];peer.buffer=b.subarray(h+4+n);if(opcode===8){peer.close();return}if(opcode===9){socket.write(wsFrame(10,pay));continue}if(opcode===10)continue;if(opcode!==1)return peer.close();try{onMessage(peer,JSON.parse(pay.toString('utf8')))}catch(e){peer.send({type:'error',message:'Mensaje mal formado.'})}}});
 socket.on('close',()=>{peer.closed=true;if(peer.room){const m=peer.room.members[peer.seat];if(m?.ws===peer)m.ws=null;sendRoom(peer.room)}});socket.on('error',()=>{});return peer}
function sendRoom(r){r.updated=Date.now();r.members.forEach((m,i)=>{if(!m.ws||m.ws.closed)return;m.ws.send({type:'lobby',code:r.code,seat:i,token:m.token,host:i===0,started:!!r.game,members:r.members.map((x,j)=>({name:x.name,connected:!!(x.ws&&!x.ws.closed),seat:j}))});if(r.game)m.ws.send({type:'state',game:Engine.view(r.game,i)})});persist()}
function deny(peer,msg){peer.send({type:'error',message:msg})}
function onMessage(peer,msg){if(!msg||typeof msg!=='object'||Array.isArray(msg))return deny(peer,'Mensaje incorrecto.');let now=Date.now();peer.actions=peer.actions.filter(t=>now-t<10000);peer.actions.push(now);if(peer.actions.length>45)return deny(peer,'Demasiadas acciones.');
 if(msg.type==='ping'){peer.send({type:'pong'});return}
 if(msg.type==='create'&&!peer.room){let code;do{code=crypto.randomInt(36**6).toString(36).toUpperCase().padStart(6,'0')}while(rooms.has(code));const r={code,updated:Date.now(),game:null,members:[]};rooms.set(code,r);return attach(peer,r,{name:cleanName(msg.name),token:crypto.randomBytes(24).toString('hex')})}
 if(msg.type==='join'&&!peer.room){const code=String(msg.code||'').toUpperCase().trim(),r=rooms.get(code);if(!r)return deny(peer,'Sala no encontrada.');
 if(msg.token){const index=r.members.findIndex(m=>m.token===msg.token);if(index>=0){let prev=r.members[index].ws;if(prev&&prev!==peer)prev.close();peer.room=r;peer.seat=index;r.members[index].ws=peer;return sendRoom(r)}}
 if(r.game)return deny(peer,'La partida ya comenzó. Solo pueden reconectarse quienes estaban dentro.');if(r.members.length>=5)return deny(peer,'La sala está completa.');return attach(peer,r,{name:cleanName(msg.name),token:crypto.randomBytes(24).toString('hex')})}
 if(!peer.room)return deny(peer,'Crea o únete primero a una sala.');const r=peer.room;if(r.members[peer.seat]?.ws!==peer)return deny(peer,'Esta sesión fue reemplazada por otra conexión.');
 if(msg.type==='start'){if(peer.seat!==0)return deny(peer,'Solo el anfitrión puede iniciar.');if(r.game)return deny(peer,'La partida ya comenzó.');if(r.members.length<2)return deny(peer,'Se necesitan al menos dos jugadores.');if(r.members.some(m=>!m.ws||m.ws.closed))return deny(peer,'Todos deben estar conectados para iniciar.');r.game=Engine.newGame(r.members.map(m=>m.name),Number.isInteger(msg.firstSeat)?msg.firstSeat:0);return sendRoom(r)}
 if(msg.type==='action'){if(!r.game)return deny(peer,'La partida aún no empieza.');try{Engine.action(r.game,peer.seat,msg.action);sendRoom(r)}catch(e){deny(peer,e.message)}return}
 deny(peer,'Acción desconocida.');}
function attach(peer,r,m){peer.room=r;peer.seat=r.members.length;m.ws=peer;r.members.push(m);sendRoom(r)}
function cleanName(s){return String(s||'Jugador').replace(/[<>"'&]/g,'').trim().slice(0,24)||'Jugador'}
server.on('upgrade',(req,socket)=>{const key=req.headers['sec-websocket-key'];let url;try{url=new URL(req.url,'http://localhost')}catch{socket.destroy();return}
 if(url.pathname!=='/socket'||!key||req.headers.upgrade?.toLowerCase()!=='websocket'||Buffer.from(key,'base64').length!==16){socket.destroy();return}
 const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');createPeer(socket)});
setInterval(()=>{for(const [key,r] of rooms)if(Date.now()-r.updated>TTL){rooms.delete(key)}},60*60*1000).unref();
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log('Rail Routes Europa (private): http://localhost:'+PORT));
module.exports={server,rooms};
