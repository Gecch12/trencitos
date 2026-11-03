"use strict";
const { projectBoard, projectPlayer } = require('../compat/legacy-scoring');
const { destinationDetails } = require('../domain/scoring');

// Train draws change hands/clocks, not connectivity. Keep only the latest board
// and per-seat destination result, outside serialized state. Content keys also
// handle in-place edits, restored boards, station borrowing and ticket choices.
// MatchView detaches these private results before exposing any authorized view.
function createDestinationDetails({ calculate = destinationDetails } = {}) {
  const games = new WeakMap();
  return function query(game, seat) {
    const boardKey = JSON.stringify(game.routes.map(r => [r.id, r.a, r.b, r.n, r.owner]));
    let entry = games.get(game);
    if (!entry || entry.boardKey !== boardKey) {
      entry = { boardKey, ...projectBoard(game), seats: new Map() };
      games.set(game, entry);
    }
    const player = projectPlayer(game.players[seat]);
    const key = JSON.stringify([player.placed, player.tickets]);
    let result = entry.seats.get(seat);
    if (!result || result.key !== key) {
      result = { key, details: calculate({ ...player, seat, owners: entry.owners }, { map: entry.map }) };
      entry.seats.set(seat, result);
    }
    return result.details;
  };
}
module.exports = { createDestinationDetails };
