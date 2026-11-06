'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('../backend/player-statistics'),Recount=require('../frontend/score-recount');
const row=(completed,count,i=0)=>({score:{score:20,completed,...(count==null?{}:{tickets:Array(count).fill({})})},match:{id:String(i),closedAt:i+1,map:'Europa',mapRef:{id:'europe'},players:[{}]},seat:0});
test('destination percentages give each valid finished game equal weight',()=>{
 const s=summarize([row(4,4),row(0,8,1),row(1,null,2),row(0,0,3),row(9,2,4)]);
 assert.equal(s.destinationAverage,50);assert.equal(s.destinationSample,2);assert.equal(s.trend[1].destinationRate,0);assert.equal(s.trend[2].destinationRate,null);
 assert.equal(summarize([row(4,4),row(0,4,1)]).destinationAverage,50);
 assert.equal(summarize([]).destinationAverage,null);
});
test('recounts preserve stored totals, connected routes, borrowed destinations and longest direction',()=>{
 const routes=[{id:'a',a:'X',b:'Y',n:2},{id:'c',a:'P',b:'Q',n:1},{id:'b',a:'Y',b:'Z',n:3}];
 const result={route:9,longest:5,destination:-6,express:10,details:{routes:routes.map(r=>({...r,points:r.n===3?4:r.n})),routeAdjustment:2,express:{routes:['b','a'],cities:['Z','Y','X']},destinations:[{id:1,a:'X',b:'Z',routes:['a','b'],stationRoutes:['b'],completed:true,points:4},{id:2,a:'X',b:'Q',routes:[],stationRoutes:[],completed:false,points:-10}]}};
 const a=Recount.plan(result,'routes',routes);assert.deepEqual(a.steps.flatMap(s=>s.routes),['a','b','c']);assert.equal(a.steps.reduce((n,s)=>n+s.points,0),9);
 const b=Recount.plan(result,'express',routes);assert.deepEqual(b.steps.map(s=>s.cell),[2,1,0,1,0]);assert.equal(b.total,5);assert.equal(b.bonus,10);
 const c=Recount.plan(result,'destinations',routes);assert.deepEqual(c.steps[0].borrowed,['b']);assert.deepEqual(c.steps[1].routes,[]);assert.equal(c.steps.reduce((n,s)=>n+s.points,0),-6);
 const legacy=Recount.plan({route:42},'routes',routes);assert.equal(legacy.total,42);assert.equal(legacy.available,false);assert.deepEqual(legacy.steps,[]);
});
