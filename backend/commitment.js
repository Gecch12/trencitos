"use strict";
// Persisted participant outcomes; connection timers themselves use the room's
// existing durable lifecycle. Never infer culpability from a closed room.
const RECONNECT_MS = 120000, DISABLE_MS = 60000;
const connected = m => !!m.ws && !m.ws.closed;
function initialize(room, now = Date.now()) {
  if (!room.game || room.commitment) return;
  const seats = room.members.flatMap((m, i) => m.bot ? [] : [i]);
  room.commitment = { version: 1, reconnectSeconds:RECONNECT_MS/1000, seats, eligible: !room.practice && seats.length >= 2 && room.game.mapRef?.id !== 'laboratory', disabledAt: null, majorityAbsentSince: null, startedAt: now };
}
function penalize(room, member, now, reason) {
  if (!room.commitment?.eligible || room.commitment.disabledAt != null || member.participation?.penalizedAt != null) return;
  member.participation = { ...member.participation, penalizedAt: now, reason };
}
function reconcile(room, now = Date.now()) {
  const rule = room.commitment;
  if (!rule?.eligible || room.archiveClosedAt) return;
  const members = rule.seats.map(i => room.members[i]);
  const absent = members.filter(m => !connected(m));
  const replaced = members.filter(m => !connected(m) || m.autopilot && !m.reclaim);
  const threshold = Math.ceil(rule.seats.length / 2);
  if (replaced.length >= threshold) {
    // The condition begins when the threshold-th absent participant leaves,
    // not when a later timer happens to observe it.
    rule.majorityAbsentSince ??= replaced.map(m => m.disconnectedAt ?? m.autopilotSince ?? now).sort((a,b)=>a-b)[threshold-1];
  } else rule.majorityAbsentSince = null;
  const disableAt = rule.majorityAbsentSince == null ? Infinity : rule.majorityAbsentSince + DISABLE_MS;
  // Process in logical timestamp order when a delayed tick crosses both events.
  for (const m of absent) {
    const due = (m.disconnectedAt ?? now) + RECONNECT_MS;
    if (due <= now && due < disableAt) penalize(room, m, due, 'disconnect');
  }
  if (rule.disabledAt == null && disableAt <= now) rule.disabledAt = disableAt;
}
function abandon(room, seat, now = Date.now()) {
  reconcile(room, now);
  const m = room.members[seat];
  if (!room.game || room.archiveClosedAt || ['finished','closing'].includes(room.game.phase)) return;
  m.participation = { ...m.participation, leftAt: now, definitive: true };
  penalize(room, m, now, 'explicit');
}
function deadlines(room) {
  const rule = room.commitment;
  if (!rule?.eligible || rule.disabledAt != null || room.archiveClosedAt || ['finished','closing'].includes(room.game?.phase)) return [];
  return [...(rule.majorityAbsentSince == null ? [] : [rule.majorityAbsentSince + DISABLE_MS]),
    ...rule.seats.flatMap(i => {const m=room.members[i];return !connected(m) && m.participation?.penalizedAt == null ? [(m.disconnectedAt ?? Date.now()) + RECONNECT_MS] : [];})];
}
function shift(room, elapsed) {
  if (room.commitment?.majorityAbsentSince != null) room.commitment.majorityAbsentSince += elapsed;
  for(const member of room.members) if(member.autopilotSince != null) member.autopilotSince += elapsed;
}
function restart(room) {
  if (room.commitment) room.commitment.majorityAbsentSince = null;
  for(const member of room.members) member.autopilotSince = null;
}
function publicState(room) { return room.commitment ? { eligible:room.commitment.eligible, disabled:room.commitment.disabledAt != null, reconnectSeconds:RECONNECT_MS/1000 } : null; }
module.exports = { RECONNECT_MS, DISABLE_MS, initialize, reconcile, abandon, deadlines, shift, restart, publicState };
