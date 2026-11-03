"use strict";

// Mutations stay serialized. When several jobs wait behind an in-flight save,
// a bounded batch commits their rooms/history atomically with one round trip.
// Every state/ack remains withheld until that commit succeeds.
function createDurableQueue({capture,restore,commit,onFailure,measure=()=>{},now=()=>performance.now(),batchSize=1}) {
  if(!Number.isSafeInteger(batchSize)||batchSize<1)throw Error('Invalid durable batch size');
  const jobs=[],idleWaiters=[];let running=false,transaction=null,mutating=false;
  async function drain(){
    while(jobs.length){
      const batch=jobs.splice(0,batchSize),started=now(),tx={dirty:false,outbox:[]};let before,captured=false;
      for(const entry of batch)measure('queue',started-entry.enqueued);
      try{
        before=capture();captured=true;transaction=tx;mutating=true;
        for(const entry of batch)entry.job();
        mutating=false;measure('mutation',now()-started);
        const saving=now();if(tx.dirty)await commit();if(tx.dirty)measure('commit',now()-saving);transaction=null;
        const delivering=now();
        for(const deliver of tx.outbox)try{deliver();}catch{console.error('Client delivery failed after commit; reconnect to recover.');}
        measure('delivery',now()-delivering);
      }catch(error){
        mutating=false;transaction=null;
        try{if(captured)restore(before);onFailure(error);}catch{console.error('Durable queue recovery failed.');}
      }
      for(const entry of batch){measure('total',now()-entry.enqueued);entry.resolve();}
    }
    running=false;for(const resolve of idleWaiters.splice(0))resolve();
  }
  return {
    run(job){return new Promise(resolve=>{jobs.push({job,resolve,enqueued:now()});if(!running){running=true;queueMicrotask(drain);}});},
    dirty(){if(!mutating)throw Error('Durable writes require a serialized mutation.');transaction.dirty=true;},
    defer(deliver){if(mutating)transaction.outbox.push(deliver);else deliver();},
    get mutating(){return mutating;},
    idle(){return running?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();},
  };
}
module.exports={createDurableQueue};
