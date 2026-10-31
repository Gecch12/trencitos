"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { connect } = require("./helpers/ws-client");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rail-practice-test-"));
process.env.STATE_FILE = path.join(directory, "rooms.json");
const { server, rooms } = require("../server");
const clients = [];
let port;
test.before(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = server.address().port;
});
test.after(async () => {
  clients.forEach((client) => client.close());
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
});
async function client() {
  const peer = await connect(port);
  clients.push(peer);
  return peer;
}

test("the browser receives the shared cartography before the application script", async () => {
  const base = `http://127.0.0.1:${port}`;
  const asset = await fetch(base + "/map-layout.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.match(await asset.text(), /const RailMap/);
  const html = await (await fetch(base + "/")).text();
  assert.ok(html.indexOf('src="data.js"') < html.indexOf('src="map-layout.js"'));
  assert.ok(html.indexOf('src="map-layout.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.indexOf('src="game-ui.js"') < html.indexOf('src="app.js"'));
  assert.ok(html.includes('href="responsive.css"'));
  assert.ok(html.indexOf('href="game.css"') < html.indexOf('href="responsive.css"'));
  for (const [file, mime] of [["game-ui.js", /javascript/], ["game.css", /css/], ["responsive.css", /css/]]) {
    const response = await fetch(base + "/" + file);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), mime);
  }
});

test("WebSocket practice flow: create, choose tickets, bots, finish, leave and create again", async () => {
  const peer = await client();
  peer.send({ type: "create_test", name: "Probador" });
  const lobby = await peer.next("lobby");
  assert.equal(lobby.practice, true);
  assert.equal(lobby.members.length, 4);
  assert.equal(lobby.seat, 0);
  assert.equal(lobby.members.filter((member) => member.bot).length, 3);
  assert.ok(lobby.members.every((member) => member.connected));
  const initial = (await peer.next("state")).game;
  assert.equal(initial.phase, "initial");
  assert.equal(initial.players.length, 4);
  assert.equal(initial.current, rooms.get(lobby.code).game.first);
  if (!initial.initial) await peer.next("state", m => !!m.game.initial, 10000);
  assert.equal(initial.players[1].hand, undefined);
  assert.equal(fs.existsSync(process.env.STATE_FILE), false);

  const outsider = await client();
  outsider.send({ type: "join", code: lobby.code, name: "Invitado" });
  assert.match((await outsider.next("error")).message, /solo para su creador/);

  peer.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  const playing = (await peer.next("state", (message) => message.game.phase === "play" && message.game.current === 0, 10000)).game;
  assert.equal(playing.current, 0);
  assert.ok(playing.players.every((player) => player.ticketsCount === 2));

  // Bots resume while the human is still considering a private offer.
  peer.send({ type: "action", action: { type: "draw_tickets" } });
  const offer = (await peer.next("state", message => !!message.game.ticketOffer)).game.ticketOffer;
  assert.equal(offer.tickets.length, 3);
  peer.send({ type: "action", action: { type: "keep_tickets", offerId: offer.id, indexes: [1] } });
  // Three bots can each draw twice: six delays of up to 1000 ms, plus CI slack.
  const resumed = (await peer.next("state", (message) => message.game.phase === "play" && message.game.current === 0, 10000)).game;
  assert.equal(resumed.tickets.at(-1).id, offer.tickets[1].id);
  assert.equal(resumed.tickets.length, 3);

  // Complete a human draw turn so there is a bot action pending when stopped.
  peer.send({ type: "action", action: { type: "draw_train", index: -1 } });
  await peer.next("state", (message) => message.game.drawCount === 1);
  peer.send({ type: "action", action: { type: "draw_train", index: -1 } });
  await peer.next("state", (message) => message.game.current === 1);
  peer.send({ type: "finish_test" });
  const ended = (await peer.next("state", (message) => message.game.phase === "finished")).game;
  assert.equal(ended.earlyFinish, true);
  assert.equal(ended.result.length, 4);
  assert.ok(ended.result.every(r => r.details && r.details.totals.total === r.score));
  assert.equal(fs.existsSync(process.env.STATE_FILE), false);

  peer.send({ type: "leave_test" });
  await peer.next("room_closed");
  assert.equal(rooms.has(lobby.code), false);
  peer.send({ type: "create_test", name: "Otra prueba" });
  assert.equal((await peer.next("lobby", (message) => message.code !== lobby.code)).practice, true);
  peer.send({ type: "leave_test" });
  await peer.next("room_closed");
});

test("only the original human token reconnects and a stale connection cannot act", async () => {
  const original = await client();
  original.send({ type: "create_test", name: "Reconexión" });
  const lobby = await original.next("lobby");
  const replacement = await client();
  replacement.send({ type: "join", code: lobby.code, token: lobby.token });
  const restored = await replacement.next("lobby");
  assert.equal(restored.token, lobby.token);
  assert.equal(restored.practice, true);
  assert.equal((await replacement.next("state")).game.phase, "initial");
  const room = rooms.get(lobby.code);
  assert.ok(room.members[0].ws);
  replacement.send({ type: "finish_test" });
  assert.equal((await replacement.next("state", (message) => message.game.phase === "finished")).game.earlyFinish, true);
  replacement.send({ type: "leave_test" });
  await replacement.next("room_closed");
});

test("WebSocket construction returns payment to deck and sends private completed-ticket progress", async () => {
  const E = require("../engine");
  const peer = await client();
  peer.send({ type: "create_test", name: "Reciclaje" });
  const lobby = await peer.next("lobby");
  await peer.next("state");
  const g = rooms.get(lobby.code).game;
  const pool = [...g.deck, ...g.discard, ...g.face, ...g.players.flatMap(p => p.hand)];
  g.players.forEach(p => { p.hand = []; p.pending = []; p.tickets = []; });
  g.deck = pool; g.discard = []; g.face = []; g.phase = "play"; g.current = 0;
  g.players[0].hand.push(...g.deck.splice(g.deck.indexOf("purple"), 1));
  E.refill(g);
  const route = g.routes.find(r => r.a === "DIE" && r.b === "PAR");
  g.players[0].tickets = [{ id: "private-test", a: "DIE", b: "PAR", p: 5 }];
  const deckBefore = g.deck.length, faceBefore = [...g.face];
  peer.send({ type: "action", action: { type: "claim", routeId: route.id, color: "purple", wildCount: 0 } });
  const view = (await peer.next("state", m => m.game.routes[route.id].owner === 0)).game;
  assert.equal(view.deckCount, deckBefore + 1);
  assert.equal(view.discardCount, 0);
  assert.deepEqual(view.face, faceBefore);
  assert.equal(view.hand.length, 0);
  assert.deepEqual(view.ticketProgress, [{ id: "private-test", completed: true, viaStation: false }]);
  assert.ok(view.players.every(p => !("tickets" in p) && !("ticketProgress" in p)));
  assert.equal(g.deck.length + g.face.length + g.players.flatMap(p => p.hand).length, 110);
  peer.send({ type: "leave_test" });
  await peer.next("room_closed");
});

test("WebSocket draw events disclose blind colors only to the drawing client", async () => {
  const a = await client(), b = await client();
  a.send({ type: "create", name: "A" });
  const lobby = await a.next("lobby");
  b.send({ type: "join", code: lobby.code, name: "B" });
  await b.next("lobby");
  a.send({ type: "start" });
  await a.next("state"); await b.next("state");
  const g = rooms.get(lobby.code).game;
  g.phase = "play"; g.current = 0;
  const blindColor = g.deck.at(-1);
  a.send({ type: "action", action: { type: "draw_train", index: -1 } });
  const own = (await a.next("state", m => m.game.drawEvent?.id === 1)).game;
  const rival = (await b.next("state", m => m.game.drawEvent?.id === 1)).game;
  assert.equal(own.drawEvent.color, blindColor);
  assert.deepEqual(rival.drawEvent, { id: 1, seat: 0, index: -1 });
  const index = g.face.findIndex(c => c !== "wild"), color = g.face[index];
  a.send({ type: "action", action: { type: "draw_train", index } });
  assert.equal((await a.next("state", m => m.game.drawEvent?.id === 2)).game.drawEvent.color, color);
  assert.equal((await b.next("state", m => m.game.drawEvent?.id === 2)).game.drawEvent.color, color);
  a.close(); b.close();
});

test("WebSocket server expires a silent turn and reconnect does not extend its deadline", async () => {
  const { ownershipRoom } = require("./helpers/ownership-preview");
  const room = ownershipRoom("TIMED1");
  room.game.turnDeadline = Date.now() + 250;
  const deadline = room.game.turnDeadline, before = room.game.players[0].hand.length;
  rooms.set(room.code, room);
  const a = await client();
  a.send({ type: "join", code: room.code, token: "preview-human" });
  await a.next("lobby");
  assert.equal((await a.next("state")).game.turnDeadline, deadline);
  const b = await client();
  b.send({ type: "join", code: room.code, token: "preview-human" });
  await b.next("lobby");
  assert.equal((await b.next("state")).game.turnDeadline, deadline);
  const after = (await b.next("state", m => m.game.current === 1)).game;
  assert.equal(after.hand.length, before + 2);
  assert.equal(after.events.filter(e => e.type === "draw").length, 2);
  assert.ok(after.turnDeadline >= deadline + 60000);
  b.send({ type: "leave_test" }); await b.next("room_closed");
});

test("WebSocket offers are private, do not block the next seat, and timeout independently", async () => {
  const E = require("../engine");
  const a = await client(), b = await client();
  a.send({ type: "create", name: "A" });
  const lobby = await a.next("lobby");
  b.send({ type: "join", code: lobby.code, name: "B" }); await b.next("lobby");
  a.send({ type: "start" });
  const initial = (await a.next("state")).game;
  assert.ok(initial.turnDeadline - initial.serverNow > 59000);
  await b.next("state");
  const g = rooms.get(lobby.code).game;
  g.phase = "play"; g.current = 0; E.ensureTiming(g);
  a.send({ type: "action", action: { type: "draw_tickets" } });
  const own = (await a.next("state", m => !!m.game.ticketOffer)).game;
  const other = (await b.next("state", m => m.game.current === 1)).game;
  assert.equal(other.ticketOffer, null);
  assert.equal(other.pending, null);
  assert.ok(other.players.every(p => !("offer" in p)));
  assert.equal(own.ticketOffer.tickets.length, 3);
  assert.ok(own.ticketOffer.deadline - own.serverNow > 59000);
  // Shorten only this fixture's offer, keeping the real normal-turn deadline.
  g.players[0].offer.deadline = Date.now() + 100;
  b.send({ type: "action", action: { type: "draw_train", index: -1 } });
  const partial = (await b.next("state", m => m.game.drawCount === 1)).game;
  const after = (await a.next("state", m => m.game.tickets.length === 1 && !m.game.ticketOffer)).game;
  assert.equal(after.current, 1);
  assert.equal(after.turnDeadline, partial.turnDeadline);
  assert.equal(g.drawCount, 1);
  assert.ok(own.ticketOffer.tickets.some(t => t.id === after.tickets[0].id));
  a.close(); b.close();
});

test("WebSocket turn return waits for the private offer; confirmation and timeout each start a full minute", async () => {
  const E = require("../engine"), a = await client(), b = await client();
  a.send({ type: "create", name: "A" });
  const lobby = await a.next("lobby");
  b.send({ type: "join", code: lobby.code, name: "B" }); await b.next("lobby");
  a.send({ type: "start" }); await a.next("state"); await b.next("state");
  const g = rooms.get(lobby.code).game; g.phase = "play"; g.current = 0; E.ensureTiming(g);
  for (const automatic of [false, true]) {
    const offerId = (g.offerSerial || 0) + 1;
    a.send({ type: "action", action: { type: "draw_tickets" } });
    const offer = (await a.next("state", m => m.game.ticketOffer?.id === offerId)).game.ticketOffer;
    assert.ok(offer.deadline - Date.now() > 59000);
    if (automatic) g.players[0].offer.deadline = Date.now() + 200;
    b.send({ type: "action", action: { type: "draw_train", index: -1 } });
    await b.next("state", m => m.game.drawCount === 1);
    b.send({ type: "action", action: { type: "draw_train", index: -1 } });
    const waiting = (await a.next("state", m => m.game.turnWaiting && m.game.ticketOffer?.id === offerId)).game;
    assert.equal(waiting.current, 0); assert.equal(waiting.turnDeadline, null);
    const before = g.players[0].hand.length;
    if (!automatic) a.send({ type: "action", action: { type: "keep_tickets", offerId: offer.id, indexes: [0, 1] } });
    const ready = (await a.next("state", m => !m.game.ticketOffer && !m.game.turnWaiting && m.game.current === 0 && m.game.phase === "play")).game;
    assert.equal(ready.hand.length, before);
    assert.equal(ready.drawCount, 0);
    assert.ok(ready.turnDeadline - ready.serverNow >= 59900);
  }
  a.close(); b.close();
});

test("WebSocket tunnel payments accept color, mixed and wild options and preserve cards on decline", async () => {
  const { tunnelRoom } = require("./helpers/tunnel-preview");
  const UI = require("../game-ui");
  const cases = [
    { kind: "color", extraWild: 0, remaining: ["wild", "wild"], returned: 7 },
    { kind: "color", extraWild: 1, remaining: ["white", "wild"], returned: 7 },
    { kind: "wild", extraWild: 1, remaining: ["red"], returned: 6 },
    { kind: "decline", remaining: ["white", "white", "red"], returned: 3 },
  ];
  for (const [i, scenario] of cases.entries()) {
    const code = `TUNEL${i}`, room = tunnelRoom(code, scenario.kind);
    rooms.set(code, room);
    const peer = await client();
    peer.send({ type: "join", code, token: "preview-human" });
    await peer.next("lobby");
    const before = (await peer.next("state")).game;
    const routeId = before.tunnel.routeId;
    const options = UI.tunnelPayments(before.hand, before.tunnel);
    if (scenario.kind === "decline") assert.deepEqual(options, []);
    else assert.ok(options.some(option => option.wild === scenario.extraWild));
    peer.send({ type: "action", action: scenario.kind === "decline"
      ? { type: "decline_tunnel" } : { type: "pay_tunnel", extraWild: scenario.extraWild } });
    const after = (await peer.next("state", m => m.game.phase === "play")).game;
    assert.deepEqual(after.hand, scenario.remaining);
    assert.equal(after.routes[routeId].owner, scenario.kind === "decline" ? null : 0);
    assert.equal(after.deckCount, before.deckCount + scenario.returned);
    assert.equal(after.discardCount, 0);
    assert.equal(after.current, 1);
    assert.equal(room.game.deck.length + room.game.face.length + room.game.players.flatMap(p => p.hand).length, 110);
    peer.send({ type: "leave_test" });
    await peer.next("room_closed");
    assert.equal(rooms.has(code), false);
  }
});

test("authoritative ownership exposes stable player marks and preserves the free parallel track", async () => {
  const { ownershipRoom } = require("./helpers/ownership-preview");
  const UI = require("../game-ui");
  const room = ownershipRoom("MARKS1");
  rooms.set(room.code, room);
  const peer = await client();
  peer.send({ type: "join", code: room.code, token: "preview-human" });
  await peer.next("lobby");
  const before = (await peer.next("state")).game;
  assert.equal(before.players.length, 5);
  for (const [seat, id] of [7, 8, 12, 15, 18].entries()) {
    const owner = UI.routeOwner(before, before.routes[id], 0);
    assert.equal(owner.seat, seat);
    assert.equal(owner.mark, UI.playerMark(seat));
  }
  assert.equal(before.players[3].color, "#ddaf40");
  assert.equal(UI.routeOwner(before, before.routes[15], 0).color, UI.YELLOW);
  assert.equal(UI.routeOwner(before, before.routes[13], 0), null);
  assert.equal(UI.construction(before, 0, { routeId: 13 }).reason, null);
  peer.send({ type: "action", action: { type: "claim", routeId: 13, color: "orange", wildCount: 0 } });
  const after = (await peer.next("state", m => m.game.routes[13].owner === 0)).game;
  assert.equal(UI.routeOwner(after, after.routes[13], 0).label, "Esta ruta es tuya");
  assert.equal(after.routes[12].owner, 2);
  assert.equal(after.current, 1);
  assert.equal(room.game.deck.length + room.game.face.length + room.game.players.flatMap(p => p.hand).length, 110);
  peer.send({ type: "leave_test" });
  await peer.next("room_closed");
});

test("normal multiplayer still starts, persists and rejects practice commands", async () => {
  const host = await client();
  const guest = await client();
  host.send({ type: "create", name: "Anfitrión" });
  const lobby = await host.next("lobby");
  assert.equal(lobby.practice, false);
  guest.send({ type: "join", code: lobby.code, name: "Invitado" });
  await guest.next("lobby");
  await host.next("lobby", (message) => message.members.length === 2);
  host.send({ type: "finish_test" });
  assert.match((await host.next("error")).message, /solo está disponible/);
  host.send({ type: "start", firstSeat: 0 });
  assert.equal((await host.next("state")).game.phase, "initial");
  const stored = JSON.parse(fs.readFileSync(process.env.STATE_FILE, "utf8"));
  assert.ok(stored.some((room) => room.code === lobby.code));
  assert.ok(stored.every((room) => !room.practice));
  host.close();
  guest.close();
});

test("missing rooms return a recoverable code instead of leaving the client stuck", async () => {
  const peer = await client();
  peer.send({ type: "join", code: "GONE00", token: "expired" });
  assert.equal((await peer.next("error")).code, "ROOM_NOT_FOUND");
});

test("keepalive replies without game action", async () => {
  const peer = await client();
  peer.send({ type: "ping" });
  assert.equal((await peer.next("pong")).type, "pong");
});

test("multiplayer enforces turn order, private views, token reconnection and started-room admission", async () => {
  const host = await client();
  host.send({ type: "create", name: "Ana" });
  const lobby = await host.next("lobby");
  assert.match(lobby.code, /^[A-Z0-9]{6}$/);
  const guest = await client();
  guest.send({ type: "join", code: lobby.code, name: "Beto" });
  const joined = await guest.next("lobby");
  assert.equal(joined.seat, 1);
  assert.equal(joined.members.length, 2);
  await host.next("lobby", (message) => message.members.length === 2);
  host.send({ type: "start" });
  const own = (await host.next("state")).game;
  const other = (await guest.next("state")).game;
  const first = own.current, peers = [host, guest], views = [own, other];
  assert.equal(views[first].initial.length, 4);
  assert.equal(views[1 - first].initial.length, 4);
  assert.equal(new Set([...own.initial, ...other.initial].map(t => t.id)).size, 8);
  assert.equal(own.hand.length, 4);
  assert.equal(other.hand.length, 4);
  assert.ok(!JSON.stringify(own).includes("shortDeck"));
  assert.equal(own.players[1].hand, undefined);
  assert.equal(own.players[1].tickets, undefined);

  peers[1 - first].send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  const waiting = (await peers[first].next("state", m => m.game.initialReadyCount === 1)).game;
  assert.equal(waiting.current, first);
  assert.equal(waiting.initialDeadline, own.initialDeadline);
  assert.equal(waiting.phase, "initial");
  peers[1 - first].send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  assert.match((await peers[1 - first].next("error")).message, /Ya confirmaste/);
  peers[first].send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  await peers[1 - first].next("state", m => m.game.current === first && m.game.phase === "play");
  peers[1 - first].send({ type: "action", action: { type: "draw_train", index: -1 } });
  assert.match((await peers[1 - first].next("error")).message, /turno/);
  peers[first].send({ type: "action", action: { type: "draw_train", index: -1 } });
  await peers[first].next("state", m => m.game.phase === "play" && m.game.drawCount === 1);
  peers[first].send({ type: "action", action: { type: "draw_train", index: -1 } });
  await peers[first].next("state", m => m.game.phase === "play" && m.game.current === 1 - first);

  guest.close();
  const replacement = await client();
  replacement.send({ type: "join", code: lobby.code, token: joined.token });
  assert.equal((await replacement.next("lobby")).seat, 1);
  assert.equal((await replacement.next("state")).game.current, 1 - first);
  assert.equal(rooms.get(lobby.code).game.first, first);
  const outsider = await client();
  outsider.send({ type: "join", code: lobby.code, name: "Late" });
  assert.match((await outsider.next("error")).message, /ya comenzó/);
});

test("WebSocket shared initial deadline settles all pending players without client actions", async () => {
  const peers = [await client(), await client(), await client()];
  peers[0].send({type: "create", name: "A"});
  const lobby = await peers[0].next("lobby");
  for (let i = 1; i < peers.length; i++) {
    peers[i].send({type: "join", code: lobby.code, name: `P${i}`});
    await peers[i].next("lobby");
  }
  peers[0].send({type: "start"});
  const initial = await Promise.all(peers.map(async p => (await p.next("state")).game));
  assert.ok(initial.every(g => g.initial.length === 4 && g.initialDeadline === initial[0].initialDeadline));
  const room = rooms.get(lobby.code), first = room.game.first;
  // Only shorten this isolated test's absolute deadline. Confirmation broadcasts
  // reschedule the real server clock, then no client sends another action.
  room.game.initialDeadline = Date.now() + 150;
  peers[0].send({type: "action", action: {type: "choose_initial", indexes: [1,2,3]}});
  const waiting = (await peers[0].next("state", m => m.game.initialReadyCount === 1)).game;
  assert.equal(waiting.initial, null);
  const ended = await Promise.all(peers.map(async p => (await p.next("state", m => m.game.phase === "play")).game));
  assert.ok(ended.every(g => g.current === first && g.initialReadyCount === 3));
  assert.deepEqual(ended.map(g => g.tickets.length), [3,2,2]);
  assert.deepEqual(ended[0].tickets.map(t => t.id), initial[0].initial.slice(1).map(t => t.id));
  assert.ok(ended.every(g => g.turnDeadline - g.serverNow > 59000 && g.result === null));
  for (const g of ended) assert.ok(g.players.every(p => p.tickets === undefined));
  peers.forEach(p => p.close());
});

test("five-player room rejects a sixth player and ignores client starting-seat overrides", async () => {
  const host = await client();
  host.send({ type: "create", name: "1" });
  const lobby = await host.next("lobby");
  for (let i = 2; i <= 5; i++) {
    const guest = await client();
    guest.send({ type: "join", code: lobby.code, name: String(i) });
    assert.equal((await guest.next("lobby")).seat, i - 1);
  }
  const extra = await client();
  extra.send({ type: "join", code: lobby.code, name: "6" });
  assert.match((await extra.next("error")).message, /completa/);
  host.send({ type: "start", firstSeat: 999 });
  const state = (await host.next("state")).game;
  assert.ok(state.current >= 0 && state.current < 5);
  assert.equal(state.history.at(-1).seat, state.current);
  assert.match(state.history.at(-1).text, /sorteo/);
  assert.equal(state.phase, "initial");
  assert.equal(state.players.length, 5);
});

function probeWebSocket(origin, frame) {
  const net = require("node:net");
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let response = Buffer.alloc(0), sent = false;
    socket.setTimeout(2000, () => socket.destroy(new Error("WebSocket was not rejected")));
    socket.on("error", reject);
    socket.on("close", () => resolve(response));
    socket.on("connect", () => socket.write(
      `GET /socket HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
    ));
    socket.on("data", (chunk) => {
      response = Buffer.concat([response, chunk]);
      if (frame && !sent && response.includes("\r\n\r\n")) {
        sent = true;
        socket.write(frame);
      }
    });
  });
}

test("WebSocket rejects foreign or malformed origins", async () => {
  for (const origin of ["https://foreign.example", "invalid"]) {
    assert.equal((await probeWebSocket(origin)).length, 0);
  }
});

test("same-origin WebSocket rejects fragmented and reserved-bit frames", async () => {
  for (const firstByte of [0x01, 0xc1]) {
    const response = await probeWebSocket(`http://127.0.0.1:${port}`,
      Buffer.from([firstByte, 0x80, 0, 0, 0, 0]));
    assert.match(response.toString(), /^HTTP\/1\.1 101/);
    const end = response.indexOf("\r\n\r\n") + 4;
    assert.equal(response[end], 0x88);
  }
});
