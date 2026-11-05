const test=require('node:test'),assert=require('node:assert/strict');
const {createAccountSeats}=require('../backend/account-seats');
const {serializableRoom,hashToken}=require('../backend/room-store');
function setup(){
  const r={code:'123456',members:[{name:'Angel',token:'a'.repeat(48)},{name:'Otro',tokenHash:hashToken('b'.repeat(48)),accountId:'other-account'}]};
  const rooms=new Map([[r.code,r]]);let saved;
  const api=createAccountSeats({rooms,dispatch:job=>job(),unavailable:()=>false,sendRoom:room=>{saved=serializableRoom(room);return true;}});
  return {api,r,saved:()=>saved};
}
test('only a proved seat can be bound; account association persists without tokens or rival data',async()=>{
  const f=setup();await assert.rejects(()=>f.api('link','me',{code:'123456',token:'f'.repeat(48)}),{status:403});
  await f.api('link','me',{code:'123456',token:'a'.repeat(48)});
  assert.equal(f.saved().members[0].accountId,'me');assert.equal(f.saved().members[0].token,undefined);
  assert.deepEqual(await f.api('rooms','me',{}),{rooms:[{code:'123456',started:false,nickname:'Angel'}]});
  assert.deepEqual(await f.api('rooms','stranger',{}),{rooms:[]});
  await assert.rejects(()=>f.api('link','me',{code:'123456',token:'b'.repeat(48)}),{status:403});
});
test('recovery requires the owning account, rotates private credential and replaces the previous peer',async()=>{
  const f=setup();await f.api('link','me',{code:'123456',token:'a'.repeat(48)});
  await assert.rejects(()=>f.api('recover','stranger',{code:'123456'}),{status:403});
  let closed=false,notice;f.r.members[0].ws={room:f.r,seat:0,send:m=>{notice=m;},close:()=>{closed=true;}};
  const result=await f.api('recover','me',{code:'123456'});
  assert.notEqual(result.token,'a'.repeat(48));assert.equal(f.saved().members[0].tokenHash,hashToken(result.token));
  assert.equal(closed,true);assert.equal(notice.type,'session_replaced');assert.equal(f.r.members[0].ws,null);
});
test('an account cannot acquire two seats; practice stays ephemeral',async()=>{
  const f=setup();await assert.rejects(()=>f.api('link','other-account',{code:'123456',token:'a'.repeat(48)}),{status:409});
  f.r.practice=true;await assert.rejects(()=>f.api('link','me',{code:'123456',token:'a'.repeat(48)}),{status:404});
});

test('automatic resume keeps a valid credential; stale credentials recover only for the owner',async()=>{
 const f=setup();await f.api('link','me',{code:f.r.code,token:'a'.repeat(48)});
 let closed=false;f.r.members[0].ws={send(){},close(){closed=true;}};
 const same=await f.api('recover','me',{code:f.r.code,token:'a'.repeat(48),resume:true});
 assert.equal(same.token,'a'.repeat(48));assert.equal(closed,false);
 await assert.rejects(()=>f.api('recover','stranger',{code:f.r.code,token:same.token,resume:true}),{status:403});
 const recovered=await f.api('recover','me',{code:f.r.code,token:'f'.repeat(48),resume:true});
 assert.notEqual(recovered.token,same.token);assert.equal(closed,true);
});

test('a definitive departure cannot be resumed or advertised as a recoverable room',async()=>{
 const f=setup();await f.api('link','me',{code:f.r.code,token:'a'.repeat(48)});
 f.r.members[0].participation={definitive:true,leftAt:1,penalizedAt:1};
 assert.deepEqual(await f.api('rooms','me',{}),{rooms:[]});
 await assert.rejects(()=>f.api('recover','me',{code:f.r.code,token:'a'.repeat(48),resume:true}),{status:409});
});
