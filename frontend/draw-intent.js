"use strict";

// A local choice describes only information already visible to this player.
// It never changes the authoritative hand, deck, turn or market.
const DrawIntent = (() => {
  function create(view, seat, index, limit = 2) {
    if (!view || view.phase !== "play" || view.current !== seat || view.turnWaiting ||
        view.drawCount >= limit || !Number.isInteger(index) || index < -1 ||
        (index >= 0 && !view.face[index]) ||
        (index === -1 && view.deckCount + view.discardCount < 1) ||
        (view.drawCount > 0 && view.face[index] === "wild")) return null;
    return { index, color: index < 0 ? null : view.face[index], seat, limit,
      revision: view.revision, turnSerial: view.turnSerial, drawCount: view.drawCount,
      face: [...view.face], eventFloor: Math.max(0, ...(view.events || []).map(e => e.id)) };
  }
  function canQueue(first, view, index) {
    return !!first && view?.revision === first.revision &&
      view.turnSerial === first.turnSerial && first.drawCount + 1 < first.limit &&
      first.color !== "wild" && (index < 0 || index !== first.index) &&
      (index < 0 ? view.deckCount + view.discardCount > 1 : view.face[index] !== "wild") &&
      !!create(view, first.seat, index, first.limit);
  }
  function confirmedEvent(first, view, eventId) {
    return view?.events?.find(e => e.id === eventId && e.id > first.eventFloor &&
      e.type === "draw" && e.seat === first.seat && e.index === first.index);
  }
  function rebase(first, queued, view, eventId) {
    if (!confirmedEvent(first, view, eventId) || view.revision !== first.revision + 1 ||
        view.turnSerial !== first.turnSerial || view.drawCount !== first.drawCount + 1 ||
        view.events.some(e => e.id > first.eventFloor && e.type === "market_refresh")) return null;
    // A depleted deck can remove a slot and shift the untouched cards left.
    // A renewal invalidates every old slot, even if its new color happens to match.
    const removed = first.index >= 0 && view.face.length === first.face.length - 1;
    if (view.face.length !== first.face.length && !removed) return null;
    for (let i = 0; i < first.face.length; i++) {
      if (i === first.index) continue;
      if (view.face[i - (removed && i > first.index ? 1 : 0)] !== first.face[i]) return null;
    }
    const index = queued.index - (queued.index >= 0 && removed && queued.index > first.index ? 1 : 0);
    const next = create(view, first.seat, index, first.limit);
    return next && next.color === queued.color ? next : null;
  }
  // Present choices only while their source snapshot is valid. A state can arrive
  // before its ACK: stop adding the first card as soon as that state includes it,
  // and retain the second preview only if its original slot still survives.
  function pending(view, first, queued) {
    if (!first || !view || view.phase !== 'play' || view.current !== first.seat ||
        view.turnSerial !== first.turnSerial || view.turnWaiting) return [];
    if (view.revision === first.revision)
      return [first, ...(queued && canQueue(first, view, queued.index) ? [queued] : [])];
    const event = view.events?.find(e => e.id > first.eventFloor && e.type === 'draw' &&
      e.seat === first.seat && e.index === first.index);
    return queued && event && rebase(first, queued, view, event.id) ? [queued] : [];
  }
  return { create, canQueue, confirmedEvent, rebase, pending };
})();
if (typeof module !== "undefined" && module.exports) module.exports = DrawIntent;
