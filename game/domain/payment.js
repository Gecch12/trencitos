"use strict";

// A payment is data, not a mutation. Card colors come from the active rules.
function planPayment(hand, { color, quantity, wildNeeded = 0, wildCount }, { colors }) {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  if (color === "wild") {
    if (hand.filter(c => c === "wild").length < quantity) return null;
    // An all-locomotive choice fixes the composition, even for legacy callers
    // that also send a wildCount. Preserve that public payment contract.
    return { color: "wild", regular: 0, wild: quantity };
  }
  if (!colors.includes(color)) return null;
  const regular = hand.filter(c => c === color).length;
  const availableWild = hand.filter(c => c === "wild").length;
  const wild = wildCount === undefined ? Math.max(wildNeeded, quantity - regular) : wildCount;
  if (!Number.isInteger(wild) || wild < wildNeeded || wild > quantity || wild > availableWild || quantity - wild > regular) return null;
  return { color, regular: quantity - wild, wild };
}

// Test a committed base before planning a tunnel's extra. Never remove cards
// from the real hand, including when only part of the reservation is affordable.
function reservePayment(hand, payment) {
  const remaining = [...hand];
  for (const [color, count] of [[payment.color, payment.regular], ["wild", payment.wild]]) {
    for (let i = 0; i < count; i++) {
      const index = remaining.indexOf(color);
      if (index < 0) return null;
      remaining.splice(index, 1);
    }
  }
  return remaining;
}

module.exports = { planPayment, reservePayment };
