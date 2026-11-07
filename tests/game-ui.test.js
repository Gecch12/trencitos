"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const UI = require("../frontend/game-ui");
const E = require("../backend/engine");

test("history anchors survive prepends, repeated messages and the 25-event cap", () => {
  assert.equal(UI.historyPrependCount([], ["Inicio"]), 1);
  assert.equal(UI.historyPrependCount(["Inicio"], ["Inicio"]), 0);
  assert.equal(UI.historyPrependCount(["Robó", "Inicio"], ["Robó", "Robó", "Inicio"]), 1);
  assert.equal(UI.historyPrependCount(["Robó", "Inicio"], ["Construyó", "Robó", "Robó", "Inicio"]), 2);
  const old = Array.from({ length: 25 }, (_, i) => `Movimiento ${25 - i}`);
  const next = ["Nuevo 2", "Nuevo 1", ...old].slice(0, 25);
  assert.equal(UI.historyPrependCount(old, next), 2);
  assert.equal(next[10 + UI.historyPrependCount(old, next)], old[10]);
  assert.equal(UI.historyPrependCount(["Anterior"], ["Otra partida"]), null);
  assert.equal(UI.historyPrependCount(old, []), null);
  assert.equal(old.length, 25);
});
test("chronological history keeps an older row anchored as new entries evict the oldest", () => {
  const previous = Array.from({ length: 25 }, (_, i) => `Event ${25 - i}`);
  const next = ["Event 27", "Event 26", ...previous].slice(0, 25);
  const newIndex = UI.historyAnchorIndex(previous, next, 10);
  assert.equal(newIndex, 8);
  assert.equal([...previous].reverse()[10], [...next].reverse()[newIndex]);
  assert.equal(UI.historyAnchorIndex(previous, next, 0), 0);
  assert.equal(UI.historyAnchorIndex(["B", "A"], ["C", "B", "A"], 0), 0);
});
test("draw animations ignore initial/reconnect snapshots, duplicates and finished games", () => {
  const drawEvent = { id: 2, seat: 1, index: -1 };
  const game = { phase: "play", drawEvent };
  assert.equal(UI.newDrawEvent(null, game), null);
  assert.equal(UI.newDrawEvent(1, game), drawEvent);
  assert.equal(UI.newDrawEvent(2, game), null);
  assert.equal(UI.newDrawEvent(3, game), null);
  assert.equal(UI.newDrawEvent(1, { ...game, phase: "finished" }), null);
  assert.equal(UI.newDrawEvent(1, { phase: "play" }), null);
});
test("missing destination progress is unknown, never falsely pending", () => {
  assert.equal(UI.destinationStatus({}, 15), null);
  assert.equal(UI.destinationStatus({ ticketProgress: [] }, 15), null);
  assert.equal(UI.destinationStatus({ ticketProgress: [{ id: 15 }] }, 15), null);
  assert.equal(UI.destinationStatus({ ticketProgress: [{ id: 15, completed: false }] }, 15).completed, false);
  assert.equal(UI.destinationStatus({ ticketProgress: [{ id: 15, completed: true }] }, 15).completed, true);
  assert.notEqual(UI.WHITE, UI.NEUTRAL);
});

