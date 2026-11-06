"use strict";

// Transitional application boundary over the existing room/engine format.
// The caller authenticates the seat and runs this inside its serialized dispatch.
// stageRoom is synchronous and includes history and authorized views: false means local rollback;
// true means staged, NOT necessarily committed. Remote ACKs must use the outbox.
function createPlayerActionHandler({ engine, stageRoom, storagePaused, now, random, fingerprintAction }) {
  const reject = (code, legacyMessage) => ({ status: "rejected", error: {
    code, ...(legacyMessage === undefined ? {} : { legacyMessage }),
  } });

  return function submitPlayerAction(room, seat, { commandId, expectedRevision, action, after, chainDraws = false }) {
    if (!room.game) return reject("MATCH_NOT_STARTED");
    const member = room.members[seat];
    if (commandId !== undefined && (typeof commandId !== "string" || !/^[\w-]{8,80}$/.test(commandId))) {
      return reject("INVALID_COMMAND_ID");
    }
    if (after !== undefined && (!commandId || typeof after !== 'string' || !/^[\w-]{8,80}$/.test(after) || after === commandId || action?.type !== 'draw_train'))
      return reject('DRAW_DEPENDENCY_CHANGED');
    // Receipts belong to this match/seat. Legacy IDs have no recoverable payload;
    // retain their ID-only semantics until they leave the bounded window.
    if (commandId && member.actionIds?.includes(commandId)) {
      const receipt = member.actionReceipts?.find(entry => entry.id === commandId);
      if (receipt && (receipt.fingerprint !== fingerprintAction(action) || receipt.after !== after)) return reject("COMMAND_ID_CONFLICT");
      stageRoom(room);
      return { status: "duplicate", commandId, ...(receipt?.drawEventId !== undefined ? { drawEventId: receipt.drawEventId } : {}) };
    }
    if (!room.practice && engine.expire(room.game, now(), random)) {
      room.revision = (room.revision || 0) + 1;
      stageRoom(room, true);
    }
    if (storagePaused(room)) return reject("STORAGE_PAUSED");
    if (member.autopilot) return reject("AUTOPILOT_ACTIVE");

    // Private choices validate their own pending choice/offer in the engine.
    const privateChoice = ["choose_initial", "keep_tickets"].includes(action?.type);
    let resolvedAction = action;
    if (after !== undefined) {
      const parent = member.actionReceipts?.find(entry => entry.id === after), first = parent?.drawContext, game = room.game;
      const changed = () => { stageRoom(room);return reject('DRAW_DEPENDENCY_CHANGED'); };
      if (!first || parent.after !== undefined || expectedRevision !== first.revision ||
          room.revision !== first.revision + 1 || game.phase !== 'play' || game.current !== seat ||
          game.turnSerial !== first.turnSerial || game.turnWaiting || first.drawCount !== 0 || game.drawCount !== 1 ||
          game.events.some(e => e.id > first.eventFloor && e.type === 'market_refresh')) return changed();
      const index = action.index;
      if (!Number.isInteger(index) || index < -1 || index >= first.face.length ||
          (index >= 0 && (index === first.index || first.face[index] === 'wild'))) return changed();
      const removed = first.index >= 0 && game.face.length === first.face.length - 1;
      if (game.face.length !== first.face.length && !removed) return changed();
      for (let i = 0; i < first.face.length; i++) {
        if (i !== first.index && game.face[i - (removed && i > first.index ? 1 : 0)] !== first.face[i]) return changed();
      }
      resolvedAction = { ...action, index: index - (index >= 0 && removed && index > first.index ? 1 : 0) };
    } else if (!privateChoice && expectedRevision !== undefined && expectedRevision !== (room.revision || 0)) {
      stageRoom(room);
      return reject("STALE_ACTION");
    }
    const fingerprint = commandId ? fingerprintAction(action) : undefined;
    const eventFloor = room.game.eventSerial || 0;
    const drawContext = chainDraws === true && commandId && action?.type === 'draw_train' && after === undefined
      ? { revision: room.revision || 0, turnSerial: room.game.turnSerial, drawCount: room.game.drawCount,
        index: action.index, face: [...room.game.face], eventFloor } : null;
    try {
      engine.action(room.game, seat, resolvedAction, { now: now(), random });
    } catch (error) {
      // Engine.action may advance a deadline before rejecting the player's move.
      stageRoom(room);
      return reject("GAME_ACTION_REJECTED", error.message);
    }
    room.revision = (room.revision || 0) + 1;
    const drawEvent = action?.type === "draw_train" && room.game.events?.find(event =>
      event.id > eventFloor && event.type === "draw" && event.seat === seat && event.index === resolvedAction.index);
    const feedback = drawEvent ? { drawEventId: drawEvent.id } : {};
    if (commandId) {
      member.actionIds = [...(member.actionIds || []), commandId].slice(-128);
      member.actionReceipts = [...(member.actionReceipts || []).filter(entry =>
        entry.id !== commandId && member.actionIds.includes(entry.id)), { id: commandId, fingerprint, ...feedback,
          ...(after !== undefined ? { after } : {}), ...(drawContext ? { drawContext } : {}) }];
    }
    if (!stageRoom(room)) return reject("ACTION_NOT_SAVED");
    return { status: "accepted", commandId, ...feedback };
  };
}

module.exports = { createPlayerActionHandler };
