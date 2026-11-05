// Real app HTTP/WS and encrypted account cookies; provider responses are local doubles.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {chromium}=require('playwright'),E=require('../backend/engine');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-account-resume-'));
const out=path.resolve(process.env.QA_OUT||'.qa/account-resume');fs.mkdirSync(out,{recursive:true});
const codes=new Map(),realFetch=global.fetch,report={checks:[],errors:[]};let app,browser;
async function main(){
 const probe=http.createServer();await new Promise(ok=>probe.listen(0,'127.0.0.1',ok));const port=probe.address().port;await new Promise(ok=>probe.close(ok));
 const base=`http://127.0.0.1:${port}`;
 Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:path.join(temp,'state.json'),AUTH_ENABLED:'true',AUTH_BASE_URL:base,
  AUTH_SUPABASE_URL:'https://identity.example.test',AUTH_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',AUTH_COOKIE_SECRET:crypto.randomBytes(32).toString('hex')});
 global.fetch=async(url,options={})=>{
  const u=new URL(url);if(u.hostname!=='identity.example.test')return realFetch(url,options);
  const body=JSON.parse(options.body||'{}'),reply=(value,status=200)=>new Response(JSON.stringify(value),{status});
  if(u.pathname==='/auth/v1/token'){
   if(codes.get(body.auth_code)!==crypto.createHash('sha256').update(body.code_verifier).digest('base64url'))return reply({},400);
   codes.delete(body.auth_code);return reply({access_token:'local-access',refresh_token:'local-refresh',expires_in:3600});
  }
  if(u.pathname==='/auth/v1/user')return reply({id:'local-account',is_anonymous:false});
  if(u.pathname.startsWith('/rest/v1/rpc/'))return reply([{id:'local-account',nickname:'Cuenta QA',color:'#d45748',initialized:true}]);
  throw Error('Unexpected provider request '+u.pathname);
 };
 app=require('../backend/server');await app.ready;await new Promise(ok=>app.server.listen(port,'127.0.0.1',ok));
 const game=E.newGame(['Cuenta QA','Rival'],1,Date.now(),{turnSeconds:600});game.phase='play';game.players.forEach(p=>{p.pending=[];p.tickets=[];});E.ensureTiming(game);
 const room={code:'81234567',updated:Date.now(),game,members:game.players.map((p,i)=>({name:p.name,color:p.color,token:(i?'b':'a').repeat(48),...(i?{}:{accountId:'local-account',autopilot:true})}))};
 app.rooms.set(room.code,room);
 browser=await chromium.launch({channel:'chrome',headless:true,args:process.env.CI?['--enable-unsafe-swiftshader']:[]});
 async function page(context){const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>report.errors.push(e.message));return p;}
 const first=await browser.newContext(),a=await page(first);
 await a.route('https://identity.example.test/auth/v1/authorize**',async route=>{
  const u=new URL(route.request().url()),code=crypto.randomUUID();codes.set(code,u.searchParams.get('code_challenge'));
  await route.fulfill({contentType:'text/html',body:`<a href="${base}/auth/callback?code=${code}">Acceder con cuenta de prueba</a>`});
 });
 await a.goto(base+'/rooms?room='+room.code);await a.locator('#joinDialog [data-close-dialog]').click();await a.locator('[data-page="profile"]').click();await a.locator('.profile-nav [data-profile="account"]').click();await a.locator('#googleLogin').click();
 await a.getByText('Acceder con cuenta de prueba').click();
 await a.waitForFunction(()=>typeof seat==='number'&&game?.phase==='play'&&seat===0&&!members[0].autopilot);
 assert.equal(await a.locator('#privateSession').isHidden(),true);
 assert.equal(await a.evaluate(()=>game.hand.length),room.game.players[0].hand.length);
 report.checks.push('Login preserves target room, automatically recovers the owning seat and releases the off-turn replacement bot');
 const second=await browser.newContext({storageState:{cookies:(await first.storageState()).cookies,origins:[]}}),b=await page(second);
 await b.goto(base+'/rooms?room='+room.code);await b.waitForFunction(()=>typeof seat==='number'&&game?.phase==='play'&&seat===0);
 await a.waitForFunction(()=>sessionReplaced);
 const credential=room.members[0].token;await b.reload();await b.waitForFunction(()=>typeof seat==='number'&&game?.phase==='play'&&seat===0);
 assert.equal(room.members[0].token,credential,'reload reuses the current credential');
 assert.equal(await b.locator('#privateSession').isHidden(),true);
 report.checks.push('Authenticated device without local seat credentials recovers automatically; previous device stops; reload does not rotate access');
 await a.locator('#takeOver').click();await a.waitForFunction(()=>!sessionReplaced&&sock.readyState===WebSocket.OPEN&&!!game);
 await b.waitForFunction(()=>sessionReplaced);
 await a.waitForTimeout(400);assert.equal(await a.evaluate(()=>sessionReplaced),false);
 report.checks.push('Explicit take-back recovers a rotated credential without automatic session ping-pong');

 const guest=await browser.newContext(),g=await page(guest);await g.goto(base+'/rooms?room='+room.code);await g.waitForFunction(()=>!!account);
 await g.evaluate(()=>account.ready);assert.equal(await g.evaluate(()=>game),null);
 assert.equal(await g.locator('[data-color="#ffffff"]').count(),0);
 report.checks.push('Guest cannot automatically acquire the account seat; white is absent from the selector');
 await a.screenshot({path:path.join(out,'recovered-seat.png')});assert.deepEqual(report.errors,[]);report.passed=true;
}
main().catch(e=>{report.failure=e.stack;process.exitCode=1;}).finally(async()=>{
 await browser?.close();await app?.shutdown();global.fetch=realFetch;
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));fs.rmSync(temp,{recursive:true,force:true});
});
