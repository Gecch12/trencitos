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
test('map uses gestures without a zoom or fit toolbar on any viewport',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 for(const id of ['zoomtools','zoomin','zoomout','zoomfit','zoomlevel']) {
  assert.ok(!html.includes(id),id);
  assert.ok(!app.includes(`$("${id}")`),id);
 }
 assert.match(html,/Pellizca con dos dedos o usa la rueda/);
 assert.match(app,/addEventListener\("wheel"/);
 assert.match(app,/GameUI\.pinchZoom\(/);
});
test('Docker includes every local server module, without saved rooms',()=>{
 const docker=fs.readFileSync(path.join(ROOT,'Dockerfile'),'utf8');
 for(const file of ['game-clock.js','multiplayer.js','room-store.js','supabase-store.js','durable-queue.js','bots.js','practice.js']) assert.ok(docker.includes(file),file);
 const ignore=fs.readFileSync(path.join(ROOT,'.dockerignore'),'utf8');
 for(const file of ['room-state.json','room-state.json.tmp','room-state.json.bak']) assert.ok(ignore.split('\n').includes(file));
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
  assert.deepEqual([...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(match=>match[1]),['FERROVÍA']);
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
test('static SVG is served safely with right MIME and traversal returns 404',async()=>{
 if(!server.listening)await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 let response=await fetch(base+'/assets/cards/red.svg');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/svg\+xml/);assert.match(await response.text(),/FERROVÍA/);
 response=await fetch(base+'/assets/cards/unknown.svg');assert.equal(response.status,404);
 response=await fetch(base+'/does-not-exist.html');assert.equal(response.status,404);
});
test.after(()=>{if(server.listening)server.close()});
