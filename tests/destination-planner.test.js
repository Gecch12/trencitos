const test = require('node:test'), assert = require('node:assert/strict');
const { plan } = require('../frontend/destination-planner');
const rules = { doubleRoutesMinPlayers: 4 };
const route = (id, a, b, n, owner = null) => ({ id, a, b, n, owner });
function game(routes, count = 4, placed = []) {
  return { routes, players: Array.from({ length: count }, (_, i) => ({ placed: i ? [] : placed })), ticketPaths: [], ticketProgress: [] };
}
const ticket = { id: 'target', a: 'A', b: 'D', p: 100 };
test('initial proposal minimizes wagons, independently of ticket points or geometric distance', () => {
  const g = game([route('direct', 'A', 'D', 6), route('one', 'A', 'B', 2), route('two', 'B', 'D', 3)]);
  assert.deepEqual(plan(g, 0, ticket, rules).routes, ['one', 'two']);
  assert.equal(plan(g, 0, ticket, rules).additional, 5);
});
test('new tickets prefer existing track; live occupation recalculates without mutating state', () => {
  const g = game([route('owned', 'A', 'B', 6, 0), route('finish', 'B', 'D', 2), route('direct', 'A', 'D', 3)]);
  const snapshot = structuredClone(g), before = plan(g, 0, ticket, rules);
  assert.equal(before.additional, 2); assert.deepEqual(g, snapshot);
  g.routes[1].owner = 1;
  const after = plan(g, 0, ticket, rules, before);
  assert.equal(after.additional, 3); assert.deepEqual(after.routes, ['direct']);
  g.routes[2].owner = 1;
  assert.equal(plan(g, 0, ticket, rules, after).reachable, false);
});
test('parallel lane rules distinguish small and large tables and never bypass an own lane', () => {
  const routes = [route(0, 'A', 'D', 2, 1), route(1, 'A', 'D', 2)];
  assert.equal(plan(game(routes, 3), 0, ticket, rules).reachable, false);
  assert.equal(plan(game(routes), 0, ticket, rules).additional, 2);
  routes[0].owner = 0;
  assert.equal(plan(game(routes), 0, ticket, rules).additional, 0);
});
test('a station borrows one incident route, never two; two placed stations may borrow two', () => {
  const routes = [route('left', 'A', 'B', 3, 1), route('right', 'B', 'D', 2, 2)];
  assert.equal(plan(game(routes, 4, ['B']), 0, ticket, rules).reachable, false);
  const result = plan(game(routes, 4, ['A', 'D']), 0, ticket, rules);
  assert.equal(result.additional, 0); assert.equal(result.stations.length, 2);
});
test('station suggestions retain loans already completing kept tickets', () => {
  const g = game([route('loan', 'A', 'B', 2, 1), route('other', 'B', 'D', 2, 1), route('own', 'A', 'D', 8, 0)], 4, ['B']);
  g.ticketPaths = [{ id: 'kept', routes: ['loan'], stationRoutes: ['loan'], stations: [{ city: 'B', routeId: 'loan', seat: 0 }] }];
  const result = plan(g, 0, { id: 'new', a: 'B', b: 'D' }, rules);
  assert.deepEqual(result.routes, ['loan', 'own']);
  assert.deepEqual(result.stationRoutes, ['loan']);
});
test('equal-cost live alternatives retain a still valid preview, with numeric or string IDs', () => {
  const g = game([route('first', 'A', 'D', 3, 1), route(99, 'A', 'D', 3)]);
  const previous = plan(g, 0, ticket, rules); assert.deepEqual(previous.routes, [99]);
  g.routes[0].owner = null;
  assert.deepEqual(plan(g, 0, ticket, rules, previous).routes, [99]);
});
test('completed tickets use the authoritative private path with zero new wagons', () => {
  const g = game([route('own', 'A', 'D', 6, 0)]);
  g.ticketProgress = [{ id: ticket.id, completed: true }];
  g.ticketPaths = [{ id: ticket.id, routes: ['own'], stationRoutes: [], stations: [] }];
  const result = plan(g, 0, ticket, rules);
  assert.equal(result.completed, true); assert.equal(result.additional, 0); assert.deepEqual(result.routes, ['own']);
});
