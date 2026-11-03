"use strict";

// The scheduler checks room membership/connections and enters serialized dispatch.
// These synchronous use cases coordinate gameplay; stageRoom has the same staged
// (not necessarily durable) semantics as the player action boundary.
function createAutomaticPlay({ engine, chooseBotAction, chooseReplacementAction,
  stageRoom, now, random, botRandom, messages, onReplacementError }) {
  function expire(room) {
    if (!engine.expire(room.game, now(), random)) return false;
    room.revision = (room.revision || 0) + 1;
    stageRoom(room, true);
    return true;
  }
  function permanentSeats(room) {
    const g = room.game;
    if (!g || g.phase === "finished") return [];
    if (g.phase === "tunnel" && g.pending?.stage) return !engine.tunnelBusy(g) && room.members[g.current]?.bot ? [g.current] : [];
    const pending = room.members.flatMap((m, i) => m.bot && (g.players[i].pending.length || g.players[i].offer) ? [i] : []);
    if (pending.length) return pending;
    return !["initial", "closing"].includes(g.phase) && room.members[g.current]?.bot ? [g.current] : [];
  }
  function playPermanentBots(room) {
    const time = now();
    if (engine.expire(room.game, time, random)) {
      room.revision = (room.revision || 0) + 1;
      stageRoom(room, true);
      return;
    }
    for (const seat of permanentSeats(room)) {
      const action = chooseBotAction(room.game, seat, botRandom);
      if (action) engine.action(room.game, seat, action, { now: time, random });
      else if (room.game.current === seat && room.game.phase === "play") {
        engine.note(room.game, messages.permanentPass(room.members[seat].name), seat);
        engine.next(room.game, time);
      }
      room.revision = (room.revision || 0) + 1;
    }
    stageRoom(room, true);
  }
  const pendingBots = room => room.members.flatMap((m, i) => m.bot && room.game.players[i].pending.length ? [i] : []);
  const pendingOffers = room => room.game.phase === "tunnel" ? [] : room.members.flatMap((m, i) => m.bot && room.game.players[i].offer ? [i] : []);
  function canPracticeAct(room) {
    const g = room.game;
    return engine.tunnelBusy(g) ? false : g.phase === "initial" ? pendingBots(room).length > 0
      : g.phase !== "finished" && (pendingOffers(room).length > 0 || g.phase !== "closing" && room.members[g.current]?.bot);
  }
  function playPracticeBots(room) {
    // Recheck after entering dispatch: a queued callback may no longer be eligible.
    if (!canPracticeAct(room)) return;
    const time = now();
    if (engine.expire(room.game, time, random)) { stageRoom(room); return; }
    if (room.game.phase === "initial" || pendingOffers(room).length) {
      for (const seat of room.game.phase === "initial" ? pendingBots(room) : pendingOffers(room)) {
        const action = chooseBotAction(room.game, seat, botRandom);
        if (action) engine.action(room.game, seat, action, { now: time, random });
      }
      stageRoom(room);
      return;
    }
    const seat = room.game.current, action = chooseBotAction(room.game, seat, botRandom);
    if (action) engine.action(room.game, seat, action, { now: time, random });
    else {
      engine.note(room.game, messages.practicePass(room.game.players[seat].name), seat);
      engine.next(room.game, now());
    }
    // Practice historically stages once without increasing the revision here.
    stageRoom(room);
  }
  function finishPractice(room) {
    if (room.game.phase === "finished") return;
    const g = room.game;
    if (g.phase === "tunnel" && g.pending.stage !== "result") g.discard.push(...g.pending.revealed);
    engine.recycleDiscards(g);
    g.pending = null;
    g.drawCount = 0;
    room.earlyFinish = true;
    engine.finish(g, true, { random });
    stageRoom(room);
  }
  function playReplacement(room) {
    if (expire(room)) return;
    const seat = room.game.current;
    if (!room.members[seat]?.autopilot) return;
    const action = chooseReplacementAction(room.game, seat, botRandom);
    // No useful move: wait for the normal deadline, without drawing tickets or yielding.
    if (!action) return;
    try {
      engine.action(room.game, seat, action, { now: now(), random });
      room.revision = (room.revision || 0) + 1;
      stageRoom(room, true);
    } catch (error) {
      onReplacementError(error);
    }
  }
  return { expire, permanentSeats, playPermanentBots, canPracticeAct, playPracticeBots, finishPractice, playReplacement };
}

module.exports = { createAutomaticPlay };
