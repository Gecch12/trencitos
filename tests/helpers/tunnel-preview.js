"use strict";
// Deterministic browser QA only. Never imported or served by the application.
// PORT=3002 node tests/helpers/tunnel-preview.js
// Before opening /?room=QAPAY0, set localStorage['rr-room-QAPAY0']='preview-human'.
const E = require("../../engine");
function tunnelRoom(code, kind = "color", readyToClaim = false) {
  const g = E.newGame(["Probador", "Rival azul", "Rival verde", "Rival amarillo"]);
  const all = [...g.deck, ...g.face, ...g.discard, ...g.players.flatMap(p => p.hand)];
  g.players.forEach(p => { p.hand = []; p.pending = []; p.tickets = []; });
  g.deck = all; g.face = []; g.discard = []; g.phase = "play";
  E.ensureTiming(g);
  const take = card => {
    const index = g.deck.indexOf(card);
    if (index < 0) throw new Error(`Missing fixture card: ${card}`);
    return g.deck.splice(index, 1)[0];
  };
  const hand = kind === "wild" ? ["wild", "wild", "wild", "red"]
    : kind === "decline" ? ["white", "white", "red"]
    : ["white", "white", "white", "white", "wild", "wild"];
  g.players[0].hand = hand.map(take);
  g.face = ["red", "blue", "green", "yellow", "black"].map(take);
  const revealed = kind === "zero" ? ["red", "black", "blue"] : kind === "short" ? ["white", "black"] : kind === "wild" ? ["red", "black", "wild"] : ["white", "black", "wild"];
  const drawn = revealed.map(take).reverse();
  if (kind === "short") g.players[1].hand.push(...g.deck.splice(0));
  g.deck.push(...drawn);
  const route = g.routes.find(r => r.tunnel && r.color === "gray" && r.n === 2);
  if (!readyToClaim) E.action(g, 0, { type: "claim", routeId: route.id, color: kind === "wild" ? "wild" : "white", wildCount: kind === "wild" ? 2 : 0 });
  return { code, updated: Date.now(), practice: true, game: g,
    members: g.players.map((p, i) => ({ name: p.name, token: i === 0 ? "preview-human" : `preview-${i}`, ws: null })) };
}
if (require.main === module) {
  const path = require("node:path"), os = require("node:os");
  process.env.STATE_FILE = path.join(os.tmpdir(), `ferrovia-tunnel-preview-${process.pid}.json`);
  const { server, rooms } = require("../../server");
  for (const [code, kind] of [["QAPAY0", "color"], ["QAPAY1", "color"], ["QADECL", "decline"], ["QAWILD", "wild"]]) rooms.set(code, tunnelRoom(code, kind));
  const port = Number(process.env.PORT || 3002);
  server.listen(port, "127.0.0.1", () => console.log(`Tunnel QA: http://localhost:${port}`));
}
module.exports = { tunnelRoom };
