"use strict";
// Isolated, deterministic browser QA. Never imported or served in production.
// PORT=3012 node tests/helpers/payment-preview.js
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
process.env.STATE_BACKEND = "file";
process.env.STATE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "rail-payment-")), "rooms.json");
const E = require("../../backend/engine");
const { tunnelRoom } = require("./tunnel-preview");
const { server, rooms, ready } = require("../../backend/server");
const qaToken = "a".repeat(48); // Disposable fixture identity, not a credential.
function paymentRoom(code) {
  const g = E.newGame(["Probador", "Rival azul", "Rival verde", "Rival amarillo"]);
  const cards = [...g.deck, ...g.face, ...g.players.flatMap(p => p.hand)];
  g.players.forEach(p => { p.hand = []; p.pending = []; p.tickets = []; });
  g.deck = cards; g.face = []; g.discard = []; g.phase = "play";
  const take = color => g.deck.splice(g.deck.indexOf(color), 1)[0];
  g.players[0].hand = [...E.COLORS.flatMap(c => Array(8).fill(c)), ...Array(8).fill("wild")].map(take);
  g.face = ["red", "blue", "green", "yellow", "black"].map(take);
  // A pure-wildcard claim reveals no matching cards; the server completes it.
  g.deck.push(...["red", "blue", "green"].map(take));
  E.ensureTiming(g);
  return { code, updated: Date.now(), practice: true, game: g,
    members: g.players.map((p, i) => ({ name: p.name, token: i ? `preview-${i}` : qaToken, ws: null })) };
}
ready.then(() => {
  for (const room of [paymentRoom("QAEIGT"), paymentRoom("QAFERY"), paymentRoom("QASTAT"), tunnelRoom("QATPAY", "color", true)]) {
    room.members[0].token = qaToken;
    room.game.turnDeadline = Date.now() + 600000;
    rooms.set(room.code, room);
  }
  const port = Number(process.env.PORT || 3012);
  server.listen(port, "127.0.0.1", () => console.log(`Payment QA: http://localhost:${port}/?room=QAEIGT#recover=${qaToken}`));
});
