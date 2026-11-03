"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("../engine");
function ready() {
  const g=E.newGame(["A","B"],0,0,null,{random:()=>0});
  for(const seat of [0,1])E.action(g,seat,{type:"choose_initial",indexes:[0,1]},{now:0,random:()=>0});
  return g;
}

test("all three station costs spend once, retain containers and emit one build/turn", () => {
  const g=ready(),p=g.players[0],placed=p.placed,hand=p.hand;
  hand.splice(0,hand.length,...Array(6).fill("blue"));
  for(const [i,city] of ["PAR","ROM","BER"].entries()) {
    const now=100+i*100;g.current=0;E.ensureTiming(g,now);
    const serial=g.turnSerial,events=g.eventSerial,remaining=p.hand.length,score=p.score,trains=p.trains;
    E.action(g,0,{type:"station",city,color:"blue",wildCount:0},{now,random:()=>0});
    assert.equal(p.hand.length,remaining-i-1);assert.equal(p.stations,2-i);
    assert.equal(p.placed,placed);assert.equal(p.hand,hand);assert.equal(p.score,score);assert.equal(p.trains,trains);
    assert.equal(g.turnSerial,serial+1);assert.equal(g.current,1);
    assert.deepEqual(g.events.filter(e=>e.id>events).map(e=>e.type),["build","turn"]);
  }
});

test("unavailable cities and impossible station payments reject the entire action before spending", () => {
  for(const [change,city,color,wildCount,message] of [
    [()=>{},"missing","blue",0,/estación ahí/],
    [()=>{},"constructor","blue",0,/estación ahí/],
    [g=>g.players[1].placed.push("PAR"),"PAR","blue",0,/estación ahí/],
    [g=>g.players[0].stations=0,"PAR","blue",0,/estación ahí/],
    [()=>{},"PAR","invalid",0,/Cartas insuficientes/],
    [()=>{},"PAR","blue",1,/Cartas insuficientes/],
  ]) {
    const g=ready();g.players[0].hand=["blue"];change(g);const before=structuredClone(g);
    assert.throws(()=>E.action(g,0,{type:"station",city,color,wildCount},{now:100,random:()=>{throw Error("unexpected random");}}),message);
    assert.deepEqual(g,before);
  }
});

test("a late station action retains the timeout draws and cannot build on the old turn", () => {
  const g=ready(),count=g.players[0].hand.length;
  assert.throws(()=>E.action(g,0,{type:"station",city:"PAR",color:"blue"},{now:60000,random:()=>0}),/turno/);
  assert.equal(g.players[0].hand.length,count+2);assert.equal(g.current,1);
  assert.deepEqual(g.players[0].placed,[]);assert.equal(g.players[0].stations,3);
});

test("legacy result hydration preserves recorded scores, rank, winners, tickets and existing details", () => {
  const g=ready();g.routes[0].owner=0;g.players[0].score=E.SCORE[g.routes[0].n];E.finish(g);
  const result=g.result.find(r=>r.seat===0);result.route+=6;result.score+=6;result.winner=!result.winner;delete result.details;
  const other=g.result.find(r=>r.seat===1),existing=other.details,order=g.result.map(r=>r.seat);
  const saved=structuredClone(g.result);
  E.view(g,-1);
  assert.deepEqual(g.result.map(r=>r.seat),order);assert.equal(other.details,existing);
  for(let i=0;i<saved.length;i++) {
    const {details,...actual}=g.result[i],{details:oldDetails,...expected}=saved[i];
    assert.deepEqual(actual,expected);
  }
  assert.equal(result.details.routeAdjustment,6);
  assert.equal(result.details.totals.total,result.score);
  assert.equal(result.tickets,g.players[0].tickets);
});

test("destination calculations stay private until finishing, including a pending closing offer", () => {
  const g=ready();g.finalRemaining=1;
  E.action(g,0,{type:"draw_tickets"},{now:100,random:()=>0});
  assert.equal(g.phase,"closing");
  for(const seat of [-1,0,1]) {
    const view=E.view(g,seat);assert.equal(view.result,null);
    assert.ok(view.players.every(p=>!Object.hasOwn(p,"tickets")));
    if(seat===-1)assert.deepEqual(view.ticketPaths,[]);
    else assert.deepEqual(view.ticketPaths.map(t=>t.id),g.players[seat].tickets.map(t=>t.id));
  }
  E.action(g,0,{type:"keep_tickets",offerId:g.players[0].offer.id,indexes:[0]},{now:200,random:()=>0});
  assert.equal(g.phase,"finished");assert.equal(g.result.length,2);
});
