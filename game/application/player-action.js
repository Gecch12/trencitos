"use strict";

// Transitional application boundary over the existing room/engine format.
// The caller authenticates the seat and runs this inside its serialized dispatch.
// stageRoom is synchronous and includes history and authorized views: false means local rollback;
// true means staged, NOT necessarily committed. Remote ACKs must use the outbox.
function createPlayerActionHandler({ engine, stageRoom, storagePaused, now, random, fingerprintAction }) {
  const reject = (code, legacyMessage) => ({ status: "rejected", error: {
    code, ...(legacyMessage === undefined ? {} : { legacyMessage }),
  } });

  return function submitPlayerAction(room, seat, { commandId, expectedRevision, action }) {
    if (!room.game) return reject("MATCH_NOT_STARTED");
    const member = room.members[seat];
    if (commandId !== undefined && (typeof commandId !== "string" || !/^[\w-]{8,80}$/.test(commandId))) {
      return reject("INVALID_COMMAND_ID");
    }
    // Receipts belong to this match/seat. Legacy IDs have no recoverable payload;
    // retain their ID-only semantics until they leave the bounded window.
    if (commandId && member.actionIds?.includes(commandId)) {
      const receipt = member.actionReceipts?.find(entry => entry.id === commandId);
      if (receipt && receipt.fingerprint !== fingerprintAction(action)) return reject("COMMAND_ID_CONFLICT");
      stageRoom(room);
      return { status: "duplicate", commandId, ...(receipt?.drawEventId !== undefined ? { drawEventId: receipt.drawEventId } : {}) };
    }
    if (!room.practice && engine.expire(room.game, now(), random)) {
      room.revision = (room.revision || 0) + 1;
      stageRoom(room, true);
    }
    if (storagePaused()) return reject("STORAGE_PAUSED");
    if (member.autopilot) return reject("AUTOPILOT_ACTIVE");

    // Private choices validate their own pending choice/offer in the engine.
    const privateChoice = ["choose_initial", "keep_tickets"].includes(action?.type);
    if (!privateChoice && expectedRevision !== undefined && expectedRevision !== (room.revision || 0)) {
      stageRoom(room);
      return reject("STALE_ACTION");
    }
    const fingerprint = commandId ? fingerprintAction(action) : undefined;
    const eventFloor = room.game.eventSerial || 0;
    try {
      engine.action(room.game, seat, action, { now: now(), random });
    } catch (error) {
      // Engine.action may advance a deadline before rejecting the player's move.
      stageRoom(room);
      return reject("GAME_ACTION_REJECTED", error.message);
    }
    room.revision = (room.revision || 0) + 1;
    const drawEvent = action?.type === "draw_train" && room.game.events?.find(event =>
      event.id > eventFloor && event.type === "draw" && event.seat === seat && event.index === action.index);
    const feedback = drawEvent ? { drawEventId: drawEvent.id } : {};
    if (commandId) {
      member.actionIds = [...(member.actionIds || []), commandId].slice(-128);
      member.actionReceipts = [...(member.actionReceipts || []).filter(entry =>
        entry.id !== commandId && member.actionIds.includes(entry.id)), { id: commandId, fingerprint, ...feedback }];
    }
    if (!stageRoom(room)) return reject("ACTION_NOT_SAVED");
    return { status: "accepted", commandId, ...feedback };
  };
}

module.exports = { createPlayerActionHandler };
