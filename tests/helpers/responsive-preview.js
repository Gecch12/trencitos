"use strict";
// Isolated visual QA only: never imported/served by the production application.
// PORT=3011 node tests/helpers/responsive-preview.js
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
process.env.STATE_BACKEND = "file";
process.env.STATE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rail-responsive-")), "rooms.json");
const E = require("../../engine");
const { ownershipRoom } = require("./ownership-preview");
const { tunnelRoom } = require("./tunnel-preview");
const { server, rooms, ready } = require("../../server");
const qaToken = "a".repeat(48); // Disposable fixture identity, not a real credential.
function add(room) {
  room.members[0].token = qaToken;
  const g = room.game;
  if (g.phase === "initial") g.initialDeadline = g.turnDeadline = Date.now() + 600000;
  else if (g.phase !== "finished") g.turnDeadline = Date.now() + 600000;
  rooms.set(room.code, room);
}
ready.then(() => {
  for (const code of ["QAPLAY", "QABULD", "QASTAT", "QAOFER", "QAFINI", "QAINIT"]) {
    const r = ownershipRoom(code), g = r.game;
    g.players[0].tickets = E.TICKETS.filter(t => [2, 8, 12, 15, 16, 18, 21, 25].includes(t.id));
    g.shortDeck = g.shortDeck.filter(t => !g.players[0].tickets.some(owned => owned.id === t.id));
    // Rich hand exercises all nine cards, horizontal overflow and payments.
    for (const color of [...E.COLORS, "wild"]) {
      for (let i = 0; i < 4; i++) {
        const at = g.deck.indexOf(color);
        if (at >= 0) g.players[0].hand.push(g.deck.splice(at, 1)[0]);
      }
    }
    for (const id of [20, 16, 11, 6]) g.routes[id].owner = 0;
    g.players.forEach((player, seat) => {
      const routes = g.routes.filter(r => r.owner === seat);
      player.score = routes.reduce((sum, r) => sum + E.SCORE[r.n], 0);
      player.trains = 45 - routes.reduce((sum, r) => sum + r.n, 0);
    });
    for (let i = 0; i < 25; i++) E.note(g, `${g.players[i % 5].name} robó una carta de tren.`, i % 5);
    if (code === "QAFINI") E.finish(g, true);
    if (code === "QAINIT") r.game = E.newGame(r.members.map(m => m.name));
    add(r);
  }
  add(tunnelRoom("QATUNL"));
  add(tunnelRoom("QADECL", "decline"));
  const port = Number(process.env.PORT || 3011);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Responsive QA: http://localhost:${port}`);
    for (const code of rooms.keys()) console.log(`http://localhost:${port}/?room=${code}#recover=${qaToken}`);
  });
});
