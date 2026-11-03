"use strict";

// Transitional application boundary over the existing room/engine format.
// The caller authenticates the seat and runs this inside its serialized dispatch.
// stageRoom is synchronous and includes history and authorized views: false means local rollback;
// true means staged, NOT necessarily committed. Remote ACKs must use the outbox.
function createPlayerActionHandler({ engine, stageRoom, storagePaused, now, random }) {
  const reject = (code, legacyMessage) => ({ status: "rejected", error: {
    code, ...(legacyMessage === undefined ? {} : { legacyMessage }),
  } });

  return function submitPlayerAction(room, seat, { commandId, expectedRevision, action }) {
    if (!room.game) return reject("MATCH_NOT_STARTED");
    const member = room.members[seat];
    if (commandId !== undefined && (typeof commandId !== "string" || !/^[\w-]{8,80}$/.test(commandId))) {
      return reject("INVALID_COMMAND_ID");
    }
    // These legacy receipts identify accepted commands by ID only, per seat.
    // Repeating one must not expire a clock, consume randomness or execute again.
    if (commandId && member.actionIds?.includes(commandId)) {
      stageRoom(room);
      return { status: "duplicate", commandId };
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
    try {
      engine.action(room.game, seat, action, { now: now(), random });
    } catch (error) {
      // Engine.action may advance a deadline before rejecting the player's move.
      stageRoom(room);
      return reject("GAME_ACTION_REJECTED", error.message);
    }
    room.revision = (room.revision || 0) + 1;
    if (commandId) member.actionIds = [...(member.actionIds || []), commandId].slice(-128);
    if (!stageRoom(room)) return reject("ACTION_NOT_SAVED");
    return { status: "accepted", commandId };
  };
}

module.exports = { createPlayerActionHandler };
