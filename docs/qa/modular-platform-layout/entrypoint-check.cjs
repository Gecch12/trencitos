const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process'),{once}=require('node:events'),assert=require('node:assert/strict');
const {connect}=require('../../../tests/helpers/ws-client');
const root=path.resolve(__dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-layout-entry-'));
const {createHash}=require('node:crypto');
let child,peer;const report={node:process.version,checks:[],base_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),source_sha256:Object.fromEntries(['server.js','backend/server.js','backend/public-assets.js','backend/room-store.js'].map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))};
(async()=>{
 const runtime=path.join(temp,'runtime'),foreign=path.join(temp,'working-directory');fs.mkdirSync(runtime);fs.mkdirSync(foreign);
 for(const name of ['server.js','backend','shared','game','frontend'])fs.cpSync(path.join(root,name),path.join(runtime,name),{recursive:true});
 const reserve=net.createServer();await new Promise(ok=>reserve.listen(0,'127.0.0.1',ok));const port=reserve.address().port;await new Promise(ok=>reserve.close(ok));
 const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>['PATH','HOME','TMPDIR','LANG'].includes(k)));
 Object.assign(env,{PORT:String(port),STATE_BACKEND:'file',AUTH_ENABLED:'false',NODE_ENV:'test'});
 child=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:foreign,env,stdio:['ignore','pipe','pipe']});let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 let health;for(let i=0;i<100;i++){try{health=await fetch(`http://127.0.0.1:${port}/healthz`);if(health.ok)break;}catch{}await new Promise(ok=>setTimeout(ok,50));}
 assert.equal(health?.status,200,logs);assert.equal((await health.json()).storage,'file');
 report.checks.push('Root CLI starts from a foreign working directory with an isolated default file backend');
 peer=await connect(port);peer.send({type:'create',name:'Layout'});const lobby=await peer.next('lobby');
 const state=JSON.parse(fs.readFileSync(path.join(runtime,'room-state.json'),'utf8'));assert.ok(state.rooms.some(r=>r.code===lobby.code));
 assert.equal(fs.existsSync(path.join(foreign,'room-state.json')),false);assert.equal(fs.existsSync(path.join(runtime,'backend/room-state.json')),false);
 report.checks.push('A durable room is written beside the root entry point, never in backend/ or the caller directory');
 assert.match(await (await fetch(`http://127.0.0.1:${port}/app.js`)).text(),/GameUI/);
 report.checks.push('Public URLs resolve from the copied runtime independently of cwd');report.passed=true;
})().catch(e=>{report.failure=e.stack;process.exitCode=1;}).finally(async()=>{
 peer?.close();if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}
 fs.rmSync(temp,{recursive:true,force:true});report.completed_at=new Date().toISOString();
 fs.writeFileSync(path.join(root,'docs/qa/modular-platform-layout/entrypoint-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
});