function view(hand = []) {
  const state = E.newGame(["Ana", "Beto", "Cora", "Dani"]);
  state.phase = "play";
  state.players[0].hand = hand;
  return E.view(state, 0);
}
test("yellow and amber are presented without mutating saved color keys", () => {
  assert.equal(UI.playerColor("#ddaf40"), "#e5a12c");
  assert.equal(UI.playerColor("#DDAF40"), "#e5a12c");
  assert.equal(UI.playerColor(UI.YELLOW), "#e5a12c");
  assert.equal(UI.playerColor("#b88929"), "#f2d33d");
  assert.equal(UI.playerFinish("#b88929"), "paint");
  assert.equal(UI.playerColor("#458ad4"), "#458ad4");
});
test("route ownership identifies seat zero, opponents and individual double-route tracks", () => {
  const game = view(), original = structuredClone(game);
  const route = { owner: 0 };
  assert.equal(UI.routeOwner(game, route, 0).label, "Esta ruta es tuya");
  assert.equal(UI.routeOwner(game, route, 1).label, "Ocupada por Ana");
  assert.equal("mark" in UI.routeOwner(game, route, 1), false);
  assert.equal(UI.routeOwner(game, { owner: 3 }, 0).color, "#e5a12c");
  assert.equal(UI.routeOwner(game, { owner: null }, 0), null);
  assert.equal(UI.routeOwner(game, null, 0), null);
  const pair = [{ id: 1, a: "A", b: "B", owner: 1 }, { id: 2, a: "A", b: "B", owner: null }];
  assert.equal(UI.routeOwner(game, pair[0], 0).name, "Beto");
  assert.equal(UI.routeOwner(game, pair[1], 0), null);
  assert.deepEqual(game, original);
});
test("gray payments inspect every color, prefer fewer wilds and never mix colors", () => {
  assert.deepEqual(UI.payments(["blue", "blue", "wild"], 3), [{ color: "blue", wild: 1, regular: 2 }]);
  assert.deepEqual(UI.payments(["red", "blue", "green"], 3), []);
  assert.deepEqual(UI.payments(["blue", "blue", "blue"], 3, "red"), []);
  assert.equal(UI.payments(["red", "red", "wild"], 2)[0].wild, 0);
});
test("all offered payment combinations agree with authoritative engine, including ferries", () => {
  for (let red = 0; red <= 4; red++) for (let blue = 0; blue <= 4; blue++) for (let wild = 0; wild <= 4; wild++) {
    const hand = [...Array(red).fill("red"), ...Array(blue).fill("blue"), ...Array(wild).fill("wild")];
    for (const cost of [1, 2, 3, 4]) for (const ferry of [0, 1, 2]) {
      const options = UI.payments(hand, cost, "gray", ferry);
      for (const option of options) {
        assert.ok(E.pay(hand, option.color, cost, ferry, option.wild));
        assert.ok(option.wild >= ferry);
      }
      const affordable = [...E.COLORS, "wild"].some(color => {
        const payment = E.pay(hand, color, cost, ferry);
        return payment && payment.wild >= ferry;
      });
      assert.equal(options.length > 0, affordable);
    }
  }
});
test("construction allows a tunnel with just its base cost, without reserving hypothetical surcharge", () => {
  const game = view(["red", "red"]);
  game.routes = [{ id: 0, a: "A", b: "B", n: 2, color: "red", ferry: 0, tunnel: true, owner: null }];
  assert.equal(UI.construction(game, 0, { routeId: 0 }).reason, null);
  game.routes[0].ferry = 1;
  assert.match(UI.construction(game, 0, { routeId: 0 }).reason, /cartas suficientes/);
});
test("tunnel payments reserve base first, allow matching colors and prefer preserving wildcards", () => {
  const tunnel = { color: "white", base: { color: "white", regular: 2, wild: 1 }, surcharge: 2 };
  const hand = ["white", "white", "white", "white", "wild", "wild", "wild", "red"];
  const before = [...hand];
  assert.deepEqual(UI.tunnelPayments(hand, tunnel), [
    { color: "white", regular: 2, wild: 0 },
    { color: "white", regular: 1, wild: 1 },
    { color: "wild", regular: 0, wild: 2 },
  ]);
  assert.deepEqual(hand, before);
  assert.deepEqual(UI.tunnelPayments(["white", "white", "wild", "red", "red"], tunnel), []);
  assert.deepEqual(UI.tunnelPayments(["white", "white", "white", "wild", "wild"], tunnel), [
    { color: "white", regular: 1, wild: 1 },
  ]);
});
test("a tunnel started with only wildcards cannot pay its surcharge with colored cards", () => {
  const tunnel = { color: "wild", base: { color: "wild", regular: 0, wild: 2 }, surcharge: 1 };
  assert.deepEqual(UI.tunnelPayments(["wild", "wild", "red", "red"], tunnel), []);
  assert.deepEqual(UI.tunnelPayments(["wild", "wild", "wild", "red"], tunnel), [
    { color: "wild", regular: 0, wild: 1 },
  ]);
  assert.deepEqual(UI.tunnelPayments(["wild"], tunnel), []);
});
test("every displayed tunnel payment agrees with server acceptance after base reservation", () => {
  const template = E.newGame(["A", "B"]);
  for (const color of ["red", "wild"]) for (let regular = 0; regular <= 5; regular++) for (let wild = 0; wild <= 5; wild++) {
    const hand = [...Array(regular).fill("red"), ...Array(wild).fill("wild")];
    const base = E.pay(hand, color, 2);
    if (!base) continue;
    for (let surcharge = 1; surcharge <= 3; surcharge++) {
      const pending = { routeId: 0, color, base, surcharge, revealed: Array(surcharge).fill("wild") };
      const shown = UI.tunnelPayments(hand, pending).map(o => o.wild);
      const accepted = [];
      for (let extraWild = 0; extraWild <= surcharge; extraWild++) {
        const g = structuredClone(template);
        g.players[0].hand = [...hand]; g.phase = "tunnel"; g.pending = structuredClone(pending);
        try { E.action(g, 0, { type: "pay_tunnel", extraWild }); accepted.push(extraWild); }
        catch (error) { assert.match(error.message, /cartas/); }
      }
      // Engine ignores extraWild for all-wild payments; UI offers the one actual composition.
      assert.deepEqual(shown, color === "wild" && accepted.length ? [surcharge] : accepted);
    }
  }
});
test("construction distinguishes occupied routes, wagon shortages, turn and pending actions", () => {
  const game = view(Array(8).fill("wild")), target = { routeId: 0 };
  game.routes[0].owner = 1;
  assert.match(UI.construction(game, 0, target).reason, /ocupada/);
  game.routes[0].owner = null;
  game.players[0].trains = 0;
  assert.match(UI.construction(game, 0, target).reason, /vagones/);
  game.current = 1;
  assert.match(UI.construction(game, 0, target).reason, /turno/);
  game.current = 0; game.phase = "tunnel";
  assert.match(UI.construction(game, 0, target).reason, /pendiente/);
  game.phase = "play"; game.drawCount = 1;
  assert.match(UI.construction(game, 0, target).reason, /robar/);
});
test("parallel-route eligibility matches engine for either endpoint orientation", () => {
  const game = view(["red"]);
  game.routes = [
    { id: 0, a: "A", b: "B", color: "red", n: 1, ferry: 0, owner: null },
    { id: 1, a: "B", b: "A", color: "red", n: 1, ferry: 0, owner: 1 },
  ];
  assert.equal(UI.construction(game, 0, { routeId: 0 }).reason, null);
  game.players.pop();
  assert.match(UI.construction(game, 0, { routeId: 0 }).reason, /paralela/);
  game.players.push({}); game.routes[1].owner = 0;
  assert.match(UI.construction(game, 0, { routeId: 0 }).reason, /paralela/);
});
test("station options reflect increasing cost, occupied cities and remaining stations", () => {
  const game = view(["blue", "wild"]), target = { city: "London" };
  assert.equal(UI.construction(game, 0, target).cost, 1);
  game.players[0].stations = 2;
  assert.deepEqual(UI.construction(game, 0, target).options, [{ color: "blue", wild: 1, regular: 1 }]);
  game.players[1].placed = ["London"];
  assert.match(UI.construction(game, 0, target).reason, /ya tiene/);
  game.players[0].stations = 0;
  assert.match(UI.construction(game, 0, target).reason, /quedan estaciones/);
});
test("pass is only visible when no draw, destination, route or station is available", () => {
  const game = view();
  game.deckCount = game.discardCount = game.ticketDeckCount = 0;
  game.face = [];
  assert.equal(UI.canPass(game, 0, Object.keys(E.CITIES)), true);
  game.hand = ["wild"];
  assert.equal(UI.canPass(game, 0, Object.keys(E.CITIES)), false);
  game.hand = []; game.ticketDeckCount = 1;
  assert.equal(UI.canPass(game, 0, Object.keys(E.CITIES)), false);
});
test("fit reserves HUD space but camera covers the whole desktop stage", () => {
  const bounds = { x: -60, y: -10, width: 980, height: 660 };
  for (const [width, height] of [[1280, 668], [1366, 716], [1920, 1028]]) {
    const safe = { x: 16, y: 64, width: width - 360, height: height - 260 };
    const camera = UI.camera(bounds, { width, height }, safe, 1, { x: 430, y: 320 });
    const left = (bounds.x - camera.x) / camera.scale, top = (bounds.y - camera.y) / camera.scale;
    assert.ok(left >= safe.x - 1e-6 && top >= safe.y - 1e-6);
    assert.ok(left + bounds.width / camera.scale <= safe.x + safe.width + 1e-6);
    assert.ok(top + bounds.height / camera.scale <= safe.y + safe.height + 1e-6);
    assert.ok(Math.abs(camera.width / camera.scale - width) < 1e-8);
    assert.ok(Math.abs(camera.height / camera.scale - height) < 1e-8);
  }
});
test("overview reaches 25%, panning works at fit and below, and bounds keep map reachable", () => {
  const bounds = { x: 0, y: 0, width: 980, height: 660 }, viewport = { width: 1366, height: 716 };
  const safe = { x: 16, y: 64, width: 900, height: 400 }, center = { x: 490, y: 330 };
  assert.equal(UI.MIN_ZOOM, .25);
  assert.equal(UI.MAX_ZOOM, 12);
  const fit = UI.camera(bounds, viewport, safe, 1, center);
  const overview = UI.camera(bounds, viewport, safe, UI.MIN_ZOOM, center);
  assert.equal(overview.scale, fit.scale * 4);
  for (const zoom of [.25, 1, 3]) {
    const moved = UI.camera(bounds, viewport, safe, zoom, { x: 550, y: 370 });
    assert.deepEqual(moved.focus, { x: 550, y: 370 });
    const extreme = UI.camera(bounds, viewport, safe, zoom, { x: 1e9, y: -1e9 });
    const right = (980 - extreme.x) / extreme.scale, bottom = (660 - extreme.y) / extreme.scale;
    assert.ok(right > safe.x);
    assert.ok(bottom > safe.y);
  }
});
test("overview labels declutter nearby cities but retain both focused endpoints", () => {
  const entries = [
    { key: "A", x: 100, y: 100, width: 80 },
    { key: "B", x: 120, y: 110, width: 80 },
    { key: "C", x: 400, y: 100, width: 80 },
  ];
  assert.deepEqual(UI.overviewLabels(entries, new Set()).map(e => e.key), ["A", "C"]);
  assert.deepEqual(UI.overviewLabels(entries, new Set(["B"])).map(e => e.key), ["B", "C"]);
  assert.deepEqual(UI.overviewLabels(entries, new Set(["A", "B"])).map(e => e.key), ["A", "B", "C"]);
  assert.deepEqual(entries.map(e => e.key), ["A", "B", "C"]);
});
test("zoom around cursor preserves its world coordinate with an off-center safe rectangle", () => {
  const bounds = { x: 0, y: 0, width: 980, height: 660 }, viewport = { width: 1366, height: 716 };
  const safe = { x: 16, y: 64, width: 1000, height: 450 };
  const center = { x: 490, y: 330 }, cursor = { x: 600, y: 300 };
  const a = UI.camera(bounds, viewport, safe, 1.5, center);
  const b = UI.camera(bounds, viewport, safe, 2, center);
  const c = UI.camera(bounds, viewport, safe, 2, {
    x: center.x + (cursor.x - a.sx) * (a.scale - b.scale),
    y: center.y + (cursor.y - a.sy) * (a.scale - b.scale),
  });
  assert.ok(Math.abs(a.x + cursor.x * a.scale - c.x - cursor.x * c.scale) < 1e-8);
  assert.ok(Math.abs(a.y + cursor.y * a.scale - c.y - cursor.y * c.scale) < 1e-8);
});

