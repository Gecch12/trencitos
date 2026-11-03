"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../backend/engine'),{createLegacyAuthorizedViews}=require('../game/compat/legacy-authorized-views');
const {createReplayAnalysis}=require('../game/queries/replay-analysis');
const {createMatchArchive}=require('../backend/match-archive');
function fixture(){const game=E.newGame(['A','B','C','D'],0,0,null,{mapRef:{id:'south-america',version:'3.3-beta'}});game.phase='play';game.players.forEach(p=>{p.pending=[];p.tickets=[];p.score=0;});const room={game,members:game.players.map(p=>({name:p.name,color:p.color})),code:'ANALYSIS'};return {game,room,state:()=>({game, ...createLegacyAuthorizedViews().recording(room)})};}
test('analysis reads exact historical ticket and station progress; projected totals agree with final domain scoring',()=>{
 const f=fixture(),g=f.game;g.players[0].tickets=[{id:'test',a:'CTG',b:'MDE',p:8,long:false}];
 const r=g.routes.find(r=>r.id==='SA001');r.owner=1;g.players[0].placed=['CTG'];g.players[0].stations=2;g.players[1].score=2;g.players[1].trains-=2;
 const state=f.state(),before=JSON.stringify(state),analyze=createReplayAnalysis({full:true}),result=analyze(state);
 assert.equal(result.players[0].completed,1);assert.equal(result.players[0].completedPoints,8);assert.equal(result.players[0].longest,0);assert.equal(result.players[1].longest,2);
 E.finish(g,true);for(const score of g.result)assert.equal(result.players[score.seat].projectedScore,score.score);
 assert.equal(JSON.stringify({...state,game:JSON.parse(before).game}),before);
});
test('public analysis exposes resources and networks, never private destinations or projected totals',()=>{
 const f=fixture();f.game.players[0].tickets=[{id:'secret-ticket',a:'CTG',b:'MDE',p:8}];
 const result=createReplayAnalysis({full:false})(f.state()),p=result.players[0];
 for(const key of ['completed','completedPoints','pendingPoints','projectedScore','completedIds'])assert.equal(Object.hasOwn(p,key),false);
 assert.ok(!JSON.stringify(result).includes('secret-ticket'));assert.equal(p.tickets,1);
});
test('milestones track completion, construction, ties and decline once, without inventing legacy stats',()=>{
 const f=fixture(),g=f.game,analyze=createReplayAnalysis({full:true});g.players[0].tickets=[{id:'journey',a:'CTG',b:'MDE',p:8}];analyze(f.state());
 g.routes.find(r=>r.id==='SA001').owner=0;(g.events??=[]).push({id:50,type:'build',seat:0,routeId:'SA001'});
 let next=analyze(f.state());assert.ok(next.milestones.some(m=>m.type==='construction'));assert.ok(next.milestones.some(m=>m.type==='ticket_completed'));assert.ok(next.milestones.some(m=>m.type==='longest_leader'));
 assert.deepEqual(analyze(f.state()).milestones,[]);
 g.routes.find(r=>r.owner===null&&r.n===2).owner=1;next=analyze(f.state());assert.ok(next.milestones.some(m=>m.type==='longest_tie'));
 const old=f.state();delete old.definition;old.views[1].ticketProgress=undefined;
 const partial=createReplayAnalysis({full:true})(old);assert.equal(partial.players[0].completed,null);assert.equal(partial.players[0].projectedScore,null);
});
