"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Cards = require("../game/domain/train-cards");
const rules = Object.freeze({ marketSize: 5, refreshWildCount: 3, drawsPerTurn: 2 });
const forbidden = () => { throw Error("unexpected randomness"); };
const context = { rules, random: forbidden };
const pile = (values = {}) => ({ deck: [], discard: [], face: [], drawCount: 0, ...values });
const inventory = state => [...state.deck, ...state.discard, ...state.face].sort();
function frozen(state) {
  for (const value of Object.values(state)) if (Array.isArray(value)) Object.freeze(value);
  return Object.freeze(state);
}

test("blind draw takes the top card without mutating inputs or consulting randomness", () => {
  const state = frozen(pile({ deck: ["copper", "wild"], discard: ["blue"] }));
  const plan = Cards.drawCard(state, context);
  assert.equal(plan.card, "wild");assert.deepEqual(plan.piles.deck, ["copper"]);
  assert.deepEqual(plan.piles.discard, ["blue"]);assert.equal(plan.recycled, false);
  assert.deepEqual(state.deck, ["copper", "wild"]);
  assert.equal(Cards.drawCard(frozen(pile()), context).card, null);
});

test("an empty deck draws from one shuffled discard batch with an explicit random stream", () => {
  const bounds = [], state = frozen(pile({ discard: ["red", "blue", "wild"] }));
  const plan = Cards.drawCard(state, { rules, random: max => { bounds.push(max);return 0; } });
  assert.deepEqual(bounds, [3,2]);assert.equal(plan.card, "red");assert.equal(plan.recycled, true);
  assert.deepEqual(plan.piles.deck, ["blue", "wild"]);assert.deepEqual(plan.piles.discard, []);
  assert.deepEqual([...inventory(plan.piles), plan.card].sort(), inventory(state));
});

test("resolved discards mix with the remaining deck once and exclude pending tunnel reveals", () => {
  const state = frozen(pile({ deck: ["blue"], discard: ["red", "wild"], face: ["green"], revealed: ["yellow"] }));
  const bounds = [], plan = Cards.recycleDiscards(state, { random: max => { bounds.push(max);return max - 1; } });
  assert.deepEqual(bounds, [3,2]);assert.deepEqual(plan.piles.deck, ["blue", "red", "wild"]);
  assert.deepEqual(inventory(plan.piles), inventory(state));assert.deepEqual(state.revealed, ["yellow"]);
  assert.equal(Cards.recycleDiscards(frozen(pile({ deck: ["blue"] })), context).recycled, false);
});

test("visible draws replace the selected slot or shrink the market when the deck is exhausted", () => {
  for (let index = 0; index < 5; index++) {
    const face = ["red", "blue", "green", "yellow", "copper"];
    const state = frozen(pile({ deck: ["purple"], face }));
    const plan = Cards.decideTrainDraw(state, { index }, context).plan;
    assert.equal(plan.card, face[index]);const expected = [...face];expected[index] = "purple";
    assert.deepEqual(plan.piles.face, expected);assert.equal(plan.drawCount, 1);assert.equal(plan.endTurn, false);
    const second = Cards.decideTrainDraw({ ...plan.piles, drawCount: 1 }, { index }, context).plan;
    expected.splice(index, 1);assert.deepEqual(second.piles.face, expected);assert.equal(second.endTurn, true);
    assert.deepEqual([...inventory(second.piles), plan.card, second.card].sort(), inventory(state));
  }
});

test("visible locomotives finish the turn; blind locomotives count as one draw", () => {
  const visible = Cards.decideTrainDraw(frozen(pile({ deck: ["blue"], face: ["wild"] })), { index: 0 }, context).plan;
  assert.equal(visible.endTurn, true);assert.equal(visible.drawCount, 1);
  for (const drawCount of [0,1]) {
    const blind = Cards.decideTrainDraw(frozen(pile({ deck: ["red", "wild"], drawCount })), { index: -1 }, context).plan;
    assert.equal(blind.card, "wild");assert.equal(blind.endTurn, drawCount === 1);
  }
});

test("invalid indexes, exhausted blind piles and second visible wilds reject without randomness or mutation", () => {
  const state = frozen(pile({ face: ["wild"], drawCount: 1 })), before = structuredClone(state);
  for (const index of [undefined, null, "0", -2, 1, 0.5, Infinity])
    assert.deepEqual(Cards.decideTrainDraw(state, { index }, context), { ok: false, error: { code: "TRAIN_CARD_UNAVAILABLE" } });
  assert.deepEqual(Cards.decideTrainDraw(state, { index: -1 }, context), { ok: false, error: { code: "NO_TRAIN_CARDS" } });
  assert.deepEqual(Cards.decideTrainDraw(state, { index: 0 }, context), { ok: false, error: { code: "VISIBLE_WILD_AFTER_FIRST_DRAW" } });
  assert.deepEqual(state, before);
});

