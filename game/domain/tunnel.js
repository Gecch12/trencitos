"use strict";
const { planPayment, reservePayment } = require("./payment");

// Draws are supplied by the caller; this module never reads a deck or a clock.
function beginTunnel({ routeId, base, revealed, turnDeadline, offerDeadlines }, { now, rules }) {
  const color = base.color;
  return {
    routeId, color, base: { ...base },
    surcharge: revealed.filter(c => c === "wild" || (color !== "wild" && c === color)).length,
    revealed: [...revealed], stage: "reveal", startedAt: now,
    until: now + (revealed.length + 1) * rules.cardMs,
    turnRemaining: Math.max(0, turnDeadline - now),
    offerRemaining: offerDeadlines.map(deadline => deadline === null ? null : Math.max(0, deadline - now)),
  };
}

function resultChanges(outcome, now, rules) {
  return { stage: "result", outcome, resultStartedAt: now, until: now + rules.resultMs };
}

function decideTunnel({ tunnel, hand }, command, { now, rules }) {
  if (tunnel.stage !== "decision" || !["pay", "decline"].includes(command.type)) {
    return { ok: false, error: { code: "TUNNEL_DECISION_REQUIRED" } };
  }
  const build = command.type === "pay";
  let extra;
  if (build) {
    // Compute the exact extra against the uncommitted cards. Validating against
    // a remaining hand but spending a composition from the full hand can charge twice.
    const remaining = reservePayment(hand, tunnel.base);
    extra = remaining && planPayment(remaining, {
      color: tunnel.color, quantity: tunnel.surcharge, wildCount: command.wildCount,
    }, rules);
    if (!extra) return { ok: false, error: { code: "INSUFFICIENT_TUNNEL_PAYMENT" } };
  }
  return { ok: true, plan: {
    build,
    payments: build ? [{ ...tunnel.base }, extra] : [],
    pendingChanges: {
      ...resultChanges(build ? "built" : "declined", now, rules),
      reason: !build && command.timeout ? "timeout" : null,
      ...(build ? { extra: { ...extra } } : {}),
    },
  } };
}

// One transition per tick, even after a long absence. The result always gets
// its full display interval before closing or starting the next turn.
function advanceTunnel({ tunnel, turnDeadline }, { now, rules }) {
  if (tunnel.stage === "reveal" && now >= tunnel.until) {
    if (tunnel.surcharge) return {
      kind: "decision", pendingChanges: { stage: "decision", until: null },
      turnDeadline: now + tunnel.turnRemaining,
    };
    return {
      kind: "build", payments: [{ ...tunnel.base }],
      pendingChanges: { ...resultChanges("built", now, rules), extra: { color: tunnel.color, regular: 0, wild: 0 } },
    };
  }
  if (tunnel.stage === "result" && now >= tunnel.until) return {
    kind: "close", offerDeadlines: tunnel.offerRemaining.map(remaining => remaining === null ? null : now + remaining),
  };
  if (tunnel.stage === "decision" && now >= turnDeadline) return { kind: "timeout" };
  return { kind: "wait" };
}

module.exports = { beginTunnel, decideTunnel, advanceTunnel };
