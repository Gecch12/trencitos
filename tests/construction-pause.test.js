"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),E=require('../backend/engine');
const {pauseForConstruction}=require('../game/application/construction-pause'),{shiftDeadlines}=require('../backend/multiplayer');
function fixture(){const g=E.newGame(['A','B'],0,1000);for(const seat of [0,1])E.action(g,seat,{type:'choose_initial',indexes:[0,1]},{now:1000});return g;}
test('accepted construction pauses all actions and gives the next seat its full turn after the full 1500ms lighting and placement sequence',()=>{
 const g=fixture(),deadline=g.turnDeadline;g.players[1].offer={deadline:20000,tickets:[],id:1};
 pauseForConstruction(g,{id:99,type:'build',seat:1,routeId:0},1000);
 assert.equal(g.construction.until,2500);assert.equal(g.turnDeadline,deadline+1500);assert.equal(g.players[1].offer.deadline,21500);
 assert.throws(()=>E.action(g,0,{type:'draw_train',index:-1},{now:2499}),/construcción/);assert.equal(E.expire(g,2499),false);
 E.action(g,0,{type:'draw_train',index:-1},{now:2500});assert.equal(g.drawCount,1);
 pauseForConstruction(g,{id:99,type:'build',seat:1,routeId:0},2000);assert.equal(g.construction.until,2500);assert.equal(g.turnDeadline,deadline+1500);
});
test('tunnel result already owns the pause, and restoring shifts the cue with the turn',()=>{
 const g=fixture();g.phase='tunnel';g.pending={stage:'result',until:5000};g.turnDeadline=null;
 pauseForConstruction(g,{id:10,type:'build',seat:0,routeId:0},2000);assert.equal(g.pending.until,5000);assert.equal(g.turnDeadline,null);
 shiftDeadlines(g,500);assert.equal(g.construction.until,4000);assert.equal(g.construction.startedAt,2500);assert.equal(g.pending.until,5500);
});
test('construction cues persist and project as public board data, rejecting invalid saved targets',()=>{
 const g=fixture();pauseForConstruction(g,{id:10,type:'build',seat:0,routeId:0},1000);
 assert.deepEqual(E.restoreState(g).construction,g.construction);assert.deepEqual(E.view(g,-1).construction,g.construction);
 const bad=structuredClone(g);bad.construction.routeId='missing';assert.throws(()=>E.restoreState(bad),/route ID/);
});
