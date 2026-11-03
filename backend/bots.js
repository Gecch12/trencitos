"use strict";
const { randomInt } = require("node:crypto");
const defaultEngine = require("./engine");
const { planPayment } = require("../game/domain/payment");
const { createPracticeBot } = require("./practice-bot");

function createBots({ engine: Engine = defaultEngine } = {}) {
// Policies share immutable definitions, while practice memory remains per game
// and seat. One dispatcher can interleave different maps without global state.
const policies = new WeakMap();
function practiceFor(game) {
  const context = Engine.contextFor(game);
  if (!policies.has(context)) policies.set(context, createPracticeBot({ engine: Engine, context }));
  return policies.get(context);
}

function pick(items, random = randomInt) {
  return items.length ? items[random(items.length)] : null;
}

// Decide from the bot's own hand and public board, without inspecting the deck
// order, opponents' hands or their destinations. The engine validates the move.
function chooseSimpleAction(game, seat, random = randomInt, { randomBuild = false } = {}) {
  const player = game.players[seat];
  if (!player || game.phase === "finished" || Engine.tunnelBusy(game)) return null;
  const { rules } = Engine.contextFor(game);
  const pay = (hand, color, quantity, wildNeeded = 0) =>
    planPayment(hand, { color, quantity, wildNeeded }, rules.claim);
  if (game.phase === "initial") {
    if (!player.pending.length) return null;
    const indexes = player.pending.map((_, i) => i);
    const selected = [];
    for (let i = 0; i < rules.destinations.initialMinimum; i++) selected.push(indexes.splice(random(indexes.length), 1)[0]);
    return { type: "choose_initial", indexes: selected };
  }
  if (seat !== game.current) return null;
  if (game.phase === "tunnel") {
    const { base, color, surcharge } = game.pending;
    const remaining = [...player.hand];
    for (let i = 0; i < base.regular; i++)
      remaining.splice(remaining.indexOf(color), 1);
    for (let i = 0; i < base.wild; i++)
      remaining.splice(remaining.indexOf("wild"), 1);
    const extra = pay(remaining, color, surcharge);
    return extra
      ? { type: "pay_tunnel", extraWild: extra.wild }
      : { type: "decline_tunnel" };
  }
  if (game.phase !== "play") return null;

  const canDraw = game.deck.length || game.discard.length || game.face.some(c => !game.drawCount || c !== "wild");
  if (!game.drawCount && (!randomBuild || !canDraw || random(2) === 0)) {
    const claims = [];
    for (const route of game.routes) {
      if (route.owner !== null || route.n > player.trains || Engine.block(game, route, seat))
        continue;
      const colors = route.color === "gray"
        ? [...rules.colors, "wild"]
        : [route.color, "wild"];
      const payments = colors.map((color) => pay(player.hand, color, route.n, route.ferry))
        .filter((payment) => payment && payment.wild >= route.ferry &&
          (payment.regular > 0 || payment.color === "wild"));
      if (!payments.length) continue;
      const fewestWilds = Math.min(...payments.map((payment) => payment.wild));
      const payment = pick(payments.filter((p) => p.wild === fewestWilds), random);
      claims.push({ type: "claim", routeId: route.id, color: payment.color, wildCount: payment.wild });
    }
    if (claims.length) return pick(claims, random);
  }

  const sources = [];
  if (game.deck.length || game.discard.length) sources.push(-1);
  game.face.forEach((color, index) => {
    if (!(game.drawCount && color === "wild")) sources.push(index);
  });
  return sources.length ? { type: "draw_train", index: pick(sources, random) } : null;
}

// Keep the previously agreed replacement policy independent of practice AI.
const chooseReplacementAction = (game, seat, random = randomInt) => chooseSimpleAction(game, seat, random, { randomBuild: true });
const chooseBotAction = (game, seat, random = randomInt, options) => Engine.tunnelBusy(game) ? null
  : practiceFor(game).choosePracticeAction(game, seat, random, chooseSimpleAction, options);
return { chooseBotAction, chooseReplacementAction };
}
module.exports = { ...createBots(), createBots };
