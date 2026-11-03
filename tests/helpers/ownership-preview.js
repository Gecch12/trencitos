"use strict";
// Local visual QA: five routes claimed through the engine, no saved rooms.
// PORT=3001 node tests/helpers/ownership-preview.js
// Set localStorage['rr-room-QAMARK']='preview-human' before /?room=QAMARK.
const E = require("../../backend/engine");
function ownershipRoom(code = "QAMARK") {
  const game = E.newGame(["Probador", "Rival azul", "Rival verde", "Rival amarillo", "Rival violeta"]);
  const pool = [...game.deck, ...game.face, ...game.discard, ...game.players.flatMap(p => p.hand)];
  game.players.forEach(p => { p.hand = []; p.pending = []; p.tickets = []; });
  game.deck = pool; game.face = []; game.discard = []; game.phase = "play";
  const take = card => {
    const index = game.deck.indexOf(card);
    if (index < 0) throw new Error(`Missing fixture card: ${card}`);
    return game.deck.splice(index, 1)[0];
  };
  game.face = ["yellow", "wild", "yellow", "blue", "green"].map(take);
  for (const [seat, id] of [7, 8, 12, 15, 18].entries()) {
    const route = game.routes[id], color = route.color === "gray" ? "blue" : route.color;
    game.players[seat].hand = Array.from({ length: route.n }, () => take(color));
    E.action(game, seat, { type: "claim", routeId: id, color, wildCount: 0 });
  }
  game.players[0].hand = ["yellow", "wild", "red", "blue", "green", "orange", "orange", "orange"].map(take);
  return { code, updated: Date.now(), practice: true, game,
    members: game.players.map((p, i) => ({ name: p.name, token: i === 0 ? "preview-human" : `preview-${i}`, ws: null })) };
}
function madridRoom() {
  const room = ownershipRoom("QAMAD"), game = room.game;
  game.routes.forEach(route => { route.owner = null; });
  for (const id of [20, 16, 11]) game.routes[id].owner = 0;
  game.routes[7].owner = 2;
  game.players[0].tickets = [E.TICKETS.find(ticket => ticket.id === 15)];
  game.deck.push(...game.players[0].hand);
  game.players[0].hand = Array.from({ length: 2 }, () => game.deck.splice(game.deck.indexOf("green"), 1)[0]);
  game.logs = ["Completa Bruxelles — Dieppe para conectar Madrid — Dieppe."];
  return room;
}
if (require.main === module) {
  const path = require("node:path"), os = require("node:os");
  process.env.STATE_FILE = path.join(os.tmpdir(), `ferrovia-ownership-preview-${process.pid}.json`);
  const { server, rooms } = require("../../backend/server");
  rooms.set("QAMARK", ownershipRoom());
  rooms.set("QAMAD", madridRoom());
  const completed = madridRoom(); completed.code = "QADONE";
  completed.game.routes[6].owner = 0;
  completed.game.players[0].tickets.push(...E.TICKETS.filter(t => [2, 8, 12].includes(t.id)));
  rooms.set(completed.code, completed);
  const borrowed = madridRoom(); borrowed.code = "QABORROW";
  borrowed.game.routes[6].owner = 1;
  borrowed.game.players[0].placed = ["BRU"]; borrowed.game.players[0].stations = 2;
  rooms.set(borrowed.code, borrowed);
  const final = madridRoom(); final.code = "QAFINAL";
  final.game.routes[6].owner = 1;
  for (const [i, city] of ["BRU", "MAD", "PAR", "ROM", "DIE"].entries()) {
    final.game.players[i].placed = [city]; final.game.players[i].stations = 2;
  }
  final.game.players[0].tickets.push(...E.TICKETS.filter(t => [2,8,12].includes(t.id)));
  final.game.players.forEach((p,i) => { p.pending = []; p.score = final.game.routes.filter(r => r.owner === i).reduce((s,r) => s+E.SCORE[r.n],0); });
  E.finish(final.game); rooms.set(final.code, final);
  const initial = ownershipRoom("QAINIT");
  initial.game = E.newGame(initial.members.map(m => m.name), 3);
  rooms.set(initial.code, initial);
  // Visual fixtures stay still while screenshots are inspected. Only their
  // first turn is extended; production rooms always use the engine's 60 s.
  for (const room of rooms.values()) if (room.game.phase === "play") room.game.turnDeadline = Date.now() + 600000;
  const port = Number(process.env.PORT || 3001);
  server.listen(port, "127.0.0.1", () => console.log(`Ownership QA: http://localhost:${port}`));
}
module.exports = { ownershipRoom, madridRoom };