test("a final available regular card ends the turn even if only visible wilds remain", () => {
  for (const index of [-1,0]) {
    const state = index === -1 ? pile({ deck: ["red"], face: ["wild"] }) : pile({ face: ["red", "wild"] });
    const plan = Cards.decideTrainDraw(frozen(state), { index }, context).plan;
    assert.equal(plan.endTurn, true);assert.equal(plan.drawCount, 1);
  }
  assert.equal(Cards.canDrawMore(pile({ face: ["wild"] })), true);
  assert.equal(Cards.canDrawMore(pile({ face: ["wild"], drawCount: 1 })), false);
  assert.equal(Cards.canDrawMore(pile({ discard: ["wild"], drawCount: 1 })), true);
});

test("turn draw limits are supplied by rules and cannot be overwritten by the command", () => {
  for (const drawsPerTurn of [1,3]) {
    const custom = { ...context, rules: { ...rules, drawsPerTurn } };
    let state = frozen(pile({ deck: ["red", "blue", "green", "copper"] }));
    for (let i = 1; i <= drawsPerTurn; i++) {
      const plan = Cards.decideTrainDraw(state, { index: -1, drawsPerTurn: 999, drawCount: -1 }, custom).plan;
      assert.equal(plan.drawCount, i);assert.equal(plan.endTurn, i === drawsPerTurn);
      state = frozen({ ...plan.piles, drawCount: plan.drawCount });
    }
  }
  const noSecond = Cards.decideTrainDraw(frozen(pile({ face: ["red", "wild"] })), { index: 0 },
    { ...context, rules: { ...rules, drawsPerTurn: 3 } }).plan;
  assert.equal(noSecond.endTurn, true);
});

test("partial markets refill up to the supplied size without renewing an incomplete market", () => {
  const state = frozen(pile({ deck: ["wild"], face: ["wild", "wild"] }));
  const partial = Cards.refillMarket(state, context);
  assert.equal(partial.refresh, null);assert.deepEqual(partial.piles.face, ["wild", "wild", "wild"]);
  const small = Cards.refillMarket(frozen(pile({ deck: ["copper", "blue", "green", "red"] })),
    { ...context, rules: { ...rules, marketSize: 3, refreshWildCount: 2 } });
  assert.deepEqual(small.piles.face, ["red", "green", "blue"]);assert.deepEqual(small.piles.deck, ["copper"]);
});

test("market renewal samples the conditional combinatorial weights and preserves every card", () => {
  // 3 wilds + 3 regulars, size 3, maximum 1 wild: weights C(3,0)*C(3,3)=1 and C(3,1)*C(3,2)=9.
  for (let pick = 0; pick < 10; pick++) {
    const state = frozen(pile({ deck: ["red", "blue", "copper"], face: ["wild", "wild", "wild"] }));
    const bounds = [], plan = Cards.refillMarket(state, { rules: { ...rules, marketSize: 3, refreshWildCount: 2 },
      random: max => { bounds.push(max);return bounds.length === 6 ? pick : max - 1; } });
    assert.deepEqual(bounds, [6,5,4,3,2,10,3,2]);
    assert.equal(plan.piles.face.filter(card => card === "wild").length, pick === 0 ? 0 : 1);
    assert.deepEqual(inventory(plan.piles), inventory(state));assert.equal(plan.recycled, true);
    assert.deepEqual(plan.refresh, { before: ["wild", "wild", "wild"], after: plan.piles.face });
  }
});

test("an impossible valid market deals once after recycling instead of looping", () => {
  for (const regular of [0,1,2]) {
    const state = frozen(pile({ deck: Array(regular).fill("blue"), face: Array(5).fill("wild") }));
    const bounds = [], plan = Cards.refillMarket(state, { rules, random: max => { bounds.push(max);return max - 1; } });
    assert.equal(bounds.length, 4 + regular);assert.equal(plan.piles.face.length, 5);
    assert.deepEqual(inventory(plan.piles), inventory(state));assert.ok(plan.refresh);
  }
});

test("visible replacement reports the triggering market before the draw is published", () => {
  const state = frozen(pile({ face: ["wild", "wild", "red", "blue", "green"], deck: ["copper", "yellow", "wild"] }));
  const plan = Cards.decideTrainDraw(state, { index: 2 }, { rules, random: max => max - 1 }).plan;
  assert.equal(plan.card, "red");assert.equal(plan.drawCount, 1);
  assert.deepEqual(plan.refresh.before, ["wild", "wild", "wild", "blue", "green"]);
  assert.deepEqual(plan.refresh.after, plan.piles.face);
  assert.deepEqual([...inventory(plan.piles), plan.card].sort(), inventory(state));
});
