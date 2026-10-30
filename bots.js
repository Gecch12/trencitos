"use strict";
const { randomInt } = require("node:crypto");
const Engine = require("./engine");

function pick(items, random = randomInt) {
  return items.length ? items[random(items.length)] : null;
}

// Decide from the bot's own hand and public board, without inspecting the deck
// order, opponents' hands or their destinations. The engine validates the move.
function chooseBotAction(game, seat, random = randomInt) {
  if (seat !== game.current || game.phase === "finished") return null;
  const player = game.players[seat];
  if (game.phase === "initial") {
    const indexes = player.pending.map((_, i) => i);
    const first = indexes.splice(random(indexes.length), 1)[0];
    return { type: "choose_initial", indexes: [first, pick(indexes, random)] };
  }
  if (game.phase === "tunnel") {
    const { base, color, surcharge } = game.pending;
    const remaining = [...player.hand];
    for (let i = 0; i < base.regular; i++)
      remaining.splice(remaining.indexOf(color), 1);
    for (let i = 0; i < base.wild; i++)
      remaining.splice(remaining.indexOf("wild"), 1);
    const extra = Engine.pay(remaining, color, surcharge);
    return extra
      ? { type: "pay_tunnel", extraWild: extra.wild }
      : { type: "decline_tunnel" };
  }
  if (game.phase !== "play") return null;

  if (!game.drawCount) {
    const claims = [];
    for (const route of game.routes) {
      if (route.owner !== null || route.n > player.trains || Engine.block(game, route, seat))
        continue;
      const colors = route.color === "gray"
        ? [...Engine.COLORS, "wild"]
        : [route.color, "wild"];
      const payments = colors.map((color) => Engine.pay(player.hand, color, route.n, route.ferry))
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

module.exports = { chooseBotAction };