test("mobile cameras clear the permanent HUD and tablets reserve side panels", () => {
  const bounds = { x: -60, y: -10, width: 980, height: 660 }, center = { x: 430, y: 320 };
  for (const [width, height] of [[320, 518], [390, 794], [768, 974], [1024, 718], [844, 340]]) {
    for (const open of [false, true]) {
      // Phone sheets overlay a stable camera; tablet sheets reserve its right side.
      const safe = UI.safeArea({ width, height }, { top: height < 400 ? 60 : 134, right: open && width >= 700 ? 340 : 8, bottom: height < 400 ? 143 : 183 });
      assert.ok(safe.width > 0 && safe.height > 0);
      const camera = UI.camera(bounds, { width, height }, safe, 1, center);
      assert.ok(Number.isFinite(camera.scale));
      const x = (bounds.x - camera.x) / camera.scale, y = (bounds.y - camera.y) / camera.scale;
      assert.ok(x >= safe.x - 1e-6 && y >= safe.y - 1e-6);
      assert.ok(x + bounds.width / camera.scale <= safe.x + safe.width + 1e-6);
      assert.ok(y + bounds.height / camera.scale <= safe.y + safe.height + 1e-6);
    }
  }
  assert.equal(UI.safeArea({ width: 100, height: 100 }, { top: 200, bottom: 200, right: 200 }).width, 1);
});
test("pinch zoom is proportional, bounded, and safe for coincident fingers", () => {
  assert.equal(UI.pinchZoom(1, 100, 200), 2);
  assert.equal(UI.pinchZoom(2, 200, 100), 1);
  assert.equal(UI.pinchZoom(1, 1, 10000), UI.MAX_ZOOM);
  assert.equal(UI.pinchZoom(1, 10000, 1), UI.MIN_ZOOM);
  assert.ok(Number.isFinite(UI.pinchZoom(1, 0, 0)));
});
