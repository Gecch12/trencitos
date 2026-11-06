// Manual browser probe for a connected, owned private QA room in production.
// Install before creating the room. Reload to remove it; never export raw game state.
// Five-second health sampling is read-only. No gameplay is automated by this file.
(() => {
 const a=window.__latencyAudit={startedAt:new Date().toISOString(),samples:[],errors:[],click:0};
 const observer=typeof StateStream==='undefined'?null:StateStream.reader();
 document.addEventListener('click',e=>{if(e.target.closest?.('[data-market-index],#drawblind,[data-add-bot]'))a.click=performance.now();},true);
 const nativeSend=sock.send.bind(sock);
 sock.send=data=>{try{const m=JSON.parse(data);if(m.type==='add_bot'||(m.type==='action'&&m.action?.type==='draw_train')){
  const s={traceId:'qa-'+crypto.randomUUID(),type:m.type==='add_bot'?'add_bot':'draw_train',id:m.id,index:m.action?.index,sent:performance.now(),click:a.click};
  a.samples.push(s);m.traceId=s.traceId;data=JSON.stringify(m);
 }}catch{}return nativeSend(data);};
 const handler=sock.onmessage;
 sock.onmessage=e=>{try{const root=JSON.parse(e.data),messages=root.type==='batch'?root.messages:[root],now=performance.now();
  for(const wire of messages){ const m=observer?observer.read(wire):wire;
   if(m.type==='timing'){const s=a.samples.find(s=>s.traceId===m.id);if(s)s.server=m.timing;}
   if(m.type==='error')a.errors.push(m.code||'error');
   for(const s of a.samples){
    if(s.type==='add_bot'&&m.type==='lobby'&&!s.received){s.received=now;requestAnimationFrame(()=>s.visible=performance.now());}
    if(s.type==='draw_train'&&m.type==='state'&&m.drawReceipts?.some(r=>r.id===s.id)&&!s.received){s.received=now;s.wireType=wire.type;requestAnimationFrame(()=>{s.stateFrame=performance.now();if(s.index>=0){const el=document.querySelector('[data-market-index="'+s.index+'"]');if(el&&!el.classList.contains('draw-reserved'))s.visible=performance.now();}});}
    if((m.type==='ack'||m.type==='action_ack')&&m.id===s.id)s.ack=now;
   }
  }
 }catch{}handler(e);};
 function frame(){const now=performance.now();for(const s of a.samples){if(s.type!=='draw_train'||!s.id)continue;
  const f=document.querySelector('.draw-flight[data-draw-id="'+s.id+'"]');if(f&&!s.feedback)s.feedback=now;
  if(s.index<0&&s.received&&!s.visible&&f?.dataset.revealedColor){const front=f.querySelector('.draw-flight-front'),face=f.querySelector('.draw-flight-face');const image=front||f.querySelector('img');if(image?.complete&&image.naturalWidth>0&&(!front||!face||new DOMMatrix(getComputedStyle(face).transform).m11<-.9))s.visible=now;}
 }requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
(()=>{const a=window.__latencyAudit,prior=sock.onmessage;a.processSamples=[];sock.onmessage=e=>{const start=performance.now();prior(e);for(const s of a.samples)if(s.received>=start){s.handlerMs=performance.now()-start;s.messageCharacters=e.data.length;}};const sample=async()=>{try{const h=await fetch('/healthz?timings=1').then(r=>r.json());if(h.runtime)a.processSamples.push({at:h.runtime.sampledAt,cpu:h.runtime.cpuPercent,rss:h.runtime.memoryBytes?.rss,heapUsed:h.runtime.memoryBytes?.heapUsed,loopUtilization:h.runtime.eventLoopUtilization,loopP95:h.runtime.eventLoopDelayMs?.p95,pausedRooms:h.pausedRooms,mode:h.persistenceMode});}catch{}};sample();a.sampler=setInterval(sample,5000);})();
