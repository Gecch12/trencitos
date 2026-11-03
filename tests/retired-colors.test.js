const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const E=require('../backend/engine'),Lobby=require('../shared/lobby-ui'),{saveRooms}=require('../backend/room-store');
test('restoring a white seat changes members and game players together without changing cards or ownership',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trencitos-retired-colors-')),file=path.join(dir,'state.json');
 const game=E.newGame(['Retired','Red'],0,Date.now());
 game.players[0].color='#ffffff';game.players[1].color='#d45748';game.routes[0].owner=0;
 const room={code:'92929292',updated:Date.now(),game,members:game.players.map((p,i)=>({name:p.name,color:p.color,token:String(i).repeat(48)}))};
 saveRooms(file,new Map([[room.code,room]]));
 Object.assign(process.env,{STATE_BACKEND:'file',STATE_FILE:file,AUTH_ENABLED:'false'});
 const app=require('../backend/server');
 try {
  await app.ready;const restored=app.rooms.get(room.code);
  const colors=restored.members.map(m=>m.color);
  assert.equal(new Set(colors).size,2);assert.ok(colors.every(Lobby.isColor));
  assert.equal(colors[1],'#d45748');assert.deepEqual(restored.game.players.map(p=>p.color),colors);
  assert.deepEqual(restored.game.players.map(p=>p.hand),game.players.map(p=>p.hand));
  assert.equal(restored.game.routes[0].owner,0);
 } finally {await app.shutdown();fs.rmSync(dir,{recursive:true,force:true});}
});
