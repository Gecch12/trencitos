"use strict";
const { shuffle } = require("./random");

// Only this private working copy is mutable. Plans never alter the caller's piles.
const workingCopy = state => ({ piles: { deck: [...state.deck], discard: [...state.discard], face: [...state.face] },
  recycled: false, refresh: null });

function recycle(plan, random) {
  const piles = plan.piles;
  if (!piles.discard.length) return;
  piles.deck = shuffle([...piles.deck, ...piles.discard], random);
  piles.discard = [];plan.recycled = true;
}

function take(plan, random) {
  if (!plan.piles.deck.length) recycle(plan, random);
  return plan.piles.deck.pop() || null;
}

function drawCard(state, { random }) {
  const plan = workingCopy(state);
  plan.card = take(plan, random);
  return plan;
}

// Called at resolution boundaries; pending tunnel cards are outside these piles.
function recycleDiscards(state, { random }) {
  const plan = workingCopy(state);
  recycle(plan, random);
  return plan;
}

function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  let total = 1;
  for (let i = 1; i <= k; i++) total = total * (n - i + 1) / i;
  return Math.round(total);
}

function refill(plan, { rules, random }) {
  const piles = plan.piles, { marketSize, refreshWildCount } = rules;
  while (piles.face.length < marketSize) {
    const card = take(plan, random);if (!card) break;
    piles.face.push(card);
  }
  if (piles.face.length < marketSize || piles.face.filter(card => card === "wild").length < refreshWildCount) return;
  const before = [...piles.face];
  piles.discard.push(...piles.face);piles.face = [];recycle(plan, random);
  // Condition the market on its permitted wild count instead of retrying forever.
  // If no valid full market exists, deal once from the recycled deck.
  const wild = piles.deck.filter(card => card === "wild").length, regular = piles.deck.length - wild;
  const weights = Array.from({ length: refreshWildCount }, (_, k) => combinations(wild, k) * combinations(regular, marketSize - k));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!total) {
    while (piles.face.length < marketSize) {
      const card = take(plan, random);if (!card) break;
      piles.face.push(card);
    }
  } else {
    let pick = random(total), neededWild = 0;
    while (pick >= weights[neededWild]) pick -= weights[neededWild++];
    let neededRegular = marketSize - neededWild;
    for (let i = piles.deck.length - 1; i >= 0 && (neededWild || neededRegular); i--) {
      const isWild = piles.deck[i] === "wild";
      if (isWild ? neededWild : neededRegular) {
        piles.face.push(...piles.deck.splice(i, 1));
        if (isWild) neededWild--;else neededRegular--;
      }
    }
    piles.face = shuffle(piles.face, random);
  }
  plan.refresh = { before, after: [...piles.face] };
}

function refillMarket(state, context) {
  const plan = workingCopy(state);
  refill(plan, context);
  return plan;
}

function canDrawMore({ deck, discard, face, drawCount }) {
  return Boolean(deck.length || discard.length || face.some(card => !(drawCount > 0 && card === "wild")));
}

function decideTrainDraw(state, { index }, context) {
  if (!Number.isInteger(index) || index < -1 || index >= state.face.length)
    return { ok: false, error: { code: "TRAIN_CARD_UNAVAILABLE" } };
  if (index >= 0 && state.face[index] === "wild" && state.drawCount > 0)
    return { ok: false, error: { code: "VISIBLE_WILD_AFTER_FIRST_DRAW" } };
  const plan = workingCopy(state), { piles } = plan;
  const card = index === -1 ? take(plan, context.random) : piles.face[index];
  if (!card) return { ok: false, error: { code: "NO_TRAIN_CARDS" } };
  if (index >= 0) {
    const replacement = take(plan, context.random);
    if (replacement) piles.face[index] = replacement;else piles.face.splice(index, 1);
    refill(plan, context);
  }
  const drawCount = state.drawCount + 1;
  return { ok: true, plan: { ...plan, card, drawCount,
    endTurn: (index >= 0 && card === "wild") || drawCount === context.rules.drawsPerTurn || !canDrawMore({ ...piles, drawCount }) } };
}

module.exports = { drawCard, recycleDiscards, refillMarket, canDrawMore, decideTrainDraw };
