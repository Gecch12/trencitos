const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('Postgres archives atomically with checkpoints, retries once, fences writers and protects guests',async()=>{
 const db=new PGlite(),writer='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222',id='33333333-3333-4333-a333-333333333333',commit='44444444-4444-4444-a444-444444444444',guest='a'.repeat(64);
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;grant usage on schema public to anon,authenticated,service_role;');
  for(const name of ['001_active_games.sql','003_match_archive.sql','003_match_archive.sql','004_archive_paging.sql','004_archive_paging.sql'])await db.exec(fs.readFileSync(require.resolve('../supabase/'+name),'utf8'));
  await db.query('select public.ferrovia_claim_checkpoint($1)',[writer]);
  const batch=[{match:{id,status:'active',startedAt:1,players:[{name:'A',bot:false,guestId:guest,accountId:null}]},frames:[{seq:0,snapshot:{game:{secret:'card'}}}]}];
  const save=()=>db.query('select public.ferrovia_save_checkpoint_v2($1,0,$2,$3,$4)',[writer,commit,JSON.stringify([]),JSON.stringify(batch)]);
  await save();await save();assert.equal((await db.query('select count(*) from public.trencitos_match_frames')).rows[0].count,1);
  assert.equal((await db.query('select version from public.ferrovia_checkpoint')).rows[0].version,1);
  const read=async(g,a,m=null)=>(await db.query('select public.trencitos_read_archive($1,$2,$3) as data',[g,a,m])).rows[0].data;
  assert.equal((await read(guest,null)).matches.length,1);assert.equal((await read('b'.repeat(64),null)).matches.length,0);
  for(let seq=1;seq<35;seq++)await db.query('insert into public.trencitos_match_frames values($1,$2,$3)',[id,seq,JSON.stringify({seq,snapshot:{payload:'x'.repeat(2048)}})]);
  const summary=(await db.query('select public.trencitos_read_archive_summary($1,null,$2) as data',[guest,id])).rows[0].data;
  assert.equal(summary.matches.length,1);assert.equal(summary.matches[0].frames,undefined);
  const page=async(from,count)=>(await db.query('select public.trencitos_read_frames($1,$2,$3) as data',[id,from,count])).rows[0].data;
  assert.deepEqual((await page(0,100)).map(f=>f.seq),Array.from({length:16},(_,i)=>i));
  assert.deepEqual((await page(32,16)).map(f=>f.seq),[32,33,34]);
  assert.deepEqual(await page(35,16),[]);
  await db.query('select public.trencitos_claim_guest($1,$2)',[guest,writer]);await db.query('select public.trencitos_claim_guest($1,$2)',[guest,writer]);
  assert.equal((await read(guest,null)).matches.length,0);assert.equal((await read(null,writer)).matches.length,1);
  await assert.rejects(()=>db.query('select public.trencitos_claim_guest($1,$2)',[guest,other]),/GUEST_ALREADY_CLAIMED/);
  await db.query('select public.trencitos_close_missing($1,$2)',[writer,JSON.stringify([])]);assert.equal((await read(null,writer)).matches[0].status,'abandoned');
  await db.query('select public.ferrovia_claim_checkpoint($1)',[other]);await assert.rejects(save,/FERROVIA_WRITER_CONFLICT/);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from public.trencitos_matches'),e=>e.code==='42501');
   await assert.rejects(()=>read(guest,null,id),e=>e.code==='42501');await db.exec('reset role');
   await db.exec('set role '+role);await assert.rejects(()=>page(0,16),e=>e.code==='42501');
   await assert.rejects(()=>db.query('select public.trencitos_read_archive_summary(null,null,$1)',[id]),e=>e.code==='42501');await db.exec('reset role');
  }
  // Invalid archive data rolls back the checkpoint too.
  await assert.rejects(()=>db.query('select public.ferrovia_save_checkpoint_v2($1,1,$2,$3,$4)',[other,'55555555-5555-4555-a555-555555555555','[]',JSON.stringify([{match:{id:'invalid'},frames:[]}])]));
  assert.equal((await db.query('select version from public.ferrovia_checkpoint')).rows[0].version,1);
 }finally{await db.close();}
});
