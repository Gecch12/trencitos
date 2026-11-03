"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const crypto = require("node:crypto"), E = require("../engine");
const random = seed => max => { seed = (Math.imul(seed,1664525)+1013904223)>>>0;return Math.floor(seed/4294967296*max); };
const act = (g,seat,msg,now) => E.action(g,seat,msg,{now,random:()=>0});
function ready() {
  const g=E.newGame(["A","B","C"],1,0,null,{random:random(10)});
  for(const seat of [2,0,1])act(g,seat,{type:"choose_initial",indexes:[0,1]},100);
  return g;
}

test("optional setup randomness reproduces complete states including market renewal without global RNG", t => {
  t.mock.method(crypto,"randomInt",()=>{throw Error("ambient randomness");});
  for(const count of [2,3,4,5]) {
    const names=Array.from({length:count},(_,i)=>`P${i}`);
    assert.deepEqual(E.newGame(names,1,123,null,{random:random(count)}),E.newGame(names,1,123,null,{random:random(count)}));
  }
  const g=E.newGame(["A","B"],0,123,null,{random:max=>max-1});
  assert.ok(g.events.some(e=>e.type==="market_refresh"));
  assert.ok(g.face.filter(c=>c==="wild").length<3);
  assert.equal(g.face.length+g.deck.length+g.players.reduce((sum,p)=>sum+p.hand.length,0),110);
  assert.equal(g.initialDeadline,60123);
  let starts=0;
  const randomized=E.newRandomGame(["A","B","C"],123,bound=>{starts++;assert.equal(bound,3);return 2;},null,{random:random(12)});
  assert.equal(starts,1);assert.equal(randomized.first,2);
});

test("setup rejects before consuming RNG and preserves legacy error messages", () => {
  const options={random:()=>{throw Error("unexpected random draw");}};
  assert.throws(()=>E.newGame(["A"],-1,0,null,options),/^Error: Se requieren 2–5 jugadores\.$/);
  assert.throws(()=>E.newGame(["A","B"],2,0,null,options),/^Error: Primer jugador inválido\.$/);
});

test("initial rejections leave play while later rejections return, retaining array and ticket references", () => {
  const g=E.newGame(["A","B"],0,0,null,{random:random(2)}),deck=g.shortDeck;
  const rejected=g.players.flatMap(p=>p.pending.slice(2));
  for(const seat of [1,0])act(g,seat,{type:"choose_initial",indexes:[1,0]},100);
  assert.equal(g.shortDeck,deck);assert.ok(rejected.every(t=>!deck.includes(t)));
  const held=g.players[0].tickets;
  act(g,0,{type:"draw_tickets"},200);const offer=g.players[0].offer;
  act(g,0,{type:"keep_tickets",offerId:offer.id,indexes:[2,0]},300);
  assert.equal(g.players[0].tickets,held);assert.equal(g.shortDeck,deck);
  assert.deepEqual(held.slice(-2),[offer.tickets[2],offer.tickets[0]]);
  assert.equal(deck.at(-1),offer.tickets[1]);assert.equal(g.current,1);
});

test("missing or stale offer IDs cannot select tickets and rejection leaves the entire state intact", () => {
  const g=ready();act(g,1,{type:"draw_tickets"},200);
  const before=structuredClone(g),id=g.players[1].offer.id;
  for(const offerId of [undefined,String(id),id+1]) {
    assert.throws(()=>act(g,1,{type:"keep_tickets",offerId,indexes:[0]},300),/ya no está pendiente/);
    assert.deepEqual(g,before);
  }
});

test("forced closing resolves each offer with supplied randomness before scoring", t => {
  const g=ready();act(g,1,{type:"draw_tickets"},200);act(g,2,{type:"draw_tickets"},300);
  const offers=g.players.map(p=>p.offer),bounds=[];
  t.mock.method(crypto,"randomInt",()=>{throw Error("ambient randomness");});
  E.finish(g,true,{random:max=>{bounds.push(max);return max-1;}});
  assert.deepEqual(bounds,[3,3]);assert.equal(g.phase,"finished");
  for(const seat of [1,2]) {
    assert.equal(g.players[seat].tickets.at(-1),offers[seat].tickets[2]);
    assert.equal(g.players[seat].offer,null);
  }
  assert.equal(g.logs.filter(log=>log.startsWith("Partida finalizada")).length,1);
});
