"use strict";

// Mutations stay serialized. When several jobs wait behind an in-flight save,
// a bounded batch commits their rooms/history atomically with one round trip.
// Every state/ack remains withheld until that commit succeeds.
function createDurableQueue({capture,restore,commit,onFailure,measure=()=>{},now=()=>performance.now(),batchSize=1,
  scope=work=>work(),spans=()=>({})}) {
  if(!Number.isSafeInteger(batchSize)||batchSize<1)throw Error('Invalid durable batch size');
  const jobs=[],idleWaiters=[];let running=false,transaction=null,mutating=false;
  async function drain(){
    while(jobs.length){
      const batch=jobs.splice(0,batchSize),started=now(),tx={dirty:false,outbox:[]};let before,captured=false;
      await scope(async () => {
      const costs={captureMs:0,mutationMs:0,commitMs:0,deliveryMs:0};let outcome='committed';
      const kinds=new Set(batch.map(entry=>entry.kind)),kind=kinds.size===1?batch[0].kind:'mixed';
      const phase=(name,ms)=>{measure(name,ms);measure(`${kind}.${name}`,ms);};
      for(const entry of batch){const ms=started-entry.enqueued;measure('queue',ms);measure(`${entry.kind}.queue`,ms);}
      try{
        before=capture();captured=true;costs.captureMs=now()-started;phase('capture',costs.captureMs);transaction=tx;mutating=true;
        for(const entry of batch){const executing=now();try{entry.job();}finally{entry.executionMs=now()-executing;}}
        mutating=false;costs.mutationMs=now()-started;phase('mutation',costs.mutationMs);
        const saving=now();if(tx.dirty)await commit();costs.commitMs=now()-saving;if(tx.dirty)phase('commit',costs.commitMs);transaction=null;
        const delivering=now();
        for(const deliver of tx.outbox)try{deliver();}catch{console.error('Client delivery failed after commit; reconnect to recover.');}
        costs.deliveryMs=now()-delivering;phase('delivery',costs.deliveryMs);
      }catch(error){
        outcome='failed';
        mutating=false;transaction=null;
        try{if(captured)restore(before);onFailure(error);}catch{console.error('Durable queue recovery failed.');}
      }
      const details=spans();
      for(const entry of batch){const ms=now()-entry.enqueued;measure('total',ms);measure(`${entry.kind}.total`,ms);
        try{entry.observe?.({version:1,kind:entry.kind,outcome,batchSize:batch.length,queueMs:started-entry.enqueued,
          executionMs:entry.executionMs||0,totalMs:ms,batch:{...costs,spans:{...details}}});}catch{ /* Diagnostic delivery cannot roll back a command. */ }
        entry.resolve();}
      });
    }
    running=false;for(const resolve of idleWaiters.splice(0))resolve();
  }
  return {
    run(job,kind='other',observe){if(!['draw','build','bot','other'].includes(kind))kind='other';return new Promise(resolve=>{jobs.push({job,kind,observe,resolve,enqueued:now()});if(!running){running=true;queueMicrotask(drain);}});},
    dirty(){if(!mutating)throw Error('Durable writes require a serialized mutation.');transaction.dirty=true;},
    defer(deliver){if(mutating)transaction.outbox.push(deliver);else deliver();},
    get mutating(){return mutating;},
    idle(){return running?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();},
  };
}
module.exports={createDurableQueue};
