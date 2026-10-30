const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {server}=require('../server');
const ROOT=path.resolve(__dirname,'..');
test('all 11 original SVG card/deck/ticket/favicon files are valid and present',()=>{
 const expected=['red','blue','green','yellow','black','white','orange','purple','wild','back'].map(x=>`assets/cards/${x}.svg`).concat(['assets/ticket.svg','assets/favicon.svg']);
 for(let p of expected){const svg=fs.readFileSync(path.join(ROOT,p),'utf8');assert.match(svg,/^<svg\s/);assert.match(svg,/<\/svg>$/);assert.ok(!/https?:\/\//.test(svg.replace('http://www.w3.org/2000/svg','')))}
});
test('browser HTML references server-served local assets and no third-party scripts',()=>{
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
 assert.ok(html.includes('assets/favicon.svg'));assert.match(app, /["']assets\/cards\/["']/);assert.ok(!/<script[^>]+https?:\/\//.test(html));
});
test('static SVG is served safely with right MIME and traversal returns 404',async()=>{
 if(!server.listening)await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
 let response=await fetch(base+'/assets/cards/red.svg');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/svg\+xml/);assert.match(await response.text(),/FERROVÍA/);
 response=await fetch(base+'/assets/cards/unknown.svg');assert.equal(response.status,404);
 response=await fetch(base+'/does-not-exist.html');assert.equal(response.status,404);
});
test.after(()=>{if(server.listening)server.close()});
