"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { once } = require("node:events");
const { connect } = require("./helpers/ws-client");
const { PLAYER_COLORS: colors } = require("../data");
const { loadRooms } = require("../room-store");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trencitos-lobby-"));
process.env.STATE_FILE = path.join(dir, "rooms.json");
let app, port;
const clients = [];
async function boot() { delete require.cache[require.resolve("../server")]; app = require("../server"); app.server.listen(0, "127.0.0.1"); await once(app.server, "listening"); port = app.server.address().port; }
async function stop() { clients.splice(0).forEach(c => c.close()); await app.shutdown(); }
async function client() { const c = await connect(port); clients.push(c); return c; }
async function create(code, color = colors[0]) { const c = await client(); c.send({ type: "create", name: "Anfitrión", code, color }); return { c, lobby: await c.next("lobby") }; }
test.before(boot);
test.after(async () => { await stop(); fs.rmSync(dir, { recursive: true, force: true }); });

test("custom codes keep leading zeros and lengths; invalid input does not create rooms", async () => {
  for (const code of ["001234", "00123456", "0012345678"]) assert.equal((await create(code)).lobby.code, code);
  const c = await client(), size = app.rooms.size;
  for (const code of ["", "12345", "12345678901", "ABC123", "123 456", 123456, null]) {
    c.send({ type: "create", name: "A", code }); assert.equal((await c.next("error")).code, "INVALID_CODE");
    assert.equal(app.rooms.size, size);
  }
  const generated = await create(undefined); assert.match(generated.lobby.code, /^\d{8}$/);
});
test("duplicate codes reject rather than changing or joining a room, even for concurrent creates", async () => {
  const a = await client(), b = await client();
  a.send({ type: "create", code: "44556677", name: "A" }); b.send({ type: "create", code: "44556677", name: "B" });
  const outcome = c => Promise.race([c.next("lobby").then(x => ({ type: "lobby", data: x })), c.next("error").then(x => ({ type: "error", data: x }))]);
  const results = await Promise.all([outcome(a), outcome(b)]);
  assert.equal(results.filter(x => x.type === "lobby").length, 1);
  assert.equal(results.find(x => x.type === "error").data.code, "CODE_TAKEN");
  assert.equal(app.rooms.get("44556677").members.length, 1);
});
test("color selection is private to a seat, unique, synchronized and locked after start", async () => {
  const { c: a, lobby } = await create("55667788", colors[4]);
  const b = await client(); b.send({ type: "join", code: lobby.code, name: "Invitado", color: colors[4] });
  const joined = await b.next("lobby"); assert.equal(joined.members[0].color, colors[4]); assert.equal(joined.members[1].color, colors[0]);
  a.send({ type: "select_color", color: colors[2], seat: 1 });
  const selected = await b.next("lobby", m => m.members[0].color === colors[2]);
  assert.equal(selected.members[1].color, colors[0]);
  b.send({ type: "select_color", color: colors[2] }); assert.equal((await b.next("error")).code, "COLOR_TAKEN");
  b.send({ type: "select_color", color: "#000000" }); assert.equal((await b.next("error")).code, "INVALID_COLOR");
  b.send({ type: "select_color", color: colors[3] }); await a.next("lobby", m => m.members[1].color === colors[3]);
  a.send({ type: "start" });
  const state = (await a.next("state")).game;
  assert.deepEqual(state.players.map(p => p.color), [colors[2], colors[3]]);
  b.send({ type: "select_color", color: colors[1] }); assert.equal((await b.next("error")).code, "COLOR_LOCKED");
  assert.deepEqual(app.rooms.get(lobby.code).game.players.map(p => p.color), [colors[2], colors[3]]);
});
test("two simultaneous requests for the same free color produce exactly one owner", async () => {
  const { c: a, lobby } = await create("66778899");
  const b = await client(); b.send({ type: "join", code: lobby.code, name: "B" }); await b.next("lobby");
  a.send({ type: "select_color", color: colors[4] }); b.send({ type: "select_color", color: colors[4] });
  await a.next("lobby", m => m.members.some(p => p.color === colors[4]));
  const r = app.rooms.get(lobby.code), loser = r.members[0].color === colors[4] ? b : a;
  assert.equal((await loser.next("error")).code, "COLOR_TAKEN");
  assert.equal(r.members.filter(m => m.color === colors[4]).length, 1);
  assert.equal(new Set(r.members.map(m => m.color)).size, 2);
});
test("leaving releases a color without changing the remaining player's color when seats shift", async () => {
  const { c: a, lobby } = await create("77889900", colors[4]);
  const b = await client(); b.send({ type: "join", code: lobby.code, name: "B", color: colors[2] }); await b.next("lobby");
  a.send({ type: "leave" }); await a.next("room_closed");
  const shifted = await b.next("lobby", m => m.members.length === 1);
  assert.equal(shifted.seat, 0); assert.equal(shifted.members[0].color, colors[2]);
  b.send({ type: "select_color", color: colors[4] }); await b.next("lobby", m => m.members[0].color === colors[4]);
});
test("practice assigns the chosen color to the human and distinct colors to all bots", async () => {
  const c = await client(); c.send({ type: "create_test", name: "Práctica", color: colors[4] });
  const lobby = await c.next("lobby"), state = (await c.next("state")).game;
  assert.equal(state.players[0].color, colors[4]); assert.equal(new Set(state.players.map(p => p.color)).size, 4);
  assert.deepEqual(lobby.members.map(m => m.color), state.players.map(p => p.color));
  c.send({ type: "leave_test" }); await c.next("room_closed");
});
test("saved colors survive a restart and legacy alphanumeric recovery links still work", async () => {
  const { c, lobby } = await create("88990011", colors[3]);
  c.send({ type: "select_color", color: colors[4] }); await c.next("lobby", m => m.members[0].color === colors[4]);
  const legacy = await create("99001122", colors[2]);
  const r = app.rooms.get(legacy.lobby.code); app.rooms.delete(r.code); r.code = "OLD123"; app.rooms.set(r.code, r);
  legacy.c.send({ type: "select_color", color: colors[2] }); await legacy.c.next("lobby", m => m.code === "OLD123");
  assert.equal(loadRooms(process.env.STATE_FILE).find(r => r.code === lobby.code).members[0].color, colors[4]);
  await stop(); await boot();
  const rejoined = await client(); rejoined.send({ type: "join", code: lobby.code, token: lobby.token, color: colors[0] });
  assert.equal((await rejoined.next("lobby")).members[0].color, colors[4]);
  const old = await client(); old.send({ type: "join", code: "old123", token: legacy.lobby.token });
  assert.equal((await old.next("lobby")).members[0].color, colors[2]);
});
test("a failed local save rolls back a color change", async () => {
  const { c, lobby } = await create("11002233", colors[0]);
  const temp = process.env.STATE_FILE + ".tmp"; fs.mkdirSync(temp);
  try {
    c.send({ type: "select_color", color: colors[4] });
    assert.equal((await c.next("error")).code, "STORAGE_FAILED");
    assert.equal(app.rooms.get(lobby.code).members[0].color, colors[0]);
  } finally { fs.rmdirSync(temp); }
  c.send({ type: "retry_save" }); await c.next("storage", m => !m.paused);
});
