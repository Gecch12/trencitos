"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { planPayment, reservePayment } = require("../game/domain/payment");
const rules = Object.freeze({ colors: Object.freeze(["red", "blue", "copper"]) });
const plan = (hand, options) => planPayment(Object.freeze(hand), options, rules);

test("payments use the injected palette and a single suit with optional wildcards", () => {
  assert.deepEqual(plan(["copper", "wild", "blue"], {color:"copper",quantity:2}), {color:"copper",regular:1,wild:1});
  assert.equal(plan(["red", "blue"], {color:"red",quantity:2}), null);
  assert.equal(plan(["green", "green"], {color:"green",quantity:2}), null);
});

test("minimum and explicit payments enforce the full ferry requirement", () => {
  const hand = ["red", "red", "red", "wild", "wild", "wild"];
  assert.deepEqual(plan(hand, {color:"red",quantity:3}), {color:"red",regular:3,wild:0});
  assert.deepEqual(plan(hand, {color:"red",quantity:3,wildNeeded:2}), {color:"red",regular:1,wild:2});
  assert.deepEqual(plan(hand, {color:"red",quantity:3,wildCount:3}), {color:"red",regular:0,wild:3});
  assert.equal(plan(hand, {color:"red",quantity:3,wildNeeded:2,wildCount:1}), null);
  assert.equal(plan(["red", "wild"], {color:"red",quantity:3,wildCount:1}), null);
});

test("invalid quantities and explicit wildcard counts are rejected without coercion", () => {
  const hand = ["red", "red", "wild", "wild"];
  for (const quantity of [0, -1, 1.5, "2", NaN, Infinity]) assert.equal(plan(hand, {color:"red",quantity}), null);
  for (const wildCount of [-1, 1.5, "1", null, NaN, 3]) assert.equal(plan(hand, {color:"red",quantity:2,wildCount}), null);
});

test("an all-wildcard choice fixes its count and never borrows regular cards", () => {
  assert.deepEqual(plan(["wild", "wild", "red"], {color:"wild",quantity:2,wildCount:0}), {color:"wild",regular:0,wild:2});
  assert.equal(plan(["wild", "red"], {color:"wild",quantity:2}), null);
});

test("a reserved base cannot pay the extra a second time and never mutates the hand", () => {
  const hand = Object.freeze(["red", "red", "wild"]), base = Object.freeze({color:"red",regular:2,wild:0});
  const remaining = reservePayment(hand, base);
  assert.deepEqual(remaining, ["wild"]);
  assert.equal(plan(remaining, {color:"red",quantity:1,wildCount:0}), null);
  assert.deepEqual(plan(remaining, {color:"red",quantity:1,wildCount:1}), {color:"red",regular:0,wild:1});
  assert.deepEqual(hand, ["red", "red", "wild"]);
});

test("failed and repeated reservations are pure, including empty successful remainders", () => {
  const hand = Object.freeze(["red", "wild"]), payment = Object.freeze({color:"red",regular:1,wild:2});
  assert.equal(reservePayment(hand, payment), null);
  assert.equal(reservePayment(hand, payment), null);
  assert.deepEqual(hand, ["red", "wild"]);
  assert.deepEqual(reservePayment(hand, {color:"red",regular:1,wild:1}), []);
  const remaining = reservePayment(hand, {color:"red",regular:1,wild:0});
  remaining.push("blue");
  assert.deepEqual(hand, ["red", "wild"]);
});
