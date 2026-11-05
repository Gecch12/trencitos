"use strict";
// Server-only BFF: the browser never receives Google/Supabase tokens or metadata.
const crypto = require('node:crypto');
const Lobby = require('../shared/lobby-ui');
const ProfileRules = require('../shared/profile-rules');
const {guestId}=require('./guest-identity');
const {isNativeRequest,nativeToken}=require('./native-client');
const DAY = 86400000;
const fail = (status, message) => Object.assign(new Error(message), { status });

function createAccountAuth({ env = process.env, fetchImpl = fetch, now = Date.now, seats = async () => ({}), linkGuest = async()=>{}, logoutGuest=()=>{}, socialPresence=()=>({}) } = {}) {
  const enabled = env.AUTH_ENABLED === 'true';
  let origin, supabase, key, cookieKey;
  if (enabled) {
    try {
      origin = new URL(env.AUTH_BASE_URL);
      supabase = new URL(env.AUTH_SUPABASE_URL);
      for (const url of [origin, supabase]) {
        if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw Error();
      }
      key = env.AUTH_SUPABASE_PUBLISHABLE_KEY;
      if (!key || key.startsWith('sb_secret_')) throw Error();
      if (key.startsWith('ey')) {
        const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'));
        if (claims.role !== 'anon') throw Error();
      }
      if (!/^[a-f0-9]{64}$/i.test(env.AUTH_COOKIE_SECRET || '')) throw Error();
      cookieKey = Buffer.from(env.AUTH_COOKIE_SECRET, 'hex');
    } catch { throw Error('Auth requiere AUTH_BASE_URL, AUTH_SUPABASE_URL, clave publicable y AUTH_COOKIE_SECRET de 32 bytes hex.'); }
  }
  const providers = ['google', ...(env.AUTH_DISCORD_ENABLED === 'true' ? ['discord'] : [])];
  const secure = origin?.protocol === 'https:';
  const cookieName = (purpose) => `${secure ? '__Host-' : ''}trencitos_${purpose}`;
  function seal(value, purpose) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', cookieKey, iv);
    cipher.setAAD(Buffer.from(`${origin.origin}:${purpose}`));
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    const result = Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64url');
    if (result.length > 3800) throw fail(503, 'No pudimos guardar la sesión.');
    return result;
  }
  function read(req, purpose) {
    const native = isNativeRequest(req) && purpose==='session';
    const value = native ? req.headers['x-trencitos-session'] : (req.headers.cookie || '').split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName(purpose)+'='))?.split('=')[1];
    if(native)purpose='native-session';
    if (!value || value.length > 3800) return null;
    try {
      const bytes = Buffer.from(value, 'base64url'), decipher = crypto.createDecipheriv('aes-256-gcm',cookieKey,bytes.subarray(0,12));
      decipher.setAAD(Buffer.from(`${origin.origin}:${purpose}`)); decipher.setAuthTag(bytes.subarray(12,28));
      const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]));
      return data.until > now() && (!native || data.guest===nativeToken(req)) ? data : null;
    } catch { return null; }
  }
  function cookie(res, purpose, data, seconds) {
    if(res.nativeGuest) {
      if(purpose==='session')res.setHeader('X-Trencitos-Session',data?seal({...data,guest:res.nativeGuest},'native-session'):'');
      return;
    }
    const value = data ? seal(data,purpose) : '';
    res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') || []), `${cookieName(purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? '; Secure' : ''}`]);
  }
  async function request(endpoint, { token, body, method = 'GET' } = {}) {
    let response;
    try {
      response = await fetchImpl(new URL(endpoint,supabase), { method, redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{ apikey:key, ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(body ? {'Content-Type':'application/json'} : {}) },
        ...(body ? {body:JSON.stringify(body)} : {}) });
    } catch { throw fail(503,'El acceso a tu cuenta no está disponible ahora. Puedes seguir como invitado.'); }
    if (!response.ok) {
      const detail=await response.json().catch(()=>({}));
      const messages={USERNAME_INVALID:'Usa entre 3 y 20 letras sin tildes, números o guion bajo; empieza con una letra.',USERNAME_REQUIRED:'Elige un username antes de continuar.',USERNAME_TAKEN:'Ese username ya está ocupado o reservado.',USERNAME_COOLDOWN:'Puedes cambiar tu username una vez cada 30 días.',DISPLAY_NAME_INVALID:'El nombre visible admite hasta 20 caracteres, sin símbolos de control.',PREFERENCES_INVALID:'Elige un avatar y colores válidos.',PLAYER_NOT_FOUND:'No se encontró al jugador.',PLAYER_UNAVAILABLE:'No puedes enviar una solicitud a este jugador.',REQUEST_COOLDOWN:'Espera 24 horas antes de volver a enviar una solicitud.',REQUEST_LIMIT:'Has alcanzado el límite de 20 solicitudes por hora.',REQUEST_NOT_RECEIVED:'Esta solicitud ya no está disponible.',INVALID_RELATIONSHIP:'La relación cambió. Actualiza la lista.',GROUP_FRIENDS_REQUIRED:'Selecciona entre uno y cuatro amigos aceptados.',GROUP_LIMIT:'Puedes guardar hasta 20 mesas.',GROUP_NAME_INVALID:'Pon un nombre de 1 a 40 caracteres a la mesa.'};
      if(detail.code==='23505')throw fail(409,messages.USERNAME_TAKEN);
      if(messages[detail.message])throw fail(detail.code==='P0002'?404:400,messages[detail.message]);
      if (response.status===401 || detail.code==='42501' || response.status===403&&endpoint.startsWith('/rest/v1/rpc/') || response.status===400&&endpoint.includes('grant_type=refresh_token')) throw fail(401,'Tu sesión caducó. Vuelve a entrar.');
      if([400,403,422].includes(response.status)) throw fail(400,'No se pudo completar la operación. Comprueba que esa cuenta no esté vinculada a otro perfil.');
      throw fail(503,'No pudimos conectar con tu cuenta. Inténtalo de nuevo.');
    }
    return response.status === 204 ? null : response.json();
  }
  function tokenSession(result) {
    if (typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string' || !Number.isFinite(result.expires_in)) throw fail(503,'Respuesta de acceso inválida.');
    return { access:result.access_token, refresh:result.refresh_token, expires:now()+result.expires_in*1000, until:now()+30*DAY };
  }
  // Simultaneous tabs share one refresh exchange; only a short overlap is cached.
  const refreshes = new Map();
  async function authenticate(req, res) {
    let session = read(req,'session');
    if (!session) throw fail(401,'Entra con Google o Discord para guardar tu perfil.');
    if (session.expires < now()+30000) {
      const hash = crypto.createHash('sha256').update(session.refresh).digest('hex');
      for (const [id,item] of refreshes) if (item.until < now()) refreshes.delete(id);
      if (!refreshes.has(hash)) refreshes.set(hash,{until:now()+10000,promise:request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh}}).then(tokenSession)});
      session = await refreshes.get(hash).promise;
      cookie(res,'session',session,30*86400);
    }
    const user = await request('/auth/v1/user',{token:session.access});
    if (typeof user?.id !== 'string' || user.is_anonymous) throw fail(401,'Cuenta inválida.');
    return {...session,user};
  }
  function profile(data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.id !== 'string') throw fail(503,'No pudimos cargar tu perfil.');
    return {id:row.id,nickname:row.nickname,color:Lobby.isColor(row.color)?row.color:Lobby.PALETTE[0].color,avatar:ProfileRules.avatars.includes(row.avatar)?row.avatar:'person',username:row.username||null,displayName:row.display_name??row.nickname,secondaryColor:Lobby.isColor(row.secondary_color)?row.secondary_color:null,usernameChangedAt:row.username_changed_at||null,initialized:!!row.initialized};
  }
  async function getProfile(session) {
    // SQL also verifies that auth.sessions still contains this JWT's session_id.
    return profile(await request('/rest/v1/rpc/game_profile_v2',{method:'POST',token:session.access,body:{}}));
  }
  async function body(req) {
    if (!(isNativeRequest(req) && nativeToken(req)) && (req.headers.origin !== origin.origin || req.headers['sec-fetch-site'] === 'cross-site')) throw fail(403,'Solicitud de otro sitio rechazada.');
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail(415,'Se requiere JSON.');
    let data = '', length = 0;
    for await (const chunk of req) {
      length += chunk.length; if (length > 4096) throw fail(413,'Solicitud demasiado grande.'); data += chunk;
    }
    try { const value = JSON.parse(data); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
    catch { throw fail(400,'Solicitud inválida.'); }
  }
  const json = (res,status,value) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); };
  const redirect = (res,to) => { res.writeHead(303,{Location:to}); res.end(); };
  const routes = new Set(['/api/account','/api/account/profile','/api/account/room-profile','/api/account/discord','/api/account/unlink','/api/account/social','/api/account/google','/api/account/logout','/api/account/rooms','/api/account/link','/api/account/recover','/auth/callback','/auth/native','/api/account/native/start','/api/account/native/exchange']);
  // Short-lived, single-use transfers. A server restart cancels unfinished login,
  // never revives a consumed code. The app must prove its independent verifier.
  const nativeFlows=new Map(), nativeCodes=new Map();
  async function authorize(res, nativeId, provider='google', session=null) {
    if(!providers.includes(provider))throw fail(503,'Este proveedor aún no está configurado.');
    const verifier=crypto.randomBytes(48).toString('base64url');
    const accountId=session?(await getProfile(session)).id:null;
    cookie(res,'oauth',{verifier,nativeId,accountId,provider,until:now()+600000},600);
    const target=new URL(session?'/auth/v1/user/identities/authorize':'/auth/v1/authorize',supabase);
    target.search=new URLSearchParams({provider,redirect_to:origin.origin+'/auth/callback',code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256',scopes:provider==='discord'?'identify email':'openid email profile',...(session?{skip_http_redirect:'true'}:{})}).toString();
    if(!session)return target.href;
    const result=await request(target.pathname+target.search,{token:session.access});
    const url=new URL(result.url);
    if(url.protocol!=='https:' && url.origin!==supabase.origin)throw fail(503,'Enlace de acceso inválido.');
    return url.href;
  }
  const identityLocks=new Map();
  async function unlink(session, provider) {
    if(!['google','discord'].includes(provider))throw fail(400,'Proveedor inválido.');
    const id=session.user.id, previous=identityLocks.get(id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(async()=>{
      const user=await request('/auth/v1/user',{token:session.access});
      const identities=(user.identities||[]).filter(i=>['google','discord'].includes(i.provider));
      const identity=identities.find(i=>i.provider===provider);
      if(!identity)throw fail(400,'La cuenta ya está desconectada.');
      if(!identities.some(i=>i.provider!==provider&&providers.includes(i.provider)))throw fail(400,'Conecta primero otra cuenta para conservar el acceso a tu perfil.');
      if(!/^[a-f0-9-]{36}$/i.test(identity.identity_id||''))throw fail(503,'Identidad inválida.');
      await request('/auth/v1/user/identities/'+identity.identity_id,{method:'DELETE',token:session.access});
    });
    identityLocks.set(id,work);
    try{await work;}finally{if(identityLocks.get(id)===work)identityLocks.delete(id);}
  }
  function connections(session) {return (session.user?.identities||[]).filter(i=>['google','discord'].includes(i.provider)).map(i=>({provider:i.provider,email:typeof i.identity_data?.email==='string'?i.identity_data.email:null}));}
  let inFlight = 0;
  async function handle(req,res,url) {
    if (!routes.has(url.pathname)) return false;
    if(isNativeRequest(req))res.nativeGuest=nativeToken(req);
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Content-Type-Options','nosniff');
    if (!enabled) { json(res,url.pathname === '/api/account' ? 200 : 503,{enabled:false,profile:null,...(res.nativeGuest?{mobile:true}:{}),...(url.pathname==='/api/account'?{}:{message:'El acceso con Google aún no está disponible.'})}); return true; }
    if (inFlight >= 64) { json(res,429,{message:'Inténtalo de nuevo en unos segundos.'}); return true; }
    inFlight++;
    let nativeCallback=false;
    try {
      for(const [id,flow] of nativeFlows)if(flow.until<=now())nativeFlows.delete(id);
      for(const [code,flow] of nativeCodes)if(flow.until<=now())nativeCodes.delete(code);
      if(url.pathname==='/auth/native') {
        if(req.method!=='GET'||isNativeRequest(req))throw fail(405,'Método no permitido.');
        const id=url.searchParams.get('flow'),flow=nativeFlows.get(id);
        if(!flow||flow.launched)throw fail(401,'Acceso cancelado o caducado.');
        flow.launched=true;redirect(res,await authorize(res,id,flow.provider,flow.session));return true;
      }
      if (url.pathname === '/auth/callback') {
        if (req.method !== 'GET') throw fail(405,'Método no permitido.');
        const flow = read(req,'oauth'); cookie(res,'oauth',null,0);
        nativeCallback=!!flow?.nativeId;
        const code = url.searchParams.get('code');
        if (!flow?.verifier || !code || code.length > 256 || url.searchParams.has('error')) throw fail(401,'Acceso cancelado o caducado.');
        const session = tokenSession(await request('/auth/v1/token?grant_type=pkce',{method:'POST',body:{auth_code:code,code_verifier:flow.verifier}}));
        // Explicit server validation, never trust metadata, email or client claims.
        await request('/auth/v1/user',{token:session.access});
        const own=await getProfile(session);
        if(flow.accountId && flow.accountId!==own.id)throw fail(409,'La vinculación no conservó tu perfil.');
        if(flow.nativeId) {
          const pending=nativeFlows.get(flow.nativeId);nativeFlows.delete(flow.nativeId);
          if(!pending?.launched)throw fail(401,'Acceso cancelado o caducado.');
          const code=crypto.randomBytes(32).toString('hex');
          nativeCodes.set(code,{...pending,session,accountId:own.id,until:now()+60000});
          redirect(res,'trencitos://auth?code='+code);return true;
        }
        await linkGuest(req,res,own.id);
        cookie(res,'session',session,30*86400); redirect(res,'/?auth=ok'); return true;
      }
      const readOnly = (['/api/account','/api/account/rooms','/api/account/room-profile'].includes(url.pathname) || url.pathname==='/api/account/social'&&req.method==='GET');
      if (req.method !== (readOnly?'GET':'POST')) throw fail(405,'Método no permitido.');
      const input = readOnly ? {} : await body(req);
      if(url.pathname==='/api/account/native/start') {
        if(!res.nativeGuest||!/^[-_A-Za-z0-9]{43}$/.test(input.challenge||''))throw fail(400,'Solicitud inválida.');
        if(nativeFlows.size+nativeCodes.size>=256)throw fail(429,'Inténtalo de nuevo en unos segundos.');
        const id=crypto.randomBytes(32).toString('hex');
        const provider=input.provider||'google';
        if(!providers.includes(provider))throw fail(503,'Este proveedor aún no está configurado.');
        const session=read(req,'session')?await authenticate(req,res):null;
        nativeFlows.set(id,{challenge:input.challenge,guest:res.nativeGuest,provider,session,until:now()+600000});
        json(res,200,{url:origin.origin+'/auth/native?flow='+id});return true;
      }
      if(url.pathname==='/api/account/native/exchange') {
        const flow=nativeCodes.get(input.code);
        if(!res.nativeGuest||!flow||flow.guest!==res.nativeGuest||!/^[-_A-Za-z0-9]{43,128}$/.test(input.verifier||''))throw fail(401,'Acceso cancelado o caducado.');
        const challenge=crypto.createHash('sha256').update(input.verifier).digest('base64url');
        if(!crypto.timingSafeEqual(Buffer.from(challenge),Buffer.from(flow.challenge)))throw fail(401,'Acceso cancelado o caducado.');
        nativeCodes.delete(input.code);
        await linkGuest(req,res,flow.accountId);cookie(res,'session',flow.session,30*86400);
        json(res,200,{ok:true});return true;
      }
      if (['/api/account/google','/api/account/discord'].includes(url.pathname)) {
        const session=read(req,'session')?await authenticate(req,res):null;
        json(res,200,{url:await authorize(res,null,url.pathname.split('/').pop(),session)}); return true;
      }
      if (url.pathname === '/api/account/logout') {
        const session = read(req,'session');
        if (session) {
          try {
            const current = await authenticate(req,res);
            await request('/auth/v1/logout?scope=local',{method:'POST',token:current.access});
          } catch (error) { if (error.status !== 401) throw error; }
        }
        refreshes.clear(); if(!res.nativeGuest)logoutGuest(req,res); cookie(res,'session',null,0); cookie(res,'oauth',null,0);
        json(res,200,{ok:true}); return true;
      }
      if (url.pathname === '/api/account' && !read(req,'session')) { json(res,200,{enabled:true,providers,profile:null}); return true; }
      const session = await authenticate(req,res);
      let own = await getProfile(session);
      if(url.pathname === "/api/account") await linkGuest(req,res,own.id);
      if(url.pathname==='/api/account/room-profile'){
        if(!own.username)throw fail(409,'Edita tu perfil para elegir un username antes de entrar.');
        json(res,200,{ticket:seal({profile:own,guest:guestId(req),until:now()+60000},'room-profile')});return true;
      }
      if (url.pathname === '/api/account/profile') {
        const username=input.username==null?own.username:ProfileRules.normalizeUsername(input.username);
        const rawName=input.displayName??input.nickname??own.displayName;
        if(typeof rawName!=='string')throw fail(400,'Nombre visible inválido.');
        const displayName=rawName.trim();
        const secondaryColor=input.secondaryColor??null, avatar=input.avatar||own.avatar;
        if(username!==null&&!ProfileRules.validUsername(username)||!ProfileRules.validDisplayName(displayName)||!Lobby.isColor(input.color)||secondaryColor!==null&&(!Lobby.isColor(secondaryColor)||secondaryColor===input.color)||!ProfileRules.avatars.includes(avatar))throw fail(400,'Comprueba tu username, nombre visible (hasta 20 caracteres), avatar y colores.');
        own=profile(await request('/rest/v1/rpc/game_update_profile_v2',{method:'POST',token:session.access,body:{p_username:username,p_display_name:displayName,p_color:input.color,p_secondary_color:secondaryColor,p_avatar:avatar}}));
      } else if(url.pathname==='/api/account/unlink') {
        await unlink(session,input.provider);
        session.user=await request('/auth/v1/user',{token:session.access});
      } else if(url.pathname==='/api/account/social') {
        const action=input.action||url.searchParams.get('action')||'list';
        if(req.method==='GET'&&!['list','find','profile'].includes(action))throw fail(405,'Método no permitido.');
        const data=await request('/rest/v1/rpc/game_social',{method:'POST',token:session.access,body:{p_action:action,p_target:input.target||url.searchParams.get('target')||null,p_username:input.username||url.searchParams.get('username')||null,p_name:input.name||null,p_members:input.members||null,p_group:input.group||null}});
        if(data.players)data.players=data.players.map(p=>({...p,...(p.relationship==='accepted'?socialPresence(p.id):{})}));
        json(res,200,data);return true;
      } else if (['/api/account/rooms','/api/account/link','/api/account/recover'].includes(url.pathname)) {
        json(res,200,await seats(url.pathname.split('/').pop(),own.id,input,own)); return true;
      }
      json(res,200,{enabled:true,providers,connections:connections(session),profile:own});
    } catch (error) {
      if (url.pathname === '/auth/callback') redirect(res,nativeCallback?'trencitos://auth?error=cancelled':'/?auth=error');
      else {
        if (error.status === 401) cookie(res,'session',null,0);
        json(res,error.status || 503,{message:error.status ? error.message : 'No pudimos conectar con tu cuenta.'});
      }
    } finally { inFlight--; }
    return true;
  }
  return {handle,roomProfile(ticket,guest) {
    if(!enabled||typeof ticket!=='string'||ticket.length>3800)return null;
    try {const bytes=Buffer.from(ticket,'base64url'),decipher=crypto.createDecipheriv('aes-256-gcm',cookieKey,bytes.subarray(0,12));decipher.setAAD(Buffer.from(`${origin.origin}:room-profile`));decipher.setAuthTag(bytes.subarray(12,28));const value=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]));return value.until>now()&&value.guest===guest?value.profile:null;}catch{return null;}
  },async socialFor(req,res) {if(!enabled||!read(req,"session"))return null;const session=await authenticate(req,res);return request('/rest/v1/rpc/game_social',{method:'POST',token:session.access,body:{}});},async profileFor(req,res) {if(isNativeRequest(req))res.nativeGuest=nativeToken(req);if(!enabled||!read(req,"session"))return null;return getProfile(await authenticate(req,res));},async identify(req,res) { if(isNativeRequest(req))res.nativeGuest=nativeToken(req);if(!enabled||!read(req,"session"))return null;try{return (await getProfile(await authenticate(req,res))).id;}catch(error){if(error.status===401)return null;throw error;} }};
}
module.exports = { createAccountAuth };
