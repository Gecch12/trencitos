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
      const kinds=new Set(batch.map(entry=>entry.kind)),kind=kinds.size===1?batch[0].kind:'mixed';
      const phase=(name,ms)=>{measure(name,ms);measure(`${kind}.${name}`,ms);};
      for(const entry of batch){const ms=started-entry.enqueued;measure('queue',ms);measure(`${entry.kind}.queue`,ms);}
      try{
        before=capture();captured=true;transaction=tx;mutating=true;
        for(const entry of batch)entry.job();
        mutating=false;phase('mutation',now()-started);
        const saving=now();if(tx.dirty)await commit();if(tx.dirty)phase('commit',now()-saving);transaction=null;
        const delivering=now();
        for(const deliver of tx.outbox)try{deliver();}catch{console.error('Client delivery failed after commit; reconnect to recover.');}
        phase('delivery',now()-delivering);
      }catch(error){
        mutating=false;transaction=null;
        try{if(captured)restore(before);onFailure(error);}catch{console.error('Durable queue recovery failed.');}
      }
      for(const entry of batch){const ms=now()-entry.enqueued;measure('total',ms);measure(`${entry.kind}.total`,ms);entry.resolve();}
    }
    running=false;for(const resolve of idleWaiters.splice(0))resolve();
  }
  return {
    run(job,kind='other'){if(!['draw','build','bot','other'].includes(kind))kind='other';return new Promise(resolve=>{jobs.push({job,kind,resolve,enqueued:now()});if(!running){running=true;queueMicrotask(drain);}});},
    dirty(){if(!mutating)throw Error('Durable writes require a serialized mutation.');transaction.dirty=true;},
    defer(deliver){if(mutating)transaction.outbox.push(deliver);else deliver();},
    get mutating(){return mutating;},
    idle(){return running?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();},
  };
}
module.exports={createDurableQueue};
