"use strict";
const crypto = require("node:crypto");
const E = require("../../backend/engine"), europe = require("../../shared/maps/europe-v1");
const { createMapCatalog } = require("../../game/maps/catalog");
const { createMatchArchive } = require("../../backend/match-archive");
const { botMap } = require("./bot-map"), { random } = require("./bot-match");
const mapRef = { id: "bot-fixture", version: "1" }, cookie = `trencitos_guest=${"a".repeat(64)}`;
const identity = { guestId: crypto.createHash("sha256").update("a".repeat(64)).digest("hex") };

function recording(reference = mapRef) {
  const engine = E.createEngine({ maps: createMapCatalog([europe, botMap()]) }), rng = random(91);
  const game = engine.newGame(["Map A", "Map B"], 0, Date.now(), null, { mapRef: reference, random: rng });
  const room = { code: "MAPTEST", visibility: "public", archiveFull: true, game,
    members: game.players.map((p, i) => ({ name: p.name, color: p.color, guestId: i ? "other-guest" : identity.guestId })) };
  const archive = createMatchArchive({ engine });
  const save = () => { archive.capture(room); archive.commit(archive.prepare()); };
  save();
  engine.observe(game, event => { room.archiveAction = event; save(); });
  for (const seat of [0, 1]) engine.action(game, seat, { type: "choose_initial", indexes: [0, 1] }, { random: rng });
  engine.action(game, 0, { type: "draw_train", index: -1 }, { random: rng });
  engine.finish(game, true, { random: rng }); save();
  return { engine, room, archive, record: archive.state.matches[room.matchId] };
}
module.exports = { recording, mapRef, cookie, identity };
