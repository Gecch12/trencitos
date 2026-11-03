"use strict";
const {maps,EUROPE_REFERENCE} = require("./maps");

function selectMap(ref = EUROPE_REFERENCE) {
  const map = maps.get(ref);
  return {id:map.id,version:map.version};
}
function roomMapReference(room) {
  const ref = selectMap(room.game?.mapRef ?? room.mapRef);
  if (room.mapRef !== undefined) {
    const selected = selectMap(room.mapRef);
    if (selected.id !== ref.id || selected.version !== ref.version)
      throw Object.assign(Error("Room and match map references disagree"), {code:"INVALID_ROOM_MAP"});
  }
  return ref;
}
module.exports = {selectMap,roomMapReference};
