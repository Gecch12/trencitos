"use strict";
const Engine = require("./engine");
const MapOptions = require("../shared/map-options");
const {roomMapReference} = require("./room-map");

// Older checkpoints are private unless visibility was explicitly recorded.
const isPublic = room => !room.practice && room.visibility === "public";
const capacity = room => Number.isInteger(room.maxPlayers) && room.maxPlayers >= 2 && room.maxPlayers <= 5 ? room.maxPlayers : 5;
function listRooms(rooms) {
  return [...rooms.values()].filter(room => isPublic(room) && room.game?.phase !== "finished" && room.emptySince == null)
    .map(room => ({
      code: room.code, started: !!room.game, maxPlayers: capacity(room),
      mode: "Clásico", map: MapOptions.name(roomMapReference(room)), mapRef:roomMapReference(room), turnSeconds: room.game?.timing?.turnSeconds || room.timing?.turnSeconds || Engine.TURN_MS / 1000,
      members: room.members.map(m => ({ name: m.name, color: m.color, bot: !!m.bot })),
    })).sort((a, b) => a.code.localeCompare(b.code));
}
module.exports = { isPublic, capacity, listRooms };
