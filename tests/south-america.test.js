"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const E=require("../backend/engine"),Bots=require("../backend/bots"),{random}=require("./helpers/bot-match");
const source=require("../docs/references/south-america-v3.3-source.json");
const definition=require("../shared/maps/south-america-v3.3-beta");
const layout=require("../frontend/layouts/south-america-v3.3-beta");
const Map=require("../frontend/map-layout").createLayout(layout);
const ref={id:"south-america",version:"3.3-beta"};
const routes=definition.routes.map(r=>({...r,n:r.length})),network=Map.createNetwork(routes);

function corners(cell) {
  const a = cell.angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [
    cell.x + x * cell.width / 2 * cos - y * cell.height / 2 * sin,
    cell.y + x * cell.width / 2 * sin + y * cell.height / 2 * cos,
  ]);
}
function intersect(a, b) {
  const A = corners(a), B = corners(b);
  for (const polygon of [A, B]) for (let i = 0; i < 2; i++) {
    const p = polygon[i], q = polygon[i + 1], x = p[1] - q[1], y = q[0] - p[0];
    const aa = A.map(p => p[0] * x + p[1] * y), bb = B.map(p => p[0] * x + p[1] * y);
    if (Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb)) < 0.001) return false;
  }
  return true;
}



test("South America preserves every supplied identity, rule and ticket, with no Europe index bridge",()=>{
  assert.equal(definition.cities.length,46);assert.equal(definition.corridors.length,90);assert.equal(definition.routes.length,101);
  assert.deepEqual(definition.cities,Object.entries(source.cities).map(([id,row])=>({id,name:row[2]})));
  assert.deepEqual(definition.routes.map(({id,a,b,length,color,tunnel,ferry})=>({id,a,b,n:length,color,tunnel,ferry})),source.routes.map(({id,a,b,n,color,tunnel,ferry})=>({id,a,b,n,color,tunnel,ferry})));
  assert.deepEqual(definition.tickets,source.tickets.map(({id,a,b,p,long})=>({id,a,b,points:p,kind:long?"long":"short"})));
  assert.equal(routes.reduce((sum,r)=>sum+r.n,0),300);assert.equal(routes.filter(r=>r.tunnel).length,17);assert.equal(routes.filter(r=>r.ferry).length,5);
  const g=E.newGame(["A","B","C","D"],0,0,null,{mapRef:ref});
  assert.deepEqual(g.routes.map(r=>r.id),source.routes.map(r=>r.id));
  assert.deepEqual(E.restoreState(JSON.parse(JSON.stringify(g))),g);
});

test("South America slots do not overlap and avoid unrelated cities, including the southern ferries",()=>{
  const cells=network.flatMap(r=>r.cells.map(c=>({...c,routeId:r.id})));
  for(let i=0;i<cells.length;i++){
    const a=cells[i];assert.equal(a.width,22);assert.equal(a.height,8.5);
    for(const [x,y] of corners(a)){assert.ok(x>=Map.bounds.x&&x<=Map.bounds.x+Map.bounds.width);assert.ok(y>=Map.bounds.y&&y<=Map.bounds.y+Map.bounds.height);}
    for(const b of cells.slice(i+1))assert.equal(intersect(a,b),false,`${a.routeId}/${b.routeId}`);
  }
  for(const r of network){
    const rule=routes.find(q=>q.id===r.id);assert.equal(r.cells.length,rule.n);
    for(const [key,c] of Object.entries(Map.cities)){
      if([rule.a,rule.b].includes(key))continue;
      assert.ok(Math.min(...r.points.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1])))>=16,`${r.id}/${key}`);
    }
  }
  assert.deepEqual(Map.createNetwork([...routes].reverse()).sort((a,b)=>a.id.localeCompare(b.id)),[...network].sort((a,b)=>a.id.localeCompare(b.id)));
});

test("four South America bots finish naturally, preserving resources through restore and scoring",()=>{
  const rng=random(20261103),g0=E.newGame(["Cóndor","Jaguar","Llama","Capibara"],0,0,null,{mapRef:ref,random:rng});
  let g=g0,now=0,steps=0;const actions={};
  while(g.phase!=="finished"&&steps++<1500){
    if(E.tunnelBusy(g)){now=Math.max(now,g.pending.until);E.expire(g,now,rng);}
    else{
      const offered=g.phase==="tunnel"?-1:g.players.findIndex(p=>p.offer);
      const seat=g.phase==="initial"?g.players.findIndex(p=>p.pending.length):offered>=0?offered:g.current;
      const action=Bots.chooseBotAction(g,seat,rng);
      assert.ok(action,`bot stalled at ${steps} / ${g.phase}`);actions[action.type]=(actions[action.type]||0)+1;
      E.action(g,seat,action,{now:++now,random:rng});
    }
    assert.equal(g.deck.length+g.discard.length+g.face.length+g.players.reduce((sum,p)=>sum+p.hand.length,0)+(g.phase==="tunnel"&&g.pending.stage!=="result"?g.pending.revealed.length:0),110);
    for(const [seat,p] of g.players.entries()){
      assert.equal(p.trains+g.routes.filter(r=>r.owner===seat).reduce((sum,r)=>sum+r.n,0),45);
      assert.equal(p.stations+p.placed.length,3);assert.ok(p.trains>=0);
    }
    if(steps===50)g=E.restoreState(JSON.parse(JSON.stringify(g)));
  }
  assert.equal(g.phase,"finished");assert.equal(g.finalRemaining,0);assert.ok(g.players.some(p=>p.trains<=2));
  assert.equal(g.result.length,4);assert.ok(g.result.some(r=>r.winner));assert.ok(actions.claim>15);
  assert.deepEqual(E.restoreState(g),g);
  console.log("South America four bots:",JSON.stringify({steps,actions,turns:g.turnSerial,scores:g.result.map(({name,score,longest,winner})=>({name,score,longest,winner}))}));
});
