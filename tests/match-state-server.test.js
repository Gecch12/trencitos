"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const E=require("../backend/engine"),{createMatchArchive,frameHash}=require("../backend/match-archive");
const {loadState,saveCheckpoint}=require("../backend/room-store"),{fakeSupabase}=require("./helpers/fake-supabase");
const random=max=>max-1;
function fixture(){
  const now=Date.now(),g=E.newGame(["A","B"],0,now,null,{random});
  for(const seat of [0,1])E.action(g,seat,{type:"choose_initial",indexes:[0,1]},{now,random});
  const route=g.routes.find(r=>r.tunnel&&r.color==="gray"&&r.n===2);
  const pool=[...g.deck,...g.discard,...g.face,...g.players.flatMap(p=>p.hand)];
  const take=colors=>colors.map(color=>{const i=pool.indexOf(color);assert.notEqual(i,-1);return pool.splice(i,1)[0];});
  g.players[0].hand=take(["red","red","red"]);g.players[1].hand=[];
  g.face=take(["blue","green","yellow","black","white"]);g.discard=[];
  const revealed=take(["blue","green","black"]);g.deck=[...pool,...revealed];
  E.action(g,0,{type:"claim",routeId:route.id,color:"red"},{now,random});
  for(const key of ["schemaVersion","mapRef","rulesRef"])delete g[key];
  const room={code:"12345678",updated:now,savedAt:now,revision:7,hostSeat:0,visibility:"private",archiveFull:true,game:g,
    members:g.players.map((p,i)=>({name:p.name,color:p.color,guestId:`guest-${i}`}))};
  const archive=createMatchArchive();archive.capture(room);archive.commit(archive.prepare());
  const saved=JSON.parse(JSON.stringify(room));delete saved._archiveState;
  return {room:saved,archive:JSON.parse(JSON.stringify(archive.state)),routeId:route.id};
}
async function withStore(kind,source,run){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"match-state-load-")),file=path.join(dir,"state.json");
  const env={...process.env},fetch=global.fetch,api=fakeSupabase();let app;
  Object.assign(process.env,{STATE_BACKEND:kind==="supabase"?"supabase":"file",STATE_FILE:file,AUTH_ENABLED:"false",NODE_ENV:"test"});delete process.env.RENDER;
  if(kind==="supabase"){
    api.state.rooms=structuredClone(source.rooms);api.state.matches=structuredClone(source.archive.matches);
    Object.assign(process.env,{SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_SECRET_KEY:"sb_secret_test_only"});
    global.fetch=(url,options)=>String(url).startsWith(process.env.SUPABASE_URL)?api.fetch(url,options):fetch(url,options);
  }else if(kind==="manifest")saveCheckpoint(file,source);
  else fs.writeFileSync(file,JSON.stringify(kind==="array"?source.rooms:source));
  const original=kind==="supabase"?null:fs.readFileSync(file,"utf8");
  const start=async()=>{delete require.cache[require.resolve("../backend/server")];app=require("../backend/server");await app.ready;return app;};
  try{await run({start,file,api,original});}
  finally{if(app)await app.shutdown();global.fetch=fetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);fs.rmSync(dir,{recursive:true,force:true});}
}

for(const kind of ["array","inline","manifest","supabase"])test(`${kind} restores and commits versioned live state while preserving the old replay prefix`,async()=>{
  const f=fixture(),source={rooms:[f.room],archive:f.archive},oldFrames=JSON.stringify(f.archive.matches[f.room.matchId].frames);
  await withStore(kind,source,async({start,file,api,original})=>{
    const app=await start(),room=app.rooms.get(f.room.code),g=room.game;
    assert.equal(g.schemaVersion,1);assert.deepEqual(g.mapRef,{id:"europe",version:"1"});assert.deepEqual(g.rulesRef,{id:"europe-classic",version:"1"});
    assert.equal(g.pending.routeId,f.routeId);assert.equal(g.pending.stage,"reveal");assert.equal(room.revision,7);
    assert.deepEqual(g.players,f.room.game.players);assert.deepEqual(g.routes,f.room.game.routes);
    assert.ok(Math.abs((g.pending.until-room.emptySince)-(f.room.game.pending.until-f.room.savedAt))<50);
    const saved=kind==="supabase"?{rooms:api.state.rooms,archive:{matches:api.state.matches}}:loadState(file);
    assert.equal(saved.rooms[0].game.schemaVersion,1);assert.deepEqual(saved.rooms[0].game.mapRef,g.mapRef);
    if(kind!=="array"){
      const frames=saved.archive.matches[room.matchId].frames;
      assert.equal(JSON.stringify(frames.slice(0,1)),oldFrames);assert.equal(frames[1].previousHash,frames[0].hash);
      assert.equal(frames[1].snapshot.game.schemaVersion,1);
      for(const {hash,...body} of frames)assert.equal(frameHash(body),hash);
    }
    if(kind!=="supabase")assert.equal(fs.readFileSync(file+".bak","utf8"),original);
    const rebuilt=E.restoreState(JSON.parse(JSON.stringify(g)));E.expire(rebuilt,rebuilt.pending.until,random);
    assert.equal(E.routeById(rebuilt,f.routeId).owner,0);assert.equal(rebuilt.pending.stage,"result");
  });
});

for(const kind of ["inline","supabase"])test(`${kind} rejects an incompatible match before installing or committing any room`,async()=>{
  for(const change of [g=>{g.schemaVersion=99;},g=>{g.schemaVersion=1;},g=>{g.routes[0].id="SA001";},
    g=>{g.mapRef={id:"europe",version:"missing"};g.rulesRef={id:"europe-classic",version:"1"};}]){
    const f=fixture(),bad=structuredClone(f.room);bad.code="12345679";change(bad.game);
    const source={rooms:[f.room,bad],archive:f.archive};
    await withStore(kind,source,async({start,file,api,original})=>{
      await assert.rejects(start);
      if(kind==="supabase"){
        assert.equal(api.state.version,0);assert.deepEqual(api.state.rooms,source.rooms);assert.deepEqual(api.state.matches,source.archive.matches);
        assert.deepEqual(api.calls.map(c=>c.method),["ferrovia_claim_checkpoint"]);
      }else{assert.equal(fs.readFileSync(file,"utf8"),original);assert.equal(fs.existsSync(file+".bak"),false);assert.equal(fs.existsSync(file+".archive"),false);}
    });
  }
});
