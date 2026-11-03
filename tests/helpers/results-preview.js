"use strict";
// Deterministic score audit for tests/local Chrome QA. Not served in production.
const E = require("../../backend/engine");
const qaToken = "a".repeat(48); // Disposable fixture identity.
function resultsRoom(code = "QASCR1") {
  const game = E.newGame(["Angel", "Azul", "Verde", "Sin rutas"]);
  game.players.forEach(p => { p.pending = []; p.tickets = []; });
  game.phase = "play";
  function chain(seat, cities) {
    for (let i = 1; i < cities.length; i++) {
      const r = game.routes.find(r => r.owner === null && [r.a, r.b].includes(cities[i - 1]) && [r.a, r.b].includes(cities[i]));
      if (!r) throw new Error(`Missing fixture route ${cities[i - 1]}–${cities[i]}`);
      r.owner = seat;
    }
  }
  chain(0, ["EDI", "LON", "AMS", "FRA", "BER", "WAR", "VIE", "BUD", "SAR", "ATH"]);
  chain(0, ["FRA", "MUN", "ZUR", "VEN", "ROM"]);
  chain(1, ["CAD", "MAD", "PAM", "PAR", "BRU", "FRA", "ESS", "COP", "STO", "PET", "MOS"]);
  chain(2, ["ROM", "BRI", "ATH", "SMY", "CON", "SOF", "BUC", "KIE", "WIL", "RIG", "DAN"]);
  game.players[0].placed = ["ROM"]; game.players[0].stations = 2;
  game.players[0].tickets = [
    { id: 901, a: "EDI", b: "ATH", p: 21 },
    { id: 902, a: "ROM", b: "BRI", p: 4 }, // Exercises one borrowed rival route.
    { id: 903, a: "LIS", b: "DAN", p: 20 },
  ];
  game.players.forEach((p, seat) => {
    const routes = game.routes.filter(r => r.owner === seat);
    p.score = routes.reduce((sum, r) => sum + E.SCORE[r.n], 0);
    p.trains = 45 - routes.reduce((sum, r) => sum + r.n, 0);
  });
  E.finish(game);
  return { code, updated: Date.now(), practice: true, game,
    members: game.players.map((p, i) => ({ name: p.name, color: p.color, token: i ? `preview-${i}` : qaToken, ws: null })) };
}
if (require.main === module) {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  process.env.STATE_BACKEND = "file";
  process.env.STATE_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trencitos-results-")), "rooms.json");
  const { server, rooms, ready } = require("../../backend/server");
  ready.then(() => {
    const r = resultsRoom(); rooms.set(r.code, r);
    const port = Number(process.env.PORT || 3114);
    server.listen(port, "127.0.0.1", () => console.log(`Results QA: http://localhost:${port}/?room=${r.code}#recover=${qaToken}`));
  });
}
module.exports = { resultsRoom };
