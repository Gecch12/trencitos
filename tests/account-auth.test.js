const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const {createAccountAuth} = require('../backend/account-auth');

async function fixture(t, hooks={}) {
  let auth, time=Date.now(), revoked=false, expired=false, refreshCount=0;
  const calls=[], codes=new Map(), profiles=new Map();
  const env={AUTH_ENABLED:'true',AUTH_SUPABASE_URL:'https://auth.example.test',AUTH_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_COOKIE_SECRET:'a'.repeat(64)};
  const fetchImpl=async(url,options)=>{
    const u=new URL(url), body=options.body?JSON.parse(options.body):{}, token=options.headers.Authorization?.replace('Bearer ','');
    calls.push({path:u.pathname,body,token});
    const reply=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status});
    if (u.pathname==='/auth/v1/token') {
      if (u.searchParams.get('grant_type')==='pkce') {
        const challenge=codes.get(body.auth_code);codes.delete(body.auth_code);
        if (!challenge || challenge!==crypto.createHash('sha256').update(body.code_verifier).digest('base64url')) return reply({},400);
      } else {refreshCount++;if(revoked || body.refresh_token!=='refresh-private') return reply({},400);}
      return reply({access_token:'access-private',refresh_token:'refresh-private',expires_in:expired?1:3600,user:{email:'private@example.test',user_metadata:{full_name:'PRIVATE GOOGLE NAME',avatar_url:'PRIVATE PHOTO'}}});
    }
    if (u.pathname==='/auth/v1/user') return reply(token==='access-private'?{id:'provider-user',is_anonymous:false}:{},token==='access-private'?200:401);
    if (u.pathname==='/auth/v1/logout') {revoked=true;return reply(null,204);}
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      if (revoked) return reply({},403);
      if (!profiles.has(token)) profiles.set(token,{id:'stable-account',nickname:'Jugador',color:'#d45748',avatar:'person',initialized:false});
      if (u.pathname.endsWith('game_update_profile')) Object.assign(profiles.get(token),{nickname:body.p_nickname,color:body.p_color,initialized:true});
      return reply([profiles.get(token)]);
    }
    throw Error('Unexpected upstream '+u.pathname);
  };
  const server=http.createServer(async(req,res)=>{await auth.handle(req,res,new URL(req.url,'http://localhost'));});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  t.after(()=>new Promise(ok=>server.close(ok)));
  const base=`http://127.0.0.1:${server.address().port}`;env.AUTH_BASE_URL=base;
  const seatCalls=[];
  const reset=()=>{auth=createAccountAuth({...hooks,env,fetchImpl,now:()=>time,seats:async(...args)=>{seatCalls.push(args);return {rooms:[]};}});};reset();
  const jar=new Map();
  async function request(path,body,options={}) {
    const response=await fetch(base+path,{redirect:'manual',...options,headers:{cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body?{'Content-Type':'application/json',Origin:base}:{}),...options.headers},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
    for (const c of response.headers.getSetCookie()) {const [name,value]=c.split(';')[0].split('=');if(value)jar.set(name,value);else jar.delete(name);}
    return response;
  }
  async function login() {
    const r=await request('/api/account/google',{});const target=new URL((await r.json()).url);
    const code=crypto.randomUUID();codes.set(code,target.searchParams.get('code_challenge'));
    const callback=await request('/auth/callback?code='+code);assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?auth=ok');
    return {target,code,headers:r.headers};
  }
  return {request,login,jar,calls,seatCalls,reset,env,setRevoked:()=>{revoked=true;},setExpired:()=>{expired=true;},advance:n=>{time+=n;},refreshCount:()=>refreshCount};
}
test('Google uses PKCE and encrypted HttpOnly cookies; only a separate game profile is public',async t=>{
  const f=await fixture(t), {target,code,headers}=await f.login();
  assert.equal(target.searchParams.get('provider'),'google');assert.equal(target.searchParams.get('code_challenge_method'),'s256');
  assert.match(headers.getSetCookie()[0],/HttpOnly; SameSite=Lax/);
  assert.ok(![...f.jar.values()].some(c=>/private|provider-user/.test(c)));
  const res=await f.request('/api/account'),text=await res.text();
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert.doesNotMatch(text,/private|email|photo|access_token|refresh_token|provider-user/i);
  assert.equal(JSON.parse(text).profile.nickname,'Jugador');
  assert.equal((await f.request('/auth/callback?code='+code)).headers.get('location'),'/?auth=error');
  f.reset();assert.equal((await (await f.request('/api/account')).json()).profile.id,'stable-account');
});
test('origin, request size, profile fields and account IDs are verified on the server',async t=>{
  const f=await fixture(t);await f.login();
  assert.equal((await f.request('/api/account/profile',{nickname:'Evil',color:'#d45748'},{headers:{Origin:'https://evil.test'}})).status,403);
  assert.equal((await f.request('/api/account/profile',{nickname:'x'.repeat(5000),color:'#d45748'})).status,413);
  for(const input of [{nickname:'<script>',color:'#d45748'},{nickname:'Angel',color:'#123456'},{nickname:'',color:'#d45748'}]) assert.equal((await f.request('/api/account/profile',input)).status,400);
  assert.equal((await f.request('/api/account/profile',{nickname:'Retired',color:'#ffffff'})).status,400);
  const res=await f.request('/api/account/profile',{id:'victim',nickname:'Angel',color:'#9ed7ed'});
  assert.equal(res.status,200);assert.deepEqual((await res.json()).profile,{id:'stable-account',nickname:'Angel',color:'#9ed7ed',avatar:'person',initialized:true});
  await f.request('/api/account/link',{id:'victim',code:'123456',token:'a'.repeat(48)});
  assert.equal(f.seatCalls[0][1],'stable-account');
});
test('invalid cookies and callbacks fail closed, revoked sessions cannot update or recover',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/auth/callback?code=stolen')).headers.get('location'),'/?auth=error');
  await f.login();f.jar.set('trencitos_session','tampered');
  assert.equal((await f.request('/api/account/profile',{nickname:'Angel',color:'#d45748'})).status,401);
  await f.login();f.setRevoked();
  assert.equal((await f.request('/api/account/recover',{code:'123456'})).status,401);
  assert.equal(f.seatCalls.length,0);
});
test('refresh is coalesced, survives reload, and logout revokes the local session',async t=>{
  const f=await fixture(t);f.setExpired();await f.login();f.advance(2000);
  const pair=await Promise.all([f.request('/api/account'),f.request('/api/account')]);
  assert.ok(pair.every(r=>r.status===200));assert.equal(f.refreshCount(),1);
  const logout=await f.request('/api/account/logout',{});assert.equal(logout.status,200);
  assert.equal(f.jar.size,0);assert.equal((await (await f.request('/api/account')).json()).profile,null);
});
test('Auth is explicitly optional and production refuses insecure or secret-key configuration',()=>{
  assert.doesNotThrow(()=>createAccountAuth({env:{}}));
  const env={AUTH_ENABLED:'true',AUTH_BASE_URL:'http://public.example',AUTH_SUPABASE_URL:'https://auth.example',AUTH_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x',AUTH_COOKIE_SECRET:'a'.repeat(64)};
  assert.throws(()=>createAccountAuth({env}));env.AUTH_BASE_URL='https://game.example';env.AUTH_SUPABASE_PUBLISHABLE_KEY='sb_secret_private';assert.throws(()=>createAccountAuth({env}));
});

test('verified Google callback links guest history once; logout cannot expose that history',async t=>{
 const {createMatchArchive}=require('../backend/match-archive'),{guestId,ensureGuest}=require('../backend/guest-identity'),Engine=require('../backend/engine');
 const archive=createMatchArchive(),token=crypto.randomBytes(32).toString('hex'),guest=guestId({headers:{cookie:'trencitos_guest='+token}});
 const room={code:'12345678',visibility:'private',archiveFull:true,members:[{name:'Guest',guestId:guest},{name:'Bot',bot:true}],game:Engine.newGame(['Guest','Bot'])};
 archive.capture(room,'Abandono definitivo');archive.commit(archive.prepare());let linked=0;
 const f=await fixture(t,{linkGuest:async(req,res,id)=>{linked++;const claim=archive.claim(guestId(req),id);if(claim)archive.restore({...archive.state,...claim});},logoutGuest:(req,res)=>ensureGuest(req,res,true)});
 f.jar.set('trencitos_guest',token);
 assert.equal((await archive.list({guestId:guest})).length,1);
 await f.request('/auth/callback?code=invalid');assert.equal(linked,0);
 await f.login();await f.request('/api/account');assert.equal(linked,2);
 assert.equal((await archive.list({accountId:'stable-account'})).length,1);
 assert.equal((await archive.list({guestId:guest})).length,0);
 assert.equal((await archive.list({accountId:'somebody-else'})).length,0);
 assert.equal((await archive.replay({accountId:'stable-account'},room.matchId)).full,true);
 await f.request('/api/account/logout',{});assert.notEqual(f.jar.get('trencitos_guest'),token);
 const loggedOut=guestId({headers:{cookie:'trencitos_guest='+f.jar.get('trencitos_guest')}});
 assert.equal((await archive.list({guestId:loggedOut})).length,0);
 assert.equal((await archive.list({accountId:'stable-account'})).length,1);
});
