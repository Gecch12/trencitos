"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../backend/engine");

test("blind draw color is private to its recipient in every seat's serialized view", () => {
  const g = E.newGame(["A", "B", "C", "D", "E"]);
  g.phase = "play";
  const color = g.deck.at(-1);
  E.action(g, 0, { type: "draw_train", index: -1 });
  for (let seat = 0; seat < 5; seat++) {
    const view = JSON.parse(JSON.stringify(E.view(g, seat)));
    assert.equal(view.uiVersion, 10);
    assert.deepEqual(view.drawEvent, { id: 1, seat: 0, index: -1, ...(seat === 0 ? { color } : {}) });
    assert.equal(view.lastDraw, undefined);
    assert.ok(view.players.every(p => p.hand === undefined));
  }
});
test("public colors are shared, accepted draws advance IDs, rejected actions and views do not", () => {
  const g = E.newGame(["A", "B"]); g.phase = "play";
  const color = g.face[0];
  E.action(g, 0, { type: "draw_train", index: 0 });
  const first = { ...g.lastDraw };
  assert.deepEqual(E.view(g, 1).drawEvent, { id: 1, seat: 0, index: 0, color });
  assert.throws(() => E.action(g, g.current, { type: "draw_train", index: 99 }));
  assert.deepEqual(g.lastDraw, first);
  E.view(g, 0); E.view(g, 1);
  assert.equal(g.drawSerial, 1);
  const seat = g.current;
  E.action(g, seat, { type: "draw_train", index: -1 });
  assert.equal(g.lastDraw.id, 2);
  assert.equal(g.lastDraw.seat, seat);
});
test("legacy saved games get draw events without requiring an initialized counter", () => {
  const g = E.newGame(["A", "B"]); g.phase = "play";
  delete g.drawSerial; delete g.lastDraw;
  assert.equal(E.view(g, 0).drawEvent, null);
  E.action(g, 0, { type: "draw_train", index: -1 });
  assert.equal(g.lastDraw.id, 1);
});
test("history keeps each drawn card across saves without exposing blind colors to other seats", () => {
  const g = E.newGame(["A", "B"]); g.phase = "play";
  g.deck = ["blue", "orange"]; g.face = ["red", "blue", "green", "white", "yellow"];
  E.action(g, 0, {type:"draw_train", index:-1});
  E.action(g, 0, {type:"draw_train", index:0});
  const saved = JSON.parse(JSON.stringify(g));
  for (const seat of [-1, 0, 1]) {
    const entries = E.view(saved, seat).history.filter(e=>e.draw);
    assert.deepEqual(entries.map(e=>e.draw), [{index:0,color:"red"},{index:-1,...(seat===0?{color:"orange"}:{})}]);
  }
  assert.equal(saved.history[1].draw.color,"orange");
});
test("renewal evidence contains the triggering public market and replacement, exactly once", () => {
  const g = E.newGame(["A", "B"]); g.phase = "play"; g.events=[];
  g.face=["wild","wild","red","blue","green"];g.deck=["yellow","purple","black","white","wild"];
  E.action(g,0,{type:"draw_train",index:2});
  const refresh = g.events.filter(e=>e.type==="market_refresh");
  assert.equal(refresh.length,1);
  assert.deepEqual(refresh[0].before,["wild","wild","wild","blue","green"]);
  assert.deepEqual(refresh[0].after,g.face);
  for (const seat of [-1,0,1]) assert.deepEqual(E.view(g,seat).events.find(e=>e.type==="market_refresh"),refresh[0]);
  E.action(g,0,{type:"draw_train",index:-1});
  assert.equal(g.events.filter(e=>e.type==="market_refresh").length,1);
});
test("Madrid–Dieppe completes through Pamplona, Paris and Bruxelles, without a station", () => {
  const g = E.newGame(["A", "B", "C", "D"]); g.phase = "play";
  for (const id of [20, 16, 11]) g.routes[id].owner = 0;
  g.routes[7].owner = 2; // Direct Dieppe–Paris belongs to a rival; the detour is valid.
  g.players[0].tickets = [E.TICKETS.find(t => t.a === "MAD" && t.b === "DIE")];
  assert.deepEqual(E.view(g, 0).ticketProgress, [{ id: 15, completed: false, viaStation: false }]);
  g.players[0].hand = ["green", "green"];
  E.action(g, 0, { type: "claim", routeId: 6, color: "green", wildCount: 0 });
  assert.deepEqual(E.view(g, 0).ticketProgress, [{ id: 15, completed: true, viaStation: false }]);
  assert.deepEqual(E.view(g, 0).ticketPaths, [{ id: 15, routes: [20, 16, 11, 6], stationRoutes: [], stations: [] }]);
  assert.equal(g.players[0].score, 2); // Destination points are still scored only at the end.
  assert.deepEqual(E.view(g, 1).ticketProgress, []);
  assert.deepEqual(E.view(g, 1).ticketPaths, []);
});

test("completed path identifies the borrowed station leg and ignores unrelated branches", () => {
  const g = E.newGame(["A", "B", "C", "D"]);
  for (const id of [20, 16, 11]) g.routes[id].owner = 0;
  g.routes[6].owner = 1;
  g.players[0].placed = ["BRU"];
  g.players[0].tickets = [E.TICKETS.find(t => t.id === 15)];
  const view = E.view(g, 0);
  assert.deepEqual(view.ticketProgress, [{ id: 15, completed: true, viaStation: true }]);
  assert.deepEqual(view.ticketPaths, [{ id: 15, routes: [20, 16, 11, 6], stationRoutes: [6], stations: [{city: "BRU", routeId: 6, seat: 0}] }]);
  assert.deepEqual(E.connectionPath(g.routes.filter(r => r.owner === 0), "MAD", "DIE"), []);
});

test("sound events are emitted once per accepted build or ticket offer, never per piece or rejection", () => {
  const g = E.newGame(["A", "B", "C", "D"]); g.phase = "play";
  g.players[0].hand = ["green", "green"];
  E.action(g, 0, { type: "claim", routeId: 6, color: "green", wildCount: 0 });
  const builds = () => g.events.filter(e => e.type === "build");
  assert.equal(builds().length, 1);
  assert.equal(builds()[0].routeId, 6);
  assert.throws(() => E.action(g, 1, { type: "claim", routeId: 6, color: "green" }));
  assert.equal(builds().length, 1);
  g.players[1].hand = ["red"];
  E.action(g, 1, { type: "station", city: "MAD", color: "red", wildCount: 0 });
  assert.equal(builds().length, 2);
  assert.equal(builds()[1].city, "MAD");
  E.action(g, 2, { type: "draw_tickets" });
  const tickets = E.view(g, 0).events.filter(e => e.type === "tickets");
  assert.equal(tickets.length, 1);
  assert.deepEqual(Object.keys(tickets[0]).sort(), ["id", "seat", "type"]);
});
