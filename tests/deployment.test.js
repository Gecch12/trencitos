const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {server}=require('../server');
const ROOT=path.resolve(__dirname,'..');
test('all 12 original SVG card/deck/ticket/favicon files are valid and present',()=>{
 const expected=['red','blue','green','yellow','black','white','orange','purple','wild','back'].map(x=>`assets/cards/${x}.svg`).concat(['assets/ticket.svg','assets/favicon.svg']);
 for(let p of expected){const svg=fs.readFileSync(path.join(ROOT,p),'utf8').trim();assert.match(svg,/^<svg\s/);assert.match(svg,/<\/svg>$/);assert.ok(!/https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg','')))}
});
test('browser HTML references server-served local assets and no third-party scripts',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 assert.ok(html.includes('assets/favicon.svg'));assert.match(app, /["']assets\/cards\/["']/);assert.ok(!/<script[^>]+https?:\/\//.test(html));
});
test('map preserves gestures and does not restore the retired zoom toolbar',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 for(const id of ['zoomtools','zoomin','zoomout','zoomfit','zoomlevel']) {
  assert.ok(!html.includes(id),id);
  assert.ok(!app.includes(`$("${id}")`),id);
 }
 assert.match(html,/Pellizca con dos dedos o usa la rueda/);
 assert.match(app,/addEventListener\("wheel"/);
 assert.match(app,/GameUI\.pinchTransform\(/);
});
test('Docker context excludes local saved rooms, archives and credentials',()=>{
 const ignore=fs.readFileSync(path.join(ROOT,'.dockerignore'),'utf8');
 for(const file of ['room-state.json','room-state.json.tmp','room-state.json.bak','room-state.json.bak.tmp','room-state.json.archive','.env','.env.*','.qa']) assert.ok(ignore.split('\n').includes(file),file);
});
test('rainbow wildcard uses the engraved locomotive; the deck stays text-free',()=>{
 const generator=fs.readFileSync(path.join(ROOT,'make_assets.py'),'utf8');
 for(const name of ['back']){
  const svg=fs.readFileSync(path.join(ROOT,`assets/cards/${name}.svg`),'utf8');
  const source=generator.match(new RegExp(`CUSTOM_${name.toUpperCase()} = '''([\\s\\S]*?)'''`));
  assert.ok(source,`Generator source for ${name}`);
  assert.equal(svg.trim(),source[1].trim());
 }
 const wild=fs.readFileSync(path.join(ROOT,'assets/cards/wild.svg'),'utf8');
 const back=fs.readFileSync(path.join(ROOT,'assets/cards/back.svg'),'utf8');
 assert.match(wild,/id="rainbow-field"/);assert.match(wild,/id="engraved-locomotive"/);
 assert.match(wild,/Locomotora arcoíris · comodín/);assert.match(wild,/id="steam-engraving"/);
 assert.doesNotMatch(wild,/gold-foil|gold-relief|dorada|wagon-/);
 for(const hue of ['#e3474b','#ed913b','#f4d83d','#46966d','#4d85c3','#956dae']) assert.ok(wild.includes(hue));
 assert.doesNotMatch(back,/<text\b|FERROVÍA|EUROPA/);
});
test('eight distinct wagons match route hues and keep color names accessible, not printed',()=>{
 const palette=require('../game-ui').ROUTE_COLORS;
 const names={red:'ROJO',blue:'AZUL',green:'VERDE',yellow:'AMARILLO',black:'NEGRO',white:'BLANCO',orange:'NARANJA',purple:'MORADO'};
 for(const [color,name] of Object.entries(names)){
  const svg=fs.readFileSync(path.join(ROOT,`assets/cards/${color}.svg`),'utf8');
  assert.match(svg,new RegExp(`<rect id="suit-field"[^>]*fill="${palette[color]}"`),color);
  assert.match(svg,new RegExp(`aria-label="Carta ferroviaria ${name}"`));
  assert.match(svg,/<title>Vagón de [^<]+<\/title>/);
  assert.deepEqual([...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(match=>match[1]),['TRENCITOS']);
  for(const detail of [`wagon-${color}`,'rail-ornament']) assert.ok(svg.includes(`id="${detail}"`));
  assert.doesNotMatch(svg,/linearGradient|gold-foil|engraved-locomotive|steam-engraving/,'Regular suits must be wagons, not engines');
 }
 assert.equal(palette.black,'#1c2025');
 assert.notEqual(palette.white,palette.gray);
 const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 assert.match(app,/const C = GameUI\.ROUTE_COLORS;/);
});
test('disabled draw controls preserve suit saturation at eighty percent opacity',()=>{
 const styles=fs.readFileSync(path.join(ROOT,'style.css'),'utf8');
 const gameStyles=fs.readFileSync(path.join(ROOT,'game.css'),'utf8');
 const disabled=styles.match(/\.market \.traincard:disabled\{([^}]+)\}/)[1];
 assert.match(disabled,/opacity:\.8;/);assert.doesNotMatch(disabled,/grayscale/);
 assert.match(gameStyles,/\.game \.train-deck:disabled, \.game \.destination-deck:disabled \{ opacity: \.8;/);
});
test('runtime assets load through HTML, JavaScript imports and CSS references',async t=>{
 if(!server.listening)await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const base='http://127.0.0.1:'+server.address().port,visited=new Set(),queue=['/','/privacy.html'];
 const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 // Card URLs are assembled dynamically; HTML/import/CSS references are traversed below.
 queue.push(...require('../data').COLORS.concat(['wild','back']).map(color=>`/assets/cards/${color}.svg`),'/assets/ticket.svg');
 while(queue.length){
  const url=new URL(queue.shift(),base);if(visited.has(url.href))continue;visited.add(url.href);
  assert.equal(url.origin,base,'runtime resources must stay local');
  const response=await fetch(url);assert.equal(response.status,200,url.pathname);
  const body=await response.text(),type=response.headers.get('content-type');assert.ok(body.length>0,url.pathname);
  const extension=path.extname(url.pathname),mime={'.js':'javascript','.mjs':'javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[extension]||'text/html';
  assert.ok(type.includes(mime),`${url.pathname}: ${type}`);
  const references=type.includes('text/html')?[...body.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)].map(m=>m[1]):
   type.includes('javascript')?[...body.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(m=>m[1]||m[2]):
   type.includes('text/css')?[...body.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)].map(m=>m[1]):[];
  for(const reference of references)if(!reference.startsWith('#')&&!reference.startsWith('data:'))queue.push(new URL(reference,url).href);
 }
 t.diagnostic(`Loaded ${visited.size} runtime resources: ${[...visited].map(url=>new URL(url).pathname).join(', ')}`);
});
test('static SVG is served safely with right MIME and traversal returns 404',async()=>{
 if(!server.listening)await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 let response=await fetch(base+'/assets/cards/red.svg');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/svg\+xml/);assert.match(await response.text(),/TRENCITOS/);
 response=await fetch(base+'/assets/cards/unknown.svg');assert.equal(response.status,404);
 response=await fetch(base+'/privacy.html');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);
 response=await fetch(base+'/privacy.css');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/css/);
 response=await fetch(base+'/does-not-exist.html');assert.equal(response.status,404);
 for(const file of ['/account-auth.js','/account-seats.js','/supabase/002_identity.sql','/engine.js','/game/domain/payment.js','/game/queries/match-view.js','/match-archive.js','/package.json','/.env','/room-state.json']) assert.equal((await fetch(base+file)).status,404);
 response=await fetch(base+'/practice-bot.js');assert.equal(response.status,404);
 response=await fetch(base+'/practice-planner.js');assert.equal(response.status,404);
 response=await fetch(base+'/practice-tactics.js');assert.equal(response.status,404);
 response=await fetch(base+'/practice-search.js');assert.equal(response.status,404);
 for(const file of ['/board-3d.js','/wagon-renderer.js','/wagon-preview.js','/wagon-models.mjs','/board-camera.js','/vendor/three.module.js','/vendor/three.core.js']) {
  response=await fetch(base+file);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);
  assert.ok((await response.text()).length>100);
 }
 for(const file of ['/node_modules/three/package.json','/vendor/three.cjs','/tests/helpers/threejs-preview.js']) {
  response=await fetch(base+file);assert.equal(response.status,404);
 }
});
test.after(()=>{if(server.listening)server.close()});
