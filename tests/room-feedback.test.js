'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../frontend/app'),'utf8');
const context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function lobbyArrivalSounds('),source.indexOf('function finishGameStart(')),context);
const arrivals=(before,after)=>Array.from(context.lobbyArrivalSounds(before,after));
const human=(name,connected=true)=>({name,connected,bot:false});
const bot=name=>({name,connected:true,bot:true});
const lobby=(members,extra={})=>({code:'123456',seat:0,started:false,members,...extra});
test('only confirmed lobby additions and actual reconnections emit sounds, including duplicate names',()=>{
 const base=lobby([human('Me')]), joined=lobby([human('Me'),human('Alex')]);
 assert.deepEqual(arrivals(null,joined),[]);assert.deepEqual(arrivals(base,joined),['join']);
 assert.deepEqual(arrivals(joined,joined),[]);
 const two=lobby([human('Me'),human('Alex'),human('Alex')]);assert.deepEqual(arrivals(joined,two),['join']);
 const away=lobby([human('Me'),human('Alex',false)]);assert.deepEqual(arrivals(joined,away),[]);assert.deepEqual(arrivals(away,joined),['join']);
 const bots=lobby([...joined.members,bot('Bot 1'),bot('Bot 2')]);assert.deepEqual(arrivals(joined,bots),['bot-added']);
 assert.deepEqual(arrivals(bots,joined),[]);
});
test('settings, seat shifts, initial roster, started games and automatic practice bots stay silent',()=>{
 const before=lobby([human('Leaving'),human('Me'),human('Guest')],{seat:1});
 const after=lobby([human('Me'),human('Guest')]);assert.deepEqual(arrivals(before,after),[]);
 assert.deepEqual(arrivals(after,{...after,members:after.members.map(m=>({...m,color:'red',host:true}))}),[]);
 for(const extra of [{started:true},{spectator:true},{practice:true},{code:'654321'}])assert.deepEqual(arrivals(after,lobby([...after.members,bot('Bot 1')],extra)),[]);
});
