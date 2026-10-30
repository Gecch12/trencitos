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
  assert.ok(initial.initial);
  assert.equal(initial.players[1].hand, undefined);
  assert.equal(fs.existsSync(process.env.STATE_FILE), false);

  const outsider = await client();
  outsider.send({ type: "join", code: lobby.code, name: "Invitado" });
  assert.match((await outsider.next("error")).message, /solo para su creador/);

  peer.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  const playing = (await peer.next("state", (message) => message.game.phase === "play")).game;
  assert.equal(playing.current, 0);
  assert.ok(playing.players.every((player) => player.ticketsCount === 2));

  // A destination choice must leave the selection phase before bots resume.
  peer.send({ type: "action", action: { type: "draw_tickets" } });
  const offer = (await peer.next("state", (message) => message.game.phase === "tickets")).game.pending;
  assert.equal(offer.length, 3);
  peer.send({ type: "action", action: { type: "keep_tickets", indexes: [1] } });
  const resumed = (await peer.next("state", (message) => message.game.phase === "play" && message.game.current === 0)).game;
  assert.equal(resumed.tickets.at(-1).id, offer[1].id);
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
  assert.equal(own.initial.length, 4);
  assert.equal(other.initial, null);
  assert.equal(own.hand.length, 4);
  assert.equal(other.hand.length, 4);
  assert.ok(!JSON.stringify(own).includes("shortDeck"));
  assert.equal(own.players[1].hand, undefined);
  assert.equal(own.players[1].tickets, undefined);

  guest.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  assert.match((await guest.next("error")).message, /turno/);
  host.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  await guest.next("state", (message) => message.game.current === 1);
  guest.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  await host.next("state", (message) => message.game.phase === "play");
  guest.send({ type: "action", action: { type: "draw_train", index: -1 } });
  assert.match((await guest.next("error")).message, /turno/);
  host.send({ type: "action", action: { type: "draw_train", index: -1 } });
  await host.next("state", (message) => message.game.drawCount === 1);
  host.send({ type: "action", action: { type: "draw_train", index: -1 } });
  await host.next("state", (message) => message.game.current === 1);

  guest.close();
  const replacement = await client();
  replacement.send({ type: "join", code: lobby.code, token: joined.token });
  assert.equal((await replacement.next("lobby")).seat, 1);
  assert.equal((await replacement.next("state")).game.current, 1);
  const outsider = await client();
  outsider.send({ type: "join", code: lobby.code, name: "Late" });
  assert.match((await outsider.next("error")).message, /ya comenzó/);
});

test("five-player room rejects a sixth player and respects the selected starting seat", async () => {
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
  host.send({ type: "start", firstSeat: 4 });
  const state = (await host.next("state")).game;
  assert.equal(state.current, 4);
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
