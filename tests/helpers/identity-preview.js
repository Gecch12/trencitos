// Loopback-only OAuth double + actual profile SQL for browser QA. Never deployed.
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite(),user=crypto.randomUUID(),codes=new Map(),sessions=new Map();
 await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
  create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
  grant usage on schema public,auth to anon,authenticated;`);
 await db.query('insert into auth.users values($1)',[user]);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/002_identity.sql'),'utf8'));
 const provider=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://localhost'),reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   if(u.pathname==='/auth/v1/authorize'){
    const code=crypto.randomUUID(),redirect=new URL(u.searchParams.get('redirect_to'));redirect.searchParams.set('code',code);
    codes.set(code,u.searchParams.get('code_challenge'));
    res.writeHead(200,{'Content-Type':'text/html'});return res.end('<!doctype html><title>Proveedor simulado · QA</title><h1>Acceso simulado de QA</h1><p>Prueba local. No se conecta con Google ni usa datos reales.</p><a href="'+redirect.href+'">Acceder con cuenta de prueba</a>');
   }
   let raw='';for await(const chunk of req)raw+=chunk;const input=raw?JSON.parse(raw):{};
   if(u.pathname==='/auth/v1/token'){
    let sid;
    if(u.searchParams.get('grant_type')==='pkce'){
     const challenge=codes.get(input.auth_code);codes.delete(input.auth_code);
     if(!challenge || challenge!==crypto.createHash('sha256').update(input.code_verifier).digest('base64url'))return reply(400,{});
     sid=crypto.randomUUID();await db.query('insert into auth.sessions values($1,$2,null)',[sid,user]);sessions.set(sid,sid);
    }else{sid=input.refresh_token;if(!sessions.has(sid))return reply(400,{});}
    return reply(200,{access_token:sid,refresh_token:sid,expires_in:3600});
   }
   const sid=req.headers.authorization?.replace('Bearer ','');
   if(!sessions.has(sid))return reply(401,{});
   if(u.pathname==='/auth/v1/user')return reply(200,{id:user,is_anonymous:false});
   if(u.pathname==='/auth/v1/logout'){sessions.delete(sid);await db.query('delete from auth.sessions where id=$1',[sid]);return reply(200,{});}
   const rows=await db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:sid})]);
    await tx.exec('set local role authenticated;');
    if(u.pathname==='/rest/v1/rpc/game_profile')return (await tx.query('select * from public.game_profile()')).rows;
    if(u.pathname==='/rest/v1/rpc/game_update_profile')return (await tx.query('select * from public.game_update_profile($1,$2)',[input.p_nickname,input.p_color])).rows;
    throw Error('Unexpected RPC');
   });reply(200,rows);
  }catch(error){reply(error.code==='42501'?403:500,{message:'QA provider error'});}
 });
 await new Promise(ok=>provider.listen(3142,'127.0.0.1',ok));
 Object.assign(process.env,{AUTH_ENABLED:'true',AUTH_BASE_URL:'http://127.0.0.1:3141',AUTH_SUPABASE_URL:'http://127.0.0.1:3142',AUTH_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_qa',AUTH_COOKIE_SECRET:crypto.randomBytes(32).toString('hex')});
 const {start}=require('./threejs-preview');await start(3141);
 console.log('Identity QA (simulated provider, local SQL): http://127.0.0.1:3141');
})();
