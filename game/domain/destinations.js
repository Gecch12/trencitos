"use strict";
const { sampleIndexes } = require("./random");
const reject = code => ({ ok: false, error: { code } });

function validIndexes(indexes, length, minimum) {
  return Array.isArray(indexes) && indexes.length >= minimum && indexes.length <= length &&
    new Set(indexes).size === indexes.length && indexes.every(i => Number.isInteger(i) && i >= 0 && i < length);
}

function decideInitialChoice({ players }, { seat, indexes }, { rules }) {
  const pending = players[seat].pending;
  if (!pending.length) return reject("INITIAL_ALREADY_CHOSEN");
  if (!validIndexes(indexes, pending.length, rules.initialMinimum)) return reject("INVALID_TICKET_SELECTION");
  const initialDone = players.filter(p => !p.pending.length).length + 1;
  return { ok: true, plan: {
    kept: indexes.map(i => pending[i]), initialDone, startPlay: initialDone === players.length,
    // Initial rejections leave play; unlike later offers, they are not recycled.
  } };
}

function planOffer({ offer, shortDeck, offerSerial, turnDeadline }, { now, rules }) {
  if (offer) return reject("TICKET_OFFER_PENDING");
  if (!shortDeck.length) return reject("NO_DESTINATION_TICKETS");
  const id = (offerSerial || 0) + 1;
  const duration = rules.offerClock.kind === "remaining-turn"
    ? Math.max(0, turnDeadline - now) + rules.offerClock.extraMs : rules.offerClock.durationMs;
  const tickets = shortDeck.slice(0, rules.offerCount);
  return { ok: true, plan: { offer: { id, tickets, duration, deadline: now + duration }, takeCount: tickets.length } };
}

function decideOfferChoice({ offer }, { offerId, indexes }, { rules }) {
  if (!offer || offer.id !== offerId) return reject("TICKET_OFFER_EXPIRED");
  if (!validIndexes(indexes, offer.tickets.length, rules.offerMinimum)) return reject("INVALID_TICKET_SELECTION");
  return { ok: true, plan: {
    kept: indexes.map(i => offer.tickets[i]),
    returned: offer.tickets.filter((_, i) => !indexes.includes(i)),
  } };
}

function randomSelection(tickets, minimum, { random }) {
  return sampleIndexes(tickets.length, minimum, random);
}

module.exports = { decideInitialChoice, planOffer, decideOfferChoice, randomSelection };
