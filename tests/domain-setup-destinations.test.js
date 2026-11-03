"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Setup = require("../game/domain/setup"), Destinations = require("../game/domain/destinations");
const { shuffle, sampleIndexes } = require("../game/domain/random");

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
const setupRules = freeze({ minPlayers: 2, maxPlayers: 3, maxNameLength: 5, playerColors: ["gold", "silver", "bronze"],
  trainCards: [{ color: "copper", count: 8 }, { color: "wild", count: 2 }],
  initialHand: 2, initialLongTickets: 1, initialShortTickets: 2, trains: 12, stations: 1 });
const map = freeze({ tickets: Array.from({ length: 9 }, (_, i) => ({ id: `D${19-i}`, a: "A", b: "B", p: i+1, long: i < 3 })) });
const rules = freeze({ initialMinimum: 2, offerMinimum: 1, offerCount: 3, offerClock: { kind: "remaining-turn", extraMs: 40 } });
const tickets = map.tickets.slice(3, 7);

test("setup uses injected materials, resources and stable ticket IDs without mutating inputs", () => {
  const command = freeze({ names: ["Long name", 42, "C"], first: 2 }), bounds = [];
  const context = { map, rules: setupRules, random: max => { bounds.push(max);return max-1; } };
  const before = structuredClone({ command, map, rules: setupRules });
  const result = Setup.prepareGame(command, context);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plan.players.map(p => [p.name,p.color,p.trains,p.stations]),
    [["Long ","gold",12,1],["42","silver",12,1],["C","bronze",12,1]]);
  assert.deepEqual(result.plan.players.map(p => p.pending.map(t => t.id)), [["D17","D16","D15"],["D18","D14","D13"],["D19","D12","D11"]]);
  assert.deepEqual(result.plan.players[0].hand, ["wild","wild"]);
  assert.equal(result.plan.deck.length, 4);assert.equal(result.plan.shortDeck.length, 0);
  assert.deepEqual(bounds, [9+1,9,8,7,6,5,4,3,2,6,5,4,3,2,3,2]);
  assert.deepEqual({ command, map, rules: setupRules }, before);
  assert.notEqual(result.plan.players[0].hand, result.plan.players[1].hand);
});

test("invalid setup rejects before consuming random values with count-before-seat precedence", () => {
  const random = () => { throw Error("must not draw"); };
  for (const names of [null, "AB", [], ["A"], ["A","B","C","D"]]) {
    assert.deepEqual(Setup.prepareGame({ names, first: -1 }, { map, rules: setupRules, random }),
      { ok: false, error: { code: "INVALID_PLAYER_COUNT" } });
  }
  for (const first of [-1,2,0.5,"0",undefined]) {
    assert.deepEqual(Setup.prepareGame({ names: ["A","B"], first }, { map, rules: setupRules, random }),
      { ok: false, error: { code: "INVALID_FIRST_PLAYER" } });
  }
});

test("shuffling and automatic choices use bounded supplied randomness and preserve their sources", () => {
  const source = freeze(["A","B","C","D"]), bounds = [];
  assert.deepEqual(shuffle(source, max => { bounds.push(max);return 0; }), ["B","C","D","A"]);
  assert.deepEqual(bounds, [4,3,2]);
  const choices = [];
  assert.deepEqual(sampleIndexes(4, 2, max => { choices.push(max);return max-1; }), [3,2]);
  assert.deepEqual(choices, [4,3]);assert.deepEqual(source, ["A","B","C","D"]);
});

test("initial selection is out of order, preserves selection order and starts only when everyone is ready", () => {
  const players = [{ pending: [] }, { pending: tickets }, { pending: tickets }];
  freeze(players);
  const chosen = Destinations.decideInitialChoice({ players }, { seat: 2, indexes: [3,0] }, { rules });
  assert.equal(chosen.ok, true);assert.deepEqual(chosen.plan.kept, [tickets[3],tickets[0]]);
  assert.equal(chosen.plan.initialDone, 2);assert.equal(chosen.plan.startPlay, false);
  const last = Destinations.decideInitialChoice({ players: [players[0],players[1],{ pending: [] }] }, { seat: 1, indexes: [0,1,2] }, { rules });
  assert.equal(last.plan.initialDone, 3);assert.equal(last.plan.startPlay, true);
  assert.equal(last.plan.returned, undefined); // Initial rejections never re-enter the short deck.
  assert.deepEqual(Destinations.decideInitialChoice({ players }, { seat: 0, indexes: [] }, { rules }),
    { ok: false, error: { code: "INITIAL_ALREADY_CHOSEN" } });
});

