"use strict";
const { shuffle } = require("./random");

// Prepare resources and private hands. Clock, market, logs and persisted route
// representation are composed by the facade during the gradual migration.
function prepareGame({ names, first }, { map, rules, random }) {
  if (!Array.isArray(names) || names.length < rules.minPlayers || names.length > rules.maxPlayers) {
    return { ok: false, error: { code: "INVALID_PLAYER_COUNT" } };
  }
  if (!Number.isInteger(first) || first < 0 || first >= names.length) {
    return { ok: false, error: { code: "INVALID_FIRST_PLAYER" } };
  }
  const deck = shuffle(rules.trainCards.flatMap(({ color, count }) => Array(count).fill(color)), random);
  const shortDeck = shuffle(map.tickets.filter(t => !t.long), random);
  const longDeck = shuffle(map.tickets.filter(t => t.long), random);
  const players = names.map((name, seat) => {
    const hand = [];
    for (let i = 0; i < rules.initialHand; i++) hand.push(deck.pop() || null);
    const long = [];
    for (let i = 0; i < rules.initialLongTickets; i++) long.push(longDeck.pop());
    return {
      name: String(name).slice(0, rules.maxNameLength), color: rules.playerColors[seat],
      hand, tickets: [], pending: [...long, ...shortDeck.splice(0, rules.initialShortTickets)],
      trains: rules.trains, stations: rules.stations, placed: [], score: 0,
    };
  });
  return { ok: true, plan: { players, deck, shortDeck } };
}

module.exports = { prepareGame };
