"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { once } = require("node:events");
const { connect } = require("./helpers/ws-client");
const E = require("../backend/engine");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rail-multi-"));
process.env.STATE_FILE = path.join(dir, "rooms.json");
const { server, rooms } = require("../backend/server");
let port; const clients = [];
test.before(async () => { server.listen(0, "127.0.0.1"); await once(server, "listening"); port = server.address().port; });
test.after(async () => { clients.forEach(c => c.close()); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
async function client() { const c = await connect(port); clients.push(c); return c; }
async function lobby() {
  const a = await client(), b = await client(); a.send({ type: "create", name: "A" });
  const la = await a.next("lobby"); b.send({ type: "join", code: la.code, name: "B" });
  const lb = await b.next("lobby"); await a.next("lobby", m => m.members.length === 2);
  return { a, b, la, lb, r: rooms.get(la.code) };
}
async function playing() {
  const f = await lobby(); f.a.send({ type: "start" });
  await f.a.next("state"); await f.b.next("state");
  f.a.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  await f.a.next("state", m => !m.game.initial);
  f.b.send({ type: "action", action: { type: "choose_initial", indexes: [0, 1] } });
  await f.a.next("state", m => m.game.phase === "play"); await f.b.next("state", m => m.game.phase === "play");
  return f;
}
test("explicit lobby exit frees a seat and transfers starting authority", async () => {
  const f = await lobby(); f.a.send({ type: "leave" }); await f.a.next("room_closed");
  const left = await f.b.next("lobby", m => m.members.length === 1);
  assert.equal(left.host, true); assert.equal(left.seat, 0);
  const c = await client(); c.send({ type: "join", code: left.code, name: "C" }); await c.next("lobby");
  await f.b.next("lobby", m => m.members.length === 2);
  f.b.send({ type: "start" }); assert.equal((await f.b.next("state")).game.phase, "initial");
});
test("opening cue reserves 700 ms before the full shared selection clock and reconnect preserves it", async () => {
  const f=await lobby();f.a.send({type:'start'});
  const a=(await f.a.next('state')).game,b=(await f.b.next('state')).game;
  assert.ok(a.initialRevealAt>a.serverNow);
  assert.ok(a.initialRevealAt-a.serverNow<=700);
  assert.equal(a.initialDeadline-a.initialRevealAt,60000);
  assert.equal(a.turnDeadline,a.initialDeadline);assert.equal(b.initialRevealAt,a.initialRevealAt);
  const saved=require('../backend/room-store').loadRooms(process.env.STATE_FILE).find(r=>r.code===f.la.code);
  assert.equal(saved.game.initialRevealAt,a.initialRevealAt);
  const c=await client();c.send({type:'join',code:f.la.code,token:f.la.token});
  const restored=(await c.next('state')).game;
  assert.equal(restored.initialDeadline,a.initialDeadline);assert.equal(restored.initialRevealAt,a.initialRevealAt);
});
test("leaving a completed game preserves its result without abandonment or replacement bots", async () => {
  for (const type of ['leave', 'abandon']) {
    const f=await playing();E.finish(f.r.game);
    const result=JSON.stringify(f.r.game.result),participation=JSON.stringify(f.r.members.map(m=>m.participation));
    f.a.send({type});const closed=await f.a.next('room_closed');
    assert.equal(closed.message,'');assert.equal(closed.preserveIdentity,true);
    assert.equal(!!f.r.members[0].autopilot,false);
    assert.equal(JSON.stringify(f.r.game.result),result);
    assert.equal(JSON.stringify(f.r.members.map(m=>m.participation)),participation);
  }
});
test("a completed solo game closes without the abandoned-game notice", async () => {
  const a=await client();a.send({type:'create',name:'A'});const lobby=await a.next('lobby');
  a.send({type:'add_bot'});await a.next('lobby',m=>m.members.length===2);
  a.send({type:'start'});await a.next('state');
  const room=rooms.get(lobby.code);E.finish(room.game);const result=JSON.stringify(room.game.result);
  a.send({type:'leave'});const closed=await a.next('room_closed');
  assert.equal(closed.message,'');assert.equal(rooms.has(lobby.code),false);assert.equal(JSON.stringify(room.game.result),result);
});
test("host removal works only in lobby and invalidates the removed identity", async () => {
  const f = await lobby(); f.b.send({ type: "kick", seat: 0 }); await f.b.next("error");
  f.a.send({ type: "kick", seat: 1 }); await f.b.next("room_closed");
  f.b.send({ type: "join", code: f.la.code, token: f.lb.token });
  assert.equal((await f.b.next("error")).code, "INVALID_TOKEN");
});
test("same-token handoff explicitly stops the old session; stored recovery secrets are hashed", async () => {
  const f = await playing(), c = await client();
  c.send({ type: "join", code: f.la.code, token: f.la.token });
  await f.a.next("session_replaced"); const restored = await c.next("lobby");
  assert.equal(restored.seat, 0); assert.equal(restored.token, f.la.token);
  const raw = fs.readFileSync(process.env.STATE_FILE, "utf8");
  assert.ok(!raw.includes(f.la.token)); assert.ok(!raw.includes(f.lb.token));
  c.send({ type: "rotate_token" }); const rotated = await c.next("lobby", m => m.token !== f.la.token);
  const old = await client(); old.send({ type: "join", code: f.la.code, token: f.la.token });
  assert.equal((await old.next("error")).code, "INVALID_TOKEN");
  const fresh = await client(); fresh.send({ type: "join", code: f.la.code, token: rotated.token });
  assert.equal((await fresh.next("lobby")).seat, 0);
});
test("duplicate action retries cannot draw a second card and stale revisions reject safely", async () => {
  const f = await playing(), seat = f.r.game.current, c = [f.a, f.b][seat];
  const before = f.r.game.players[seat].hand.length;
  const action = { type: "action", id: "unique-draw-001", revision: f.r.revision, action: { type: "draw_train", index: -1 } };
  c.send(action); await c.next("ack", m => m.id === action.id);
  c.send(action); await c.next("ack", m => m.id === action.id);
  assert.equal(f.r.game.players[seat].hand.length, before + 1);
  c.send({ ...action, id: "unique-draw-002" });
  assert.equal((await c.next("error")).code, "STALE_ACTION");
  assert.equal(f.r.game.players[seat].hand.length, before + 1);
});
test("simultaneous private selections do not conflict on a shared stale revision", async () => {
  const f = await lobby(); f.a.send({ type: "start" });
  await f.a.next("state"); await f.b.next("state");
  for (const [i, c] of [f.a, f.b].entries()) c.send({ type: "action", id: `initial-same-rev-${i}`, revision: 0,
    action: { type: "choose_initial", indexes: [0, 1] } });
  await f.a.next("ack", m => m.id === "initial-same-rev-0"); await f.b.next("ack", m => m.id === "initial-same-rev-1");
  assert.equal(f.r.game.phase, "play"); assert.ok(f.r.game.players.every(p => p.tickets.length === 2));
});
test("voluntary exit installs a bot without deleting pieces; private link reclaims the fixed seat", async () => {
  const f = await playing(); f.r.game.routes[0].owner = 0;
  f.a.send({ type: "leave" }); const left = await f.a.next("room_closed"); assert.equal(left.preserveIdentity, true);
  assert.equal(f.r.members[0].autopilot, true); assert.equal(f.r.members.length, 2);
  assert.equal(f.r.game.routes[0].owner, 0);
  const c = await client(); c.send({ type: "join", code: f.la.code, token: f.la.token });
  const restored = await c.next("lobby"); assert.equal(restored.seat, 0);
  assert.ok(restored.members[0].reclaim || !restored.members[0].autopilot);
});
test("expired all-offline room cannot be revived by racing its cleanup timer", async () => {
  const f = await playing();
  for (const m of f.r.members) { m.ws.room = null; m.ws = null; m.disconnectedAt = Date.now() - 120001; }
  f.r.emptySince = Date.now() - 120001;
  const c = await client(); c.send({ type: "join", code: f.la.code, token: f.la.token });
  assert.equal((await c.next("error")).code, "ROOM_NOT_FOUND"); assert.equal(rooms.has(f.la.code), false);
});
test("rematch opt-in creates one new lobby and preserves previous results", async () => {
  const f = await playing(); E.finish(f.r.game, true); const result = JSON.stringify(f.r.game.result);
  f.a.send({ type: "rematch" }); await f.a.next("room_closed");
  const nextA = await f.a.next("lobby", m => m.code !== f.la.code);
  f.b.send({ type: "rematch" }); await f.b.next("room_closed");
  const nextB = await f.b.next("lobby", m => m.code === nextA.code);
  assert.equal(nextB.members.length, 2); assert.equal(nextB.started, false);
  assert.equal(JSON.stringify(f.r.game.result), result); assert.equal(f.r.game.phase, "finished");
});
test("failed save rolls back accepted game changes, pauses, then resumes after explicit retry", async () => {
  const f = await playing(), seat = f.r.game.current, c = [f.a, f.b][seat];
  const before = f.r.game.players[seat].hand.length, rev = f.r.revision;
  const temp = process.env.STATE_FILE + ".tmp"; fs.mkdirSync(temp);
  try {
    c.send({ type: "action", id: "failed-draw-001", revision: rev, action: { type: "draw_train", index: -1 } });
    assert.equal((await c.next("error")).code, "STORAGE_FAILED");
    assert.equal(f.r.game.players[seat].hand.length, before); assert.equal(f.r.revision, rev);
    await c.next("storage", m => m.paused);
    const health = await fetch(`http://127.0.0.1:${port}/healthz`); assert.equal(health.status, 503);
  } finally { fs.rmdirSync(temp); }
  c.send({ type: "retry_save" }); await c.next("storage", m => !m.paused);
  c.send({ type: "action", id: "failed-draw-001", revision: rev, action: { type: "draw_train", index: -1 } });
  await c.next("ack", m => m.id === "failed-draw-001");
  assert.equal(f.r.game.players[seat].hand.length, before + 1);
});
