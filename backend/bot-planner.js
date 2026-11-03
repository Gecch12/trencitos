"use strict";
const {Worker}=require('node:worker_threads');
// One worker protects the HTTP/WebSocket loop. Results are proposals only; the
// serialized application rechecks state/control and the engine validates them.
function createBotPlanner({measure=()=>{},timeout=15000}={}){
 let worker=null,serial=0,closed=false;const pending=new Map();
 function rejectAll(){for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(Error('Bot planner unavailable'));}pending.clear();}
 function start(){
  if(closed)throw Error('Bot planner closed');
  if(worker)return worker;
  const instance=new Worker(require.resolve('./bot-worker'));worker=instance;instance.unref();
  instance.on('message',message=>{const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);if(!pending.size)instance.unref();
   measure('botTotal',performance.now()-entry.started);if(message.error)entry.reject(Error('Bot plan failed'));else{measure('botCompute',message.milliseconds);entry.resolve(message.actions);}});
  instance.on('error',()=>{if(worker===instance){worker=null;rejectAll();}});
  instance.on('exit',()=>{if(worker===instance){worker=null;rejectAll();}});return instance;
 }
 function plan(game,seats,{replacement=false}={}){
  return new Promise((resolve,reject)=>{const instance=start(),id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('Bot plan timed out'));if(worker===instance){worker=null;instance.terminate();rejectAll();}},timeout);timer.unref?.();
   pending.set(id,{resolve,reject,timer,started:performance.now()});instance.ref();instance.postMessage({id,game,seats,replacement});});
 }
 async function close(){closed=true;rejectAll();const instance=worker;worker=null;if(instance)await instance.terminate();}
 return {plan,close};
}
module.exports={createBotPlanner};
