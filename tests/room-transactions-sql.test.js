"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('room transactions preserve legacy recovery, independent versions, history, retries and fencing',async()=>{
 const db=new PGlite(),writer=randomUUID(),other=randomUUID(),match=randomUUID();
 try {
  await db.exec('create role anon;create role authenticated;create role service_role;grant usage on schema public to anon,authenticated,service_role;');
  for(const f of ['001_active_games.sql','003_match_archive.sql','005_checkpoint_delta.sql','009_room_transactions.sql','009_room_transactions.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+f),'utf8'));
  const claim=async who=>(await db.query('select public.ferrovia_claim_checkpoint($1) as data',[who])).rows[0].data;
  const activate=async who=>(await db.query('select public.trencitos_claim_rooms($1) as data',[who])).rows[0].data;
  const save=async(changes,archive=[],commit=randomUUID(),who=writer)=>(await db.query('select public.trencitos_save_rooms($1,$2,$3,$4) as data',[who,commit,JSON.stringify(changes),JSON.stringify(archive)])).rows[0].data;
  assert.equal((await claim(writer)).capabilities.roomTransactions,1);
  await db.query('select public.ferrovia_save_checkpoint($1,0,$2,$3)',[writer,randomUUID(),JSON.stringify([{code:'A',game:{hand:['red']}},{code:'B',game:{hand:['blue']}}])]);
  assert.deepEqual((await activate(writer)).versions,{A:1,B:1});
  const changes=[{code:'A',version:1,room:{code:'A',game:{hand:['red','green']}}}],history=[{match:{id:match,code:'A'},frames:[{seq:0,snapshot:{fixture:true}}]}],id=randomUUID();
  assert.deepEqual((await save(changes,history,id)).versions,{A:2});
  await save([{code:'B',version:1,room:{code:'B',game:{hand:['blue','white']}}}]);
  assert.deepEqual((await save(changes,history,id)).versions,{A:2});
  assert.equal((await db.query('select count(*) from public.trencitos_match_frames')).rows[0].count,1);
  await assert.rejects(()=>save([{code:'A',version:1,room:null}]),/ROOM_CONFLICT/);
  await assert.rejects(()=>save([{code:'A',version:1,room:null}],[],id),/ID reused/);
  await assert.rejects(()=>save([{code:'A',version:2,room:null}],[{match:{id:match,code:'A'},frames:[{seq:2}]}]),/gap/);
  assert.equal((await db.query("select version from public.trencitos_rooms where code='A'")).rows[0].version,2);
  await assert.rejects(()=>save([{code:'A',version:2,room:null}],[{match:{id:match,code:'B'},frames:[]}]),/outside room/);
  await assert.rejects(()=>db.query('select public.ferrovia_save_checkpoint($1,1,$2,$3)',[writer,randomUUID(),'[]']),/WRITER_CONFLICT/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>save([]),e=>e.code==='42501');await assert.rejects(()=>db.query('select * from public.trencitos_rooms'),e=>e.code==='42501');await db.exec('reset role');}
  const legacy=await claim(other);
  assert.deepEqual(legacy.rooms.map(r=>r.game.hand),[['red','green'],['blue','white']]);
  await assert.rejects(()=>save([{code:'A',version:2,room:null}]),/WRITER_CONFLICT/);
  await db.query('select public.ferrovia_save_checkpoint($1,$2,$3,$4)',[other,legacy.version,randomUUID(),JSON.stringify([legacy.rooms[1]])]);
  await claim(writer);const versions=(await activate(writer)).versions;
  assert.equal((await db.query("select room from public.trencitos_rooms where code='A'")).rows[0].room,null);
  const removal=[{code:'B',version:versions.B,room:null}],removalId=randomUUID();
  const removed=await save(removal,[],removalId);assert.deepEqual(await save(removal,[],removalId),removed);
  assert.deepEqual((await claim(other)).rooms,[]);
 } finally {await db.close();}
});