test("initial and later minimums are injected and invalid selections never mutate offers", () => {
  const state = freeze({ players: [{ pending: tickets }], offer: { id: "offer-A", tickets } });
  const before = structuredClone(state);
  for (const indexes of [null, [], [0,0], [-1], [4], [0.5], ["0"], [0,1,2,3,4]]) {
    assert.deepEqual(Destinations.decideOfferChoice(state, { offerId: "offer-A", indexes }, { rules }),
      { ok: false, error: { code: "INVALID_TICKET_SELECTION" } });
  }
  assert.equal(Destinations.decideInitialChoice(state, { seat: 0, indexes: [0] }, { rules }).ok, false);
  assert.equal(Destinations.decideInitialChoice(state, { seat: 0, indexes: [0] }, { rules: { ...rules, initialMinimum: 1 } }).ok, true);
  assert.equal(Destinations.decideOfferChoice(state, { offerId: "offer-A", indexes: [0] }, { rules: { ...rules, offerMinimum: 2 } }).ok, false);
  assert.deepEqual(state, before);
});

test("offers retain clock policy, increasing identity and available tickets without consuming them", () => {
  for (const length of [1,2,4]) {
    const state = freeze({ shortDeck: tickets.slice(0,length), offerSerial: 8, turnDeadline: 150, offer: null });
    const before = structuredClone(state);
    const result = Destinations.planOffer(state, { now: 100, rules });
    assert.equal(result.ok, true);assert.equal(result.plan.takeCount, Math.min(length,3));
    assert.deepEqual(result.plan.offer, { id: 9, tickets: state.shortDeck.slice(0,3), duration: 90, deadline: 190 });
    assert.deepEqual(state, before);
  }
  const state = { shortDeck: tickets, turnDeadline: 50 };
  assert.equal(Destinations.planOffer(state, { now: 100, rules }).plan.offer.duration, 40);
  const fixed = Destinations.planOffer(state, { now: 100, rules: { ...rules, offerCount: 2, offerClock: { kind: "fixed", durationMs: 77 } } });
  assert.equal(fixed.plan.takeCount, 2);assert.equal(fixed.plan.offer.id, 1);
  assert.equal(fixed.plan.offer.duration, 77);assert.equal(fixed.plan.offer.deadline, 177);
  assert.deepEqual(Destinations.planOffer({ shortDeck: [], offer: { id: 1 } }, { now: 100, rules }),
    { ok: false, error: { code: "TICKET_OFFER_PENDING" } });
  assert.deepEqual(Destinations.planOffer({ shortDeck: [] }, { now: 100, rules }),
    { ok: false, error: { code: "NO_DESTINATION_TICKETS" } });
});

test("offer identity is strict and checked before selection, then rejected tickets return in deck order", () => {
  const state = freeze({ offer: { id: 12, tickets } });
  for (const offerId of [undefined,11,"12"]) assert.deepEqual(
    Destinations.decideOfferChoice(state, { offerId, indexes: [] }, { rules }),
    { ok: false, error: { code: "TICKET_OFFER_EXPIRED" } });
  const result = Destinations.decideOfferChoice(state, { offerId: 12, indexes: [3,1] }, { rules });
  assert.deepEqual(result.plan, { kept: [tickets[3],tickets[1]], returned: [tickets[0],tickets[2]] });
  assert.deepEqual(Destinations.decideOfferChoice({ offer: null }, { offerId: 12, indexes: [0] }, { rules }),
    { ok: false, error: { code: "TICKET_OFFER_EXPIRED" } });
});

test("automatic destination selection samples distinct positions with supplied minimums", () => {
  const bounds = [];
  assert.deepEqual(Destinations.randomSelection(tickets, 2, { random: max => { bounds.push(max);return 0; } }), [0,1]);
  assert.deepEqual(bounds, [4,3]);
  assert.deepEqual(Destinations.randomSelection([tickets[0]], 1, { random: max => max-1 }), [0]);
});
