"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");
const Lobby = require("../lobby-ui"), { PLAYER_COLORS } = require("../data");

test("new codes are numeric strings of six to ten digits, preserving leading zeroes", () => {
  for (const code of ["000000", "1234567", "00123456", "123456789", "0000000000"]) assert.equal(Lobby.isNewCode(code), true);
  for (const code of ["", "12345", "12345678901", "abc123", "123 456", "123456\n", "１２３４５６", 123456, null]) assert.equal(Lobby.isNewCode(code), false);
  let bound;
  assert.equal(Lobby.randomCode(max => { bound = max; return 12; }), "00000012");
  assert.equal(bound, 100000000);
  assert.equal(Lobby.randomCode(() => 99999999), "99999999");
});
test("legacy invitations and recovery codes remain accepted, but not for new rooms", () => {
  for (const code of ["ABC123", "abc123", "ZZZZZZ", "000001", "0000012345"]) assert.ok(Lobby.isJoinCode(code));
  for (const code of ["abc1234", "ABC1234567", "../123", "12345678901"]) assert.ok(!Lobby.isJoinCode(code));
});
test("color preferences never duplicate reservations and restoration preserves later members", () => {
  const [red, blue, green, yellow, purple] = PLAYER_COLORS;
  assert.equal(Lobby.freeColor([{ color: red }], red), blue);
  assert.equal(Lobby.freeColor([{ color: red }], purple), purple);
  assert.deepEqual(Lobby.restoreColors([{}, { color: red }, { color: purple }]), [blue, red, purple]);
  assert.deepEqual(Lobby.restoreColors([{ color: red }, { color: red }, {}]), [red, blue, green]);
  assert.deepEqual(Lobby.restoreColors([{}, {}, {}, {}], [yellow, purple, green, red].map(color => ({ color }))), [yellow, purple, green, red]);
});
test("home exposes room directory tabs, join dialog and a separate profile route", () => {
  const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
  assert.match(html, /<title>Trencitos<\/title>/);
  assert.doesNotMatch(html, /1901|Europa te espera|EL GRAN VIAJE|Proyecto personal no oficial|Sonido activado|EUROPA ·/);
  assert.match(html, /id="roomDirectory"[^>]*role="tabpanel"/);
  assert.match(html, /<dialog id="joinDialog"/);
  assert.match(html, /id="create"[^>]*form="homeCreate"/);
  assert.match(html, /href="\/profile"[^>]*data-page="profile"/);
  assert.match(html, /id="code"[^>]*maxlength="10"/);
  assert.ok(html.indexOf('src="lobby-ui.js"') < html.indexOf('src="app.js"'));
});
test("online status is hidden but offline errors remain visible", () => {
  const source = fs.readFileSync(require.resolve("../app.js"), "utf8");
  const node = { dataset: {}, classList: { toggle(_, hidden) { node.hidden = hidden; } } };
  const ctx = vm.createContext({ $: () => node, sock: { readyState: 1 }, WebSocket: { OPEN: 1 }, sessionReplaced: false, homeBusy: true, syncHomeAvailability() {} });
  vm.runInContext(source.slice(source.indexOf("function status("), source.indexOf("function send(")), ctx);
  ctx.status("● Conectado"); assert.equal(node.hidden, true);
  ctx.sock.readyState = 3; ctx.status("Desconectado");
  assert.equal(node.hidden, false); assert.equal(node.textContent, "Desconectado"); assert.equal(ctx.homeBusy, false);
});
