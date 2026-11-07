'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../frontend/postgame'),'utf8');
function harness(){
 const nodes=new Map(),frames=new Map(),animations=[],sounds=[];let time=0,nextFrame=0,medals=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},style:{setProperty(){}},classList:{add(){},remove(){}},setAttribute(){},contains:()=>false,focus(){},querySelector:()=>node('caption'),getBoundingClientRect:()=>({left:0,top:0,width:800,height:100})});return nodes.get(id);};
 const reduced={matches:false,addEventListener(){}};
 const context=vm.createContext({I18n:require('../shared/i18n'),ScoreRecount:require('../frontend/score-recount'),ShellIcons:{svg:()=>''},matchMedia:()=>reduced,
  performance:{now:()=>time},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),
  ResizeObserver:class{observe(){}},window:{addEventListener(){}},document:{getElementById:node,createElement:()=>node('recountCounter'),addEventListener(){},body:{...node('body'),append(){}}}});
 vm.runInContext(source+'\nglobalThis.api=Postgame;',context);
 const routes=[{id:'a',a:'A',b:'B',n:2},{id:'b',a:'B',b:'C',n:3}];
 const row={seat:0,name:'Player',route:6,longest:5,destination:-3,express:10,details:{routes:routes.map((r,i)=>({...r,points:i?4:2})),express:{routes:['a','b'],cities:['A','B','C']},destinations:[{id:1,a:'A',b:'C',routes:['a','b'],points:7},{id:2,a:'X',b:'Y',routes:[],points:-10}]}};
 const board={cancelAnimations(){},pauseConstruction(){},setScoreMedals:v=>{medals=v;},animateConstruction:(event,done,options)=>{animations.push({event,done,options});return true;}};
 context.api.setup({landed:()=>sounds.push(time),area:()=>({width:800,height:600}),capture:()=>({}),refresh(){},sync(){},hideResults(){},fit(){},results(){},board:()=>board,routes:()=>routes,geometry:()=>({cells:[{x:20,y:30},{x:40,y:30}]}),city:x=>x,cityPoint:()=>({x:20,y:30})});
 return {api:context.api,node,animations,row,reduced,sounds,medals:()=>medals,
  tick(ms){time+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(time));},land(i=animations.length-1){animations[i].done();}};
}
test('landing updates score and medal while retaining the current route for the reading pause',()=>{
 const h=harness();h.api.start(h.row,'routes');assert.equal(h.node('recountTotal').textContent,0);assert.equal(h.node('caption').textContent,'A — B');
 h.tick(560);assert.equal(h.node('recountTotal').textContent,0,'elapsed time cannot score before the renderer lands');h.land();
 assert.equal(h.node('recountTotal').textContent,2);assert.equal(h.node('caption').textContent,'A — B');assert.equal(h.medals()[0].text,'+2');assert.equal(h.medals()[0].active,true);
 h.tick(100);h.tick(100);assert.equal(h.node('caption').textContent,'A — B');h.tick(40);
 assert.equal(h.node('caption').textContent,'B — C');assert.equal(h.node('recountTotal').textContent,2);
 h.land();assert.equal(h.node('recountTotal').textContent,6);assert.equal(h.node('caption').textContent,'B — C');
 h.node('recountSkip').onclick();assert.equal(h.node('recountTotal').textContent,6,'skip must not count an already landed step twice');
 assert.equal(h.sounds.length,2,'one sound per landed route, none on skip');
});
test('destinations wait for every route, and penalties without wagons finish on skip',()=>{
 const h=harness();h.api.start(h.row,'destinations');h.land(0);assert.equal(h.node('recountTotal').textContent,0);assert.equal(h.sounds.length,0);h.land(1);
 assert.equal(h.node('recountTotal').textContent,7);assert.equal(h.node('caption').textContent,'A — C');h.node('recountSkip').onclick();assert.equal(h.node('recountTotal').textContent,-3);
 assert.equal(h.sounds.length,1,'simultaneous routes share one impact; penalties and skip stay silent');
});
test('pauses preserve the landed step, and callbacks from cancelled runs cannot score a restart',()=>{
 const h=harness();h.api.start(h.row,'express');const stale=h.animations[0].done;h.api.start(h.row,'express');stale();assert.equal(h.node('recountTotal').textContent,0);
 h.land();assert.equal(h.node('recountTotal').textContent,1);h.node('recountPause').onclick();for(let i=0;i<10;i++)h.tick(100);assert.equal(h.node('recountTotal').textContent,1);assert.equal(h.animations.length,2);
 h.node('recountSkip').onclick();assert.equal(h.node('recountTotal').textContent,5);assert.match(h.node('caption').textContent,/Bonificación: \+10/);
 h.reduced.matches=true;h.api.start(h.row,'routes');assert.equal(h.node('recountTotal').textContent,6);
 assert.equal(h.sounds.length,1,'cancelled callbacks and reduced-motion skip never emit leftover impacts');
});
