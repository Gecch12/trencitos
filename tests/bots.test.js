"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../engine");
const { chooseBotAction } = require("../bots");

const first = () => 0;
function random(seed = 42) {
  return (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
}
function route(overrides = {}) {
  return { id: 0, a: "PAR", b: "BRU", n: 2, color: "red", tunnel: false, ferry: 0, owner: null, ...overrides };
}
function fixture(routes = [route()]) {
  const game = Engine.newGame(["Humano", "Bot 1", "Bot 2", "Bot 3"], 1);
  game.phase = "play";
  game.routes = routes;
  game.players.forEach((p) => { p.hand = []; p.tickets = []; });
  game.deck = ["blue", "green", "yellow", "black", "white", "orange"];
  game.discard = [];
  game.face = ["red", "blue", "wild", "purple", "white"];
  return game;
}

test("bots choose two to four distinct initial tickets without mutating the game", () => {
  const game = Engine.newGame(["Humano", "Bot 1", "Bot 2", "Bot 3"], 1);
  const before = JSON.stringify(game);
  const action = chooseBotAction(game, 1, random());
  assert.equal(JSON.stringify(game), before);
  assert.equal(action.type, "choose_initial");
  assert.equal(new Set(action.indexes).size, action.indexes.length);
  assert.ok(action.indexes.length >= 2 && action.indexes.length <= 4);
  Engine.action(game, 1, action);
  assert.equal(game.players[1].tickets.length, action.indexes.length);
  assert.equal(game.current, 1);
  assert.equal(chooseBotAction(game, 1), null);
  assert.equal(chooseBotAction(game, 2).type, "choose_initial");
});

test("practice bots vary between worthwhile routes and saving, conserving locomotives when building", () => {
  const game = fixture([route(), route({ id: 1, a: "MAD", b: "BAR", color: "gray" })]);
  game.players[1].hand = ["red", "red", "blue", "blue", "wild", "wild"];
  const seen = new Set();
  let draws = 0;
  const rng = random();
  for (let i = 0; i < 60; i++) {
    const copy = structuredClone(game);
    const action = chooseBotAction(copy, 1, rng);
    if (action.type === "draw_train") {
      draws++; Engine.action(copy, 1, action); continue;
    }
    seen.add(action.routeId);
    assert.equal(action.type, "claim");
    assert.equal(action.wildCount, 0);
    Engine.action(copy, 1, action);
    assert.equal(copy.routes[action.routeId].owner, 1);
    assert.equal(copy.players[1].trains, 43);
  }
  assert.deepEqual([...seen].sort(), [0, 1]);
  assert.ok(draws > 0 && draws < 60);
});

test("ferries require locomotives and gray routes cannot mix regular colors", () => {
  const game = fixture([route({ color: "gray", ferry: 1 })]);
  game.players[1].hand = ["red", "red", "blue"];
  assert.equal(chooseBotAction(game, 1, first).type, "draw_train");
  game.players[1].hand.push("wild");
  const action = chooseBotAction(game, 1, first);
  assert.equal(action.type, "claim");
  assert.equal(action.wildCount, 1);
  Engine.action(game, 1, action);
  assert.equal(game.routes[0].owner, 1);
  const gray = fixture([route({ color: "gray" })]);
  gray.players[1].hand = ["red", "blue"];
  assert.equal(chooseBotAction(gray, 1, first).type, "draw_train");
});

test("bots respect occupied routes, trains and double-route blocking", () => {
  const game = fixture([route({ owner: 0 }), route({ id: 1 })]);
  game.players[1].hand = ["red", "red"];
  // Four players may use the other half, but never their own parallel route.
  assert.equal(chooseBotAction(game, 1, first).routeId, 1);
  game.routes[0].owner = 1;
  assert.equal(chooseBotAction(game, 1, first).type, "draw_train");
  game.routes[0].owner = 0;
  game.players.pop();
  assert.equal(chooseBotAction(game, 1, first).type, "draw_train");
  game.routes = [route()];
  game.players[1].trains = 1;
  assert.equal(chooseBotAction(game, 1, first).type, "draw_train");
});

test("a draw turn finishes both draws and excludes a visible locomotive on the second", () => {
  const game = fixture([]);
  game.face = ["wild", "blue"];
  Engine.action(game, 1, chooseBotAction(game, 1, first));
  assert.equal(game.drawCount, 1);
  assert.equal(game.current, 1);
  const action = chooseBotAction(game, 1, (max) => max - 1);
  assert.equal(action.index, 1);
  Engine.action(game, 1, action);
  assert.equal(game.current, 2);
  assert.equal(game.players[1].hand.length, 2);
});

test("a visible locomotive ends the turn; an exhausted deck falls back to visible cards", () => {
  const game = fixture([]);
  game.deck = game.discard = [];
  game.face = ["wild", "blue"];
  const action = chooseBotAction(game, 1, first);
  assert.equal(action.index, 0);
  Engine.action(game, 1, action);
  assert.equal(game.current, 2);
  assert.deepEqual(game.players[1].hand, ["wild"]);
});

test("tunnel surcharge is paid only after reserving the base payment", () => {
  for (const canAfford of [true, false]) {
    const game = fixture([route({ tunnel: true })]);
    game.players[1].hand = ["red", "red", ...(canAfford ? ["wild"] : [])];
    game.deck = ["blue", "green", "red"];
    // Exercise settlement independently: the improved policy may save a
    // reserve before attempting this tunnel in the first place.
    Engine.action(game, 1, { type: "claim", routeId: 0, color: "red", wildCount: 0 });
    assert.equal(game.phase, "tunnel");
    assert.equal(game.pending.surcharge, 1);
    const action = chooseBotAction(game, 1, first);
    assert.equal(action.type, canAfford ? "pay_tunnel" : "decline_tunnel");
    Engine.action(game, 1, action);
    assert.equal(game.routes[0].owner, canAfford ? 1 : null);
    assert.equal(game.players[1].hand.length, canAfford ? 0 : 2);
    assert.equal(game.phase, "play");
    assert.equal(game.current, 2);
  }
});

test("all-locomotive tunnels, including a zero surcharge, resolve legally", () => {
  for (const surcharge of [0, 1]) {
    const game = fixture([route({ tunnel: true })]);
    game.players[1].hand = ["wild", "wild", "wild"];
    game.deck = ["blue", "green", surcharge ? "wild" : "red"];
    Engine.action(game, 1, chooseBotAction(game, 1, first));
    if (surcharge) Engine.action(game, 1, chooseBotAction(game, 1, first));
    assert.equal(game.routes[0].owner, 1);
    assert.equal(game.current, 2);
  }
});

test("bots yield when available stations and destination draws have no strategic value", () => {
  const game = fixture([]);
  game.deck = game.discard = game.face = [];
  game.players[1].hand = ["red", "red", "red"];
  assert.ok(Engine.possibleStation(game, 1));
  assert.ok(game.shortDeck.length);
  assert.equal(chooseBotAction(game, 1), null);
});

test("complete simulated games preserve cards and reach final-round scoring", () => {
  for (let simulation = 0; simulation < 5; simulation++) {
    const game = Engine.newGame(["Humano simulado", "Bot 1", "Bot 2", "Bot 3"]);
    const rng = random(simulation + 1);
    let steps = 0;
    while (game.phase !== "finished" && steps++ < 5000) {
      const offering = game.players.findIndex(p => p.offer);
      const seat = game.phase === "initial" ? game.players.findIndex(p => p.pending.length) : offering >= 0 ? offering : game.current;
      const action = chooseBotAction(game, seat, rng);
      if (action) {
        assert.ok(["choose_initial", "claim", "draw_train", "pay_tunnel", "decline_tunnel", "station", "draw_tickets", "keep_tickets"].includes(action.type));
        Engine.action(game, seat, action);
      } else Engine.next(game);
      const cards = game.deck.length + game.discard.length + game.face.length +
        game.players.reduce((sum, player) => sum + player.hand.length, 0) +
        (game.phase === "tunnel" ? game.pending.revealed.length : 0);
      assert.equal(cards, 110);
      assert.ok(game.players.every((player) => player.trains >= 0 && player.stations >= 0 && player.stations + player.placed.length === 3));
    }
    assert.equal(game.phase, "finished", `simulation ${simulation} did not finish`);
    assert.equal(game.finalRemaining, 0);
    assert.equal(game.result.length, 4);
    assert.ok(game.result.some((result) => result.winner));
  }
});

for (const count of [2, 3, 5]) test(`strategic bots finish ${count}-player games without illegal moves, including stations and ticket offers`, () => {
  for (let run = 0; run < 4; run++) {
    const game = Engine.newGame(Array.from({ length: count }, (_, i) => `Bot ${i}`));
    const rng = random(count * 10 + run);
    let steps = 0;
    while (game.phase !== "finished" && steps++ < 3000) {
      const offering = game.players.findIndex(p => p.offer);
      const seat = game.phase === "initial" ? game.players.findIndex(p => p.pending.length) : offering >= 0 ? offering : game.current;
      const action = chooseBotAction(game, seat, rng);
      if (action) {
        assert.ok(["choose_initial", "draw_train", "claim", "pay_tunnel", "decline_tunnel", "station", "draw_tickets", "keep_tickets"].includes(action.type));
        Engine.action(game, seat, action);
      } else Engine.next(game);
      assert.equal(game.deck.length + game.discard.length + game.face.length + game.players.reduce((sum, p) => sum + p.hand.length, 0)
        + (game.phase === "tunnel" ? game.pending.revealed.length : 0), 110);
      assert.ok(game.players.every(p => p.trains >= 0 && p.stations >= 0 && p.stations + p.placed.length === 3));
    }
    assert.equal(game.phase, "finished", `${count} players, run ${run}, ${steps} steps`);
    assert.equal(game.result.length, count);
  }
});
