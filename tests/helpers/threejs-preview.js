"use strict";
// Local-only fixtures. Never served by server.js or imported by the browser.
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
process.env.STATE_BACKEND = 'file';
fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
process.env.STATE_FILE = path.join(root, '.qa', `rooms-${process.pid}.json`);
const E = require('../../engine');
const { ownershipRoom } = require('./ownership-preview');
const { tunnelRoom } = require('./tunnel-preview');
const { server, rooms, ready } = require('../../server');
const token = 'a'.repeat(48);
async function start(port = 3119) {
  await ready;
  function add(r) {
    r.members[0].token = token;
    E.ensureTiming(r.game); r.game.turnDeadline = Date.now() + 3600000;
    rooms.set(r.code, r);
  }
  const base = ownershipRoom('830101');
  base.game.players[0].tickets = [E.TICKETS[2], E.TICKETS[8]];
  for (const code of ['830101', '830102', '830103']) add({ ...structuredClone(base), code });
  const dense = structuredClone(base); dense.code = '830104';
  dense.game.routes.forEach(r => { r.owner = null; });
  const left = [45, 45, 45, 45, 45];
  for (const r of dense.game.routes) {
    const owner = left.findIndex(n => n >= r.n);
    if (owner >= 0) { r.owner = owner; left[owner] -= r.n; }
  }
  const cities = Object.keys(E.CITIES);
  dense.game.players.forEach((p, i) => { p.placed = cities.slice(i * 3, i * 3 + 3); p.stations = 0; p.trains = left[i]; });
  add(dense);
  add(tunnelRoom('830105', 'zero', true));
  // Regressions: Frankfurt roof against the free Essen route; London–Berlin
  // completed directly or by borrowing an opponent's route through a station.
  for (const [code, borrowed] of [['830106',false],['830107',true]]) {
    const r = structuredClone(base); r.code = code;
    r.game.routes.forEach(route => { route.owner = null; });
    r.game.players[0].color = '#b88929';
    r.game.players[0].placed = ['FRA']; r.game.players[0].stations = 2;
    r.game.players[0].tickets = [E.TICKETS.find(t=>t.a==='LON' && t.b==='BER')];
    for (const [a,b] of [['LON','AMS'],['AMS','FRA'],['FRA','BER']]) {
      const route = r.game.routes.find(route=>route.a===a && route.b===b || route.a===b && route.b===a);
      route.owner = borrowed && a === 'AMS' ? 1 : 0;
    }
    add(r);
  }
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { server, rooms, token, port: server.address().port };
}
if (require.main === module) start(Number(process.env.PORT || 3119)).then(({port}) => console.log(`Three.js QA: http://127.0.0.1:${port}/?room=830104&board=3d#recover=${token}`));
module.exports = { start };
