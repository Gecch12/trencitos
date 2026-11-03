"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {once}=require("node:events"),{connect}=require("./helpers/ws-client"),{fakeSupabase}=require("./helpers/fake-supabase");
const E=require("../backend/engine"),{loadState}=require("../backend/room-store"),Replay=require("../shared/replay-state");
const {verifyAudit}=require("../scripts/verify-match-audit"),{cookie}=require("./helpers/map-recording");
const europe={id:"europe",version:"1"},laboratory={id:"laboratory",version:"1"};
async function runtime(kind,run){
  const env={...process.env},originalFetch=global.fetch,api=fakeSupabase(),peers=[];
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"maps-select-")),file=path.join(dir,"state.json");let app,port;
  Object.assign(process.env,{STATE_BACKEND:kind,STATE_FILE:file,AUTH_ENABLED:"false",NODE_ENV:"test"});delete process.env.RENDER;
  if(kind==="supabase"){
    Object.assign(process.env,{SUPABASE_URL:"https://fixture.supabase.co",SUPABASE_SECRET_KEY:"sb_secret_test_only"});
    global.fetch=(url,options)=>String(url).startsWith(process.env.SUPABASE_URL)?api.fetch(url,options):originalFetch(url,options);
  }
  const boot=async()=>{delete require.cache[require.resolve("../backend/server")];app=require("../backend/server");await app.ready;app.server.listen(0,"127.0.0.1");await once(app.server,"listening");port=app.server.address().port;};
  const stop=async()=>{peers.splice(0).forEach(p=>p.close());await app.shutdown();};
  try{await boot();await run({get app(){return app;},api,file,
    client:async()=>{const c=await connect(port,{cookie});peers.push(c);const next=c.next;c.next=async(...args)=>{const call=new Error(`Waiting for ${args[0]} ${args[1]||""}`);try{return await next(...args);}catch(error){call.cause=error;throw call;}};return c;},
    restart:async()=>{await stop();await boot();},
    saved:()=>kind==="file"?loadState(file).rooms:api.state.rooms,
    http:async route=>(await fetch(`http://127.0.0.1:${port}${route}`,{headers:{cookie}})).json(),
  });}finally{await stop();global.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);fs.rmSync(dir,{recursive:true,force:true});}
}
const settings=mapRef=>({type:"room_settings",visibility:"public",maxPlayers:5,mapRef});
for(const kind of ["file","supabase"])test(`${kind} map selection survives lobby and match restart, bots, replay and rematch in simultaneous rooms`,async()=>{
  await runtime(kind,async s=>{
    const invalid=await s.client();
    for(const mapRef of [null,{id:"laboratory"},{...laboratory,version:"2"},{...laboratory,extra:true}]){
      invalid.send({type:"create",mapRef});assert.equal((await invalid.next("error")).code,"INVALID_ROOM_MAP");assert.equal(s.app.rooms.size,0);
    }
    const sessions=[];
    for(const [i,mapRef] of [europe,laboratory].entries()){
      const c=await s.client();c.send({type:"create",name:`Host ${i}`,visibility:"public"});const lobby=await c.next("lobby");
      assert.deepEqual(lobby.mapRef,europe);
      c.send(settings(mapRef));await c.next("lobby",m=>m.mapRef.id===mapRef.id);
      const guest=await s.client();guest.send({type:"join",code:lobby.code,name:"Guest"});await guest.next("lobby");await c.next("lobby",m=>m.members.length===2);
      guest.send(settings(europe));assert.equal((await guest.next("error")).code,"HOST_ONLY");
      c.send(settings({...mapRef,version:"bad"}));assert.equal((await c.next("error")).code,"INVALID_ROOM_MAP");
      assert.deepEqual(s.app.rooms.get(lobby.code).mapRef,mapRef);
      guest.send({type:"leave"});await c.next("lobby",m=>m.members.length===1);
      c.send({type:"add_bot"});await c.next("lobby",m=>m.members.length===2&&m.members[1].bot);
      sessions.push({c,lobby,mapRef});
    }
    assert.deepEqual(s.saved().map(r=>r.mapRef),[europe,laboratory]);
    await s.restart();
    for(const session of sessions){
      session.c=await s.client();session.c.send({type:"join",code:session.lobby.code,token:session.lobby.token});
      assert.deepEqual((await session.c.next("lobby")).mapRef,session.mapRef);
      session.c.send({type:"start"});const state=await session.c.next("state");session.definition=state.definition;
      assert.deepEqual(state.definition.mapRef,session.mapRef);
      session.c.send(settings(europe));assert.equal((await session.c.next("error")).code,"HOST_ONLY");
      session.c.send({type:"action",id:"initial-choice",revision:state.game.revision,action:{type:"choose_initial",indexes:[0,1]}});
      await session.c.next("ack",m=>m.id==="initial-choice");
      await session.c.next("state",m=>m.game.phase==="play");
      assert.equal(s.app.rooms.get(session.lobby.code).game.players[1].pending.length,0);
    }
    const players=sessions.map(({lobby})=>structuredClone(s.app.rooms.get(lobby.code).game.players));
    await s.restart();
    for(const [i,session] of sessions.entries()){
      session.c=await s.client();session.c.send({type:"join",code:session.lobby.code,token:session.lobby.token});const state=await session.c.next("state");
      assert.deepEqual(state.definition,session.definition);assert.deepEqual(s.app.rooms.get(session.lobby.code).game.players,players[i]);
      const room=s.app.rooms.get(session.lobby.code);E.finish(room.game,true);session.c.send({type:"reclaim"});await session.c.next("state",m=>m.game.phase==="finished");
      const replay=await s.http(`/api/history/${room.matchId}`),audit=await s.http(`/api/history/${room.matchId}/audit`);
      assert.equal(verifyAudit(audit).integrity,true);assert.deepEqual(Replay.at(replay.frames,replay.frames.length-1).definition,session.definition);
      session.c.send({type:"rematch"});const next=await session.c.next("lobby",m=>m.code!==session.lobby.code);assert.deepEqual(next.mapRef,session.mapRef);
    }
    const practice=await s.client();practice.send({type:"create_test",mapRef:laboratory,name:"Practice"});assert.deepEqual((await practice.next("state")).definition.mapRef,laboratory);
  });
});
for(const kind of ["file","supabase"])test(`${kind} failed checkpoint rolls back the selected lobby map`,async()=>{
  await runtime(kind,async s=>{
    const c=await s.client();c.send({type:"create",name:"Host"});const lobby=await c.next("lobby");
    if(kind==="file")fs.mkdirSync(s.file+".tmp");else s.api.fail=true;
    c.send(settings(laboratory));await c.next("storage",m=>m.paused);
    assert.deepEqual(s.app.rooms.get(lobby.code).mapRef,europe);assert.deepEqual(s.saved()[0].mapRef,europe);
    if(kind==="file")fs.rmdirSync(s.file+".tmp");else s.api.fail=false;
  });
});
