"use strict";
// Local simulated OAuth providers and real PostgreSQL profile/social RPCs.
// No credentials, providers or production data are used.
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
async function start(port=3151,providerPort=3152){
 const db=new PGlite(),users=[crypto.randomUUID(),crypto.randomUUID()],codes=new Map(),sessions=new Map(),identities=new Map(users.map(id=>[id,[]]));
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;grant usage on schema public,auth to anon,authenticated;`);
 for(const id of users)await db.query('insert into auth.users values($1)',[id]);
 for(const file of ['002_identity.sql','006_profiles_social.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/'+file),'utf8'));
 const issue=(u,user)=>{const code=crypto.randomUUID();codes.set(code,{user,provider:u.searchParams.get('provider'),challenge:u.searchParams.get('code_challenge'),redirect:u.searchParams.get('redirect_to')});return code;};
 const link=code=>{const url=new URL(codes.get(code).redirect);url.searchParams.set('code',code);return url.href;};
 const provider=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost'),reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
  if(u.pathname==='/auth/v1/authorize'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><title>OAuth simulado</title><h1>Proveedor simulado para QA local</h1>'+users.map((id,i)=>`<p><a href="${link(issue(u,id))}">Cuenta de prueba ${i+1}</a></p>`).join(''));}
  if(u.pathname==='/qa/consent'){const code=u.searchParams.get('code');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<h1>Vincular proveedor simulado</h1><a href="${link(code)}">Confirmar vinculación</a>`);}
  let raw='';for await(const chunk of req)raw+=chunk;const input=raw?JSON.parse(raw):{};
  if(u.pathname==='/auth/v1/token'){let sid;if(u.searchParams.get('grant_type')==='pkce'){const flow=codes.get(input.auth_code);codes.delete(input.auth_code);if(!flow||flow.challenge!==crypto.createHash('sha256').update(input.code_verifier).digest('base64url'))return reply(400,{});sid=crypto.randomUUID();sessions.set(sid,flow.user);await db.query('insert into auth.sessions values($1,$2,null)',[sid,flow.user]);const list=identities.get(flow.user);if(!list.some(i=>i.provider===flow.provider))list.push({identity_id:crypto.randomUUID(),provider:flow.provider,identity_data:{email:'qa'+users.indexOf(flow.user)+'@example.test'}});}else{sid=input.refresh_token;if(!sessions.has(sid))return reply(400,{});}return reply(200,{access_token:sid,refresh_token:sid,expires_in:3600});}
  const sid=req.headers.authorization?.replace('Bearer ',''),user=sessions.get(sid);if(!user)return reply(401,{});
  if(u.pathname==='/auth/v1/user')return reply(200,{id:user,is_anonymous:false,identities:identities.get(user)});
  if(u.pathname==='/auth/v1/user/identities/authorize')return reply(200,{url:`http://127.0.0.1:${providerPort}/qa/consent?code=${issue(u,user)}`});
  if(u.pathname.startsWith('/auth/v1/user/identities/')&&req.method==='DELETE'){const list=identities.get(user),id=u.pathname.split('/').pop();if(list.length<2||!list.some(i=>i.identity_id===id))return reply(400,{});identities.set(user,list.filter(i=>i.identity_id!==id));return reply(200,{});}
  if(u.pathname==='/auth/v1/logout'){sessions.delete(sid);await db.query('delete from auth.sessions where id=$1',[sid]);return reply(200,{});}
  const value=await db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:sid})]);await tx.exec('set local role authenticated');
   if(u.pathname.endsWith('/game_profile_v2'))return (await tx.query('select public.game_profile_v2() p')).rows[0].p;
   if(u.pathname.endsWith('/game_update_profile_v2'))return (await tx.query('select public.game_update_profile_v2($1,$2,$3,$4,$5) p',[input.p_username,input.p_display_name,input.p_color,input.p_secondary_color,input.p_avatar])).rows[0].p;
   if(u.pathname.endsWith('/game_social'))return (await tx.query('select public.game_social($1,$2,$3,$4,$5,$6) p',[input.p_action||'list',input.p_target||null,input.p_username||null,input.p_name||null,input.p_members||null,input.p_group||null])).rows[0].p;
   throw Error('Unknown QA RPC');});reply(200,value);
 }catch(error){reply(error.code==='42501'?403:400,{code:error.code,message:error.message});}});
 await new Promise(ok=>provider.listen(providerPort,'127.0.0.1',ok));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-profile-qa-'));
 Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(dir,'state.json'),AUTH_ENABLED:'true',AUTH_DISCORD_ENABLED:'true',AUTH_BASE_URL:`http://127.0.0.1:${port}`,AUTH_SUPABASE_URL:`http://127.0.0.1:${providerPort}`,AUTH_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_qa',AUTH_COOKIE_SECRET:crypto.randomBytes(32).toString('hex')});
 const app=require('../../backend/server');await app.ready;await new Promise(ok=>app.server.listen(port,'127.0.0.1',ok));
 return {app,db,base:`http://127.0.0.1:${port}`,async close(){await app.shutdown();await new Promise(ok=>provider.close(ok));await db.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
if(require.main===module)start().then(f=>console.log('Profile QA (simulated OAuth): '+f.base));
module.exports={start};
