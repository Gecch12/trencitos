const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('identity migration executes in Postgres: own profile only, no direct table access, revocation enforced',async()=>{
 const db=new PGlite();
 const userA='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',userB='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
 const sessionA='11111111-1111-4111-a111-111111111111',sessionB='22222222-2222-4222-a222-222222222222';
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
   create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users values('${userA}'),('${userB}');
   insert into auth.sessions values('${sessionA}','${userA}',null),('${sessionB}','${userB}',null);`);
  const migration=fs.readFileSync(require.resolve('../supabase/002_identity.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);
  const login=async(user,session)=>{await db.exec('reset role;');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})]);await db.exec('set role authenticated;');};
  await db.exec('set role anon;');
  await assert.rejects(()=>db.query('select * from public.game_profile()'),e=>e.code==='42501');
  await login(userA,sessionA);
  const a=(await db.query('select * from public.game_profile()')).rows[0];
  assert.notEqual(a.id,userA);assert.equal(a.nickname,'Jugador');assert.equal(a.initialized,false);
  await db.query('select * from public.game_update_profile($1,$2)',['Angel','#9ed7ed']);
  await assert.rejects(()=>db.query('select * from public.game_profiles'),e=>e.code==='42501');
  await assert.rejects(()=>db.query("update public.game_profiles set nickname='Impostor'"),e=>e.code==='42501');
  await assert.rejects(()=>db.query('select * from public.game_update_profile($1,$2)',['<img>','#9ed7ed']));
  await login(userB,sessionB);
  const b=(await db.query('select * from public.game_profile()')).rows[0];assert.notEqual(a.id,b.id);assert.equal(b.nickname,'Jugador');
  await login(userA,sessionB);await assert.rejects(()=>db.query('select * from public.game_profile()'),e=>e.code==='42501');
  await login(userA,sessionA);
  const saved=(await db.query('select * from public.game_profile()')).rows[0];assert.equal(saved.id,a.id);assert.equal(saved.nickname,'Angel');assert.equal(saved.initialized,true);
  await db.exec('reset role;');await db.query('delete from auth.sessions where id=$1',[sessionA]);
  await login(userA,sessionA);await assert.rejects(()=>db.query('select * from public.game_update_profile($1,$2)',['Expired','#d45748']),e=>e.code==='42501');
 } finally{await db.close();}
});
