// Disposable localhost fixtures. No production account or database is used.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const Engine=require('../../backend/engine'),{createMatchArchive}=require('../../backend/match-archive'),{saveRooms,hashToken}=require('../../backend/room-store');
const {chooseBotAction}=require('./bots-baseline');
const token=crypto.randomBytes(32).toString('hex'),guest=hashToken(token),archive=createMatchArchive();
for(const [index,visibility] of ['public','private','public'].entries()){
 const r={code:String(91234000+index),visibility,archiveFull:true,members:[{name:'Invitado QA',guestId:guest,color:'#d45748',ws:{}},{name:'Bot QA',bot:true,color:'#4c8dcc'}],game:Engine.newGame(['Invitado QA','Bot QA'])};
 archive.capture(r);Engine.observe(r.game,event=>{r.archiveAction=event;archive.capture(r);});
 let steps=0;
 while(r.game.phase!=='finished'&&steps++<(index===2?12:1500)){
  const offer=r.game.players.findIndex(p=>p.offer),seat=r.game.phase==='initial'?r.game.players.findIndex(p=>p.pending.length):offer>=0?offer:r.game.current;
  const action=chooseBotAction(r.game,seat,crypto.randomInt);
  if(action)Engine.action(r.game,seat,action);else Engine.next(r.game);
  archive.capture(r);
 }
 archive.capture(r,r.game.phase==='finished'?null:'Partida abandonada: nadie se reconectó durante 60 segundos.');archive.commit(archive.prepare());
 console.log(JSON.stringify({id:r.matchId,status:r.game.phase,steps:r.archiveSeq+1,visibility}));
}
const file=path.join(os.tmpdir(),'trencitos-history-ui-fixture.json');saveRooms(file,new Map(),archive.state);
Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false'});
const app=require('../../backend/server'),handler=app.server.listeners('request')[0];app.server.removeListener('request',handler);
app.server.on('request',(req,res)=>{
 if(req.url==='/__qa/setup'){res.writeHead(303,{'Set-Cookie':`trencitos_guest=${token}; Path=/; HttpOnly; SameSite=Lax`,Location:'/profile?tab=history'});res.end();}
 else handler(req,res);
});
app.ready.then(()=>app.server.listen(3143,'127.0.0.1',()=>console.log('History QA: http://127.0.0.1:3143/__qa/setup')));
process.on('SIGTERM',()=>app.shutdown());process.on('SIGINT',()=>app.shutdown());
