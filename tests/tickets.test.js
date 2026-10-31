"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Engine = require("../engine");

function playingGame() {
  const game = Engine.newGame(["Humano", "Bot 1", "Bot 2", "Bot 3"]);
  for (let seat = 0; seat < 4; seat++)
    Engine.action(game, seat, { type: "choose_initial", indexes: [0, 1] });
  return game;
}

test("new destinations immediately pass the turn; confirmation is private and off-turn", () => {
  const game = playingGame();
  Engine.action(game, 0, { type: "draw_tickets" });
  const offer = [...game.players[0].offer.tickets], offerId = game.players[0].offer.id;
  assert.equal(game.current, 1);
  assert.equal(game.phase, "play");
  assert.equal(Engine.view(game, 0).pending.length, 3);
  assert.equal(Engine.view(game, 1).pending, null);
  Engine.action(game, 0, { type: "keep_tickets", offerId, indexes: [1] });
  assert.equal(game.phase, "play");
  assert.equal(game.current, 1);
  assert.equal(game.pending, null);
  assert.equal(game.players[0].tickets.at(-1), offer[1]);
  assert.deepEqual(game.shortDeck.slice(-2), [offer[0], offer[2]]);
  for (let seat = 0; seat < 4; seat++)
    assert.equal(Engine.view(game, seat).pending, null);
  Engine.action(game, 1, { type: "draw_train", index: -1 });
  assert.equal(game.drawCount, 1);
});

test("new destinations require at least one choice without mutating a rejected selection", () => {
  const game = playingGame();
  Engine.action(game, 0, { type: "draw_tickets" });
  const before = JSON.stringify(game);
  for (const indexes of [[], [0, 0], [3]]) {
    assert.throws(() => Engine.action(game, 0, { type: "keep_tickets", offerId: game.players[0].offer.id, indexes }));
    assert.equal(JSON.stringify(game), before);
  }
});

test("a destination offer works when only one ticket remains", () => {
  const game = playingGame();
  game.shortDeck = game.shortDeck.slice(0, 1);
  Engine.action(game, 0, { type: "draw_tickets" });
  assert.equal(game.players[0].offer.tickets.length, 1);
  Engine.action(game, 0, { type: "keep_tickets", offerId: game.players[0].offer.id, indexes: [0] });
  assert.equal(game.phase, "play");
  assert.equal(game.players[0].tickets.length, 3);
  assert.equal(game.shortDeck.length, 0);
});

test("keeping destinations on the last turn still finishes the game", () => {
  const game = playingGame();
  game.finalRemaining = 1;
  Engine.action(game, 0, { type: "draw_tickets" });
  assert.equal(game.phase, "closing");
  Engine.action(game, 0, { type: "keep_tickets", offerId: game.players[0].offer.id, indexes: [0] });
  assert.equal(game.phase, "finished");
  assert.equal(game.pending, null);
  assert.equal(game.result.length, 4);
  assert.equal(Engine.view(game, 0).tickets.length, 3);
});
