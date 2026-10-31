"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../engine");
const choose = (g, seat, now, indexes = [0, 1]) => E.action(g, seat, {type: "choose_initial", indexes}, {now, random: () => 0});

test("2–5 players choose privately in any order under one clock; last ready starts the random starter", () => {
  for (let count = 2; count <= 5; count++) {
    const g = E.newGame(Array.from({length: count}, (_,i) => `P${i}`), 1, 100);
    assert.equal(g.events, undefined); // No premature turn bell during setup.
    const all = g.players.flatMap(p => p.pending);
    assert.equal(new Set(all.map(t => t.id)).size, count * 4);
    for (let seat = count - 1; seat >= 0; seat--) {
      const view = E.view(g, seat);
      assert.deepEqual(view.initial, g.players[seat].pending);
      assert.ok(view.players.every(p => !p.pending && !p.tickets && !p.hand));
      assert.equal(view.result, null);
      choose(g, seat, 1000 + count - seat);
      assert.equal(E.view(g, seat).initial, null);
      if (seat) {
        assert.equal(g.phase, "initial");
        assert.equal(g.turnDeadline, 60100);
        assert.throws(() => E.action(g, seat, {type: "draw_train", index: -1}, {now: 2000}), /billetes iniciales/);
      }
    }
    assert.equal(g.phase, "play"); assert.equal(g.current, 1);
    assert.equal(g.turnDeadline, 61000 + count);
    assert.deepEqual(g.events.map(e => [e.type,e.seat]), [["turn",1]]);
  }
});

test("legacy initial saves preserve confirmed tickets and the existing deadline on reconnect", () => {
  const g = E.newGame(["A", "B", "C"], 2, 0);
  choose(g, 0, 1000, [1, 2, 3]);
  const kept = [...g.players[0].tickets];
  delete g.initialDeadline; g.current = 1; g.turnSeat = 1; g.turnDeadline = 80000;
  const restored = JSON.parse(JSON.stringify(g));
  E.ensureTiming(restored, 50000); E.ensureTiming(restored, 60000);
  assert.equal(restored.initialDeadline, 80000);
  assert.equal(restored.current, 2); assert.equal(restored.initialDone, 1);
  assert.equal(E.expire(restored, 79999), false);
  E.expire(restored, 80000, max => max - 1);
  assert.deepEqual(restored.players[0].tickets, kept);
  assert.deepEqual(restored.players.map(p => p.tickets.length), [3,2,2]);
  assert.equal(restored.phase, "play"); assert.equal(restored.current, 2);
  assert.equal(restored.turnDeadline, 140000);
  assert.throws(() => choose(restored, 1, 80000), /turno/);
});

function scoreGame() {
  const g = E.newGame(["Ana", "Beto", "Cora", "Dani"]);
  for (const p of g.players) { p.pending = []; p.tickets = []; }
  g.phase = "play";
  for (const id of [20,16,11,0]) g.routes[id].owner = 0;
  g.routes[6].owner = 1;
  g.players[0].placed = ["BRU", "ROM"]; g.players[0].stations = 1;
  g.players[0].tickets = [E.TICKETS.find(t => t.id === 15), E.TICKETS.find(t => t.a === "COP")];
  g.players.forEach((p,i) => p.score = g.routes.filter(r => r.owner === i).reduce((s,r) => s + E.SCORE[r.n],0));
  return g;
}
test("final details reconcile every score category, destination path and station assignment", () => {
  const g = scoreGame();
  assert.equal(E.view(g, 1).result, null);
  E.finish(g);
  for (const r of g.result) {
    const d = r.details;
    assert.equal(d.routeAdjustment, 0);
    assert.equal(d.routes.reduce((s,r) => s+r.points,0), r.route);
    assert.equal(d.destinations.reduce((s,t) => s+t.points,0), r.destination);
    assert.equal(d.stations.unused * 4, r.stations);
    assert.equal(d.express.points, r.express);
    assert.equal(r.route + r.destination + r.stations + r.express, r.score);
    assert.equal(d.totals.total, r.score);
    assert.equal(new Set(d.express.routes).size, d.express.routes.length);
    assert.equal(d.express.routes.reduce((s,id) => s+g.routes[id].n,0), r.longest);
    d.express.routes.forEach((id,i) => {
      const route = g.routes[id];
      assert.equal(route.owner, r.seat);
      assert.deepEqual(new Set([route.a,route.b]), new Set(d.express.cities.slice(i,i+2)));
    });
  }
  const own = g.result.find(r => r.seat === 0).details;
  assert.equal(own.destinations[0].completed, true);
  assert.deepEqual(own.destinations[0].routes, [20,16,11,6]);
  assert.deepEqual(own.destinations[0].stations, [{city: "BRU",routeId: 6,seat: 0}]);
  assert.equal(own.destinations[1].completed, false);
  assert.equal(own.stations.placed[1].routeId, null);
  assert.ok(!own.express.routes.includes(6));
  assert.deepEqual(E.view(g, 1).result, g.result);
  for (const type of ["claim", "station", "draw_train", "draw_tickets", "choose_initial", "keep_tickets"])
    assert.throws(() => E.action(g, 0, {type}), /terminó/);
});
test("old finished saves gain an audit breakdown without changing the stored scores", () => {
  const g = scoreGame(); E.finish(g);
  const totals = g.result.map(r => r.score);
  for (const r of g.result) delete r.details;
  const view = E.view(JSON.parse(JSON.stringify(g)), 0);
  assert.deepEqual(view.result.map(r => r.score), totals);
  assert.ok(view.result.every(r => r.details));
});
test("longest-route ties award and describe the bonus for every tied player", () => {
  const g = E.newGame(["A", "B"]); g.phase = "play";
  g.players.forEach(p => { p.pending = []; p.tickets = []; });
  const routes = g.routes.filter(r => r.n === 2).slice(0,2);
  routes.forEach((r,i) => { r.owner = i; g.players[i].score = 2; });
  E.finish(g);
  assert.ok(g.result.every(r => r.express === 10 && r.details.express.maximum === 2));
  assert.ok(g.result.every(r => r.details.express.tiedSeats.length === 2));
});
