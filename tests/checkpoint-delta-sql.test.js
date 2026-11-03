"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('incremental SQL preserves other rooms, timestamp budgets, atomic history, retries, fencing and role boundaries',async()=>{
 const db=new PGlite(),writer=randomUUID(),other=randomUUID(),matchId=randomUUID();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;grant usage on schema public to anon,authenticated,service_role;');
  for(const f of ['001_active_games.sql','003_match_archive.sql','005_checkpoint_delta.sql','005_checkpoint_delta.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+f),'utf8'));
  const claim=async who=>(await db.query('select public.ferrovia_claim_checkpoint($1) as data',[who])).rows[0].data;
  assert.equal((await claim(writer)).capabilities.roomDelta,1);
  await db.query('select public.ferrovia_save_checkpoint_v2($1,0,$2,$3,$4)',[writer,randomUUID(),JSON.stringify([{code:'A',savedAt:100,game:{hand:['red']}},{code:'B',savedAt:100,game:{hand:['blue']}}]),'[]']);
  const delta=async({who=writer,version=1,commit=randomUUID(),changed=[],removed=[],at=200,archive=[]}={})=>(await db.query('select public.ferrovia_save_checkpoint_delta($1,$2,$3,$4,$5,$6,$7) as data',[who,version,commit,JSON.stringify(changed),JSON.stringify(removed),at,JSON.stringify(archive)])).rows[0].data;
  const commit=randomUUID(),batch={commit,changed:[{code:'A',game:{hand:['green']}}],archive:[{match:{id:matchId,status:'active',players:[]},frames:[{seq:0,snapshot:{fixture:true}}]}]};
  assert.equal((await delta(batch)).version,2);assert.equal((await delta(batch)).version,2);
  let saved=(await db.query('select rooms,version from public.ferrovia_checkpoint')).rows[0];assert.deepEqual(saved.rooms,[{code:'A',savedAt:200,game:{hand:['green']}},{code:'B',savedAt:200,game:{hand:['blue']}}]);
  assert.equal((await db.query('select count(*) from public.trencitos_match_frames')).rows[0].count,1);
  await assert.rejects(()=>delta({version:2,changed:[{code:'B',game:{hand:[]}}],archive:[{match:{id:matchId},frames:[{seq:2}]}]}),/gap/);
  assert.deepEqual((await db.query('select rooms,version from public.ferrovia_checkpoint')).rows[0],saved);
  for(const malformed of [{changed:[{code:'A'},{code:'A'}]},{changed:[{}]},{changed:[{code:'A'}],removed:['A']},{removed:[3]}])await assert.rejects(()=>delta({version:2,...malformed}),/Invalid room delta/);
  await delta({version:2,changed:[{code:'C',game:{hand:[]}}],removed:['A'],at:300});
  saved=(await db.query('select rooms,version from public.ferrovia_checkpoint')).rows[0];assert.deepEqual(saved.rooms.map(r=>r.code),['B','C']);assert.ok(saved.rooms.every(r=>r.savedAt===300));
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>delta({version:3}),e=>e.code==='42501');await db.exec('reset role');}
  const loaded=await claim(other);assert.deepEqual(loaded.rooms,saved.rooms);await assert.rejects(()=>delta({version:3}),/FERROVIA_WRITER_CONFLICT/);
  // An older server can still publish its complete checkpoint after claiming.
  await db.query('select public.ferrovia_save_checkpoint_v2($1,3,$2,$3,$4)',[other,randomUUID(),'[]','[]']);assert.deepEqual((await claim(writer)).rooms,[]);
 }finally{await db.close();}
});
