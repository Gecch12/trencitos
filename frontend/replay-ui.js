"use strict";
if (location.pathname === '/replay') document.documentElement.classList.add('replay-loading-mode');
const ReplayUI = (() => {
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let dispose=null,selectViewer=()=>{};
  async function open({id,load,show,decorateRow=()=>{},cancelEffects=()=>{}}) {
    dispose?.();
    const t=I18n.t,controls=$('replayControls'),controller=new AbortController();
    const compact=matchMedia('(max-width: 699px), (max-width: 1100px) and (max-height: 600px)');
    let data,step=0,viewer=0,timer=null,playing=false,speed=1,indexed=0,playCursor,indexCursor,ready=false,failed=false;
    let lastView=null,lastCity=null,historyDirty=true,lastHistoryStep=-1;
    const rows=new Map(),nodes=new Map(),eventSteps=new Map(),fallbackRows=[];
    const history=$('historyEntries');
    let loader=$('replayLoading');
    if(!loader){loader=document.createElement('dialog');loader.id='replayLoading';loader.className='replay-loading';document.body.append(loader);}
    loader.innerHTML=`<div class="loading-train" aria-hidden="true"><span>▰</span><span>▰</span><span>▰</span></div><p role="status">${t('Preparando repetición…')}</p>`;
    loader.oncancel=e=>e.preventDefault();if(!loader.open)loader.showModal();
    function stop(){playing=false;clearTimeout(timer);timer=null;cancelEffects();if($('replayPlay')){$('replayPlay').textContent='▶';$('replayPlay').setAttribute('aria-label',t('Reproducir'));}}
    const visibility=()=>{if(document.hidden)stop();};
    const place=()=>{if(!ready)return;if(compact.matches)document.body.append(controls);else $('gameSidebar').prepend(controls);$('replayDock').open=!compact.matches;};
    dispose=()=>{stop();controller.abort();compact.removeEventListener('change',place);document.removeEventListener('visibilitychange',visibility);};
    function updateControls(){
      $('replaySeek').max=data.frames.length-1;$('replaySeek').value=step;
      $('replayPosition').textContent=`${step+1}/${data.match.steps||data.frames.length}`;
      $('replayFirst').disabled=$('replayPrevious').disabled=step===0;
      $('replayLast').disabled=!data.complete||step===data.frames.length-1;
      $('replayNext').disabled=step===data.frames.length-1;
      $('replayGeneral').setAttribute('aria-pressed',String(viewer===-1));
      $('replayProgress').hidden=data.complete;
      $('replayProgress').textContent=data.complete?'':`${t('Cargando…')} ${Math.floor(100*data.frames.length/data.match.steps)}%`;
    }
    function journalHistory(view,city){
      const current=new Map(TurnHistory.displayRows(view.turnHistory||[]).map(row=>[row.id,row]));
      const all=rows.size?TurnHistory.displayRows([...rows.values()].map(value=>value.row)):fallbackRows;
      const children=all.map(finalRow=>{
        const row=current.get(finalRow.id)||finalRow,signature=JSON.stringify(row);
        let node=nodes.get(row.id);
        if(!node||node._signature!==signature){
          node=TurnHistory.render(row,{players:view.players,city,revealAll:data.full},{button:true});
          decorateRow(node,row);node.classList.add('replay-history-row');node._signature=signature;nodes.set(row.id,node);
        }
        const steps=finalRow.events.map(e=>eventSteps.get(e.id)??0),first=Math.min(...steps),last=Math.max(...steps);
        node.dataset.step=last;node.classList.toggle('is-future',first>step);node.classList.toggle('is-current',steps.includes(step));
        node.setAttribute('aria-current',steps.includes(step)?'step':'false');return node;
      });
      // Reuse unchanged DOM rows, including their images, focus and scroll position.
      let prior=null;
      for(const node of children){const next=prior?prior.nextSibling:history.firstChild;if(next!==node)history.insertBefore(node,next);prior=node;}
      const keep=new Set(children);for(const node of [...history.children])if(!keep.has(node))node.remove();
      if(step!==lastHistoryStep)children.find(node=>node.classList.contains('is-current'))?.scrollIntoView({block:'nearest'});
      lastHistoryStep=step;historyDirty=false;
    }
    function paint(animate=false){
      const state=playCursor.at(step),view=structuredClone(ReplayState.view(state,data.full?viewer+1:0));
      if(data.match.status==='abandoned'&&(data.complete&&step===data.frames.length-1||view.phase==='finished')){view.phase='abandoned';view.result=null;}
      const names=new Map((state.definition?.map.cities||[]).map(c=>[c.id,c.name])),city=id=>names.get(id)||(!view.definitionVersion?CITIES[id]?.[2]:null)||id;
      const frame=data.frames[step];
      show(view,state.members,{at:frame.at,seat:viewer,full:data.full,match:data.match,definition:state.definition,animate,speed,step});
      lastView=view;lastCity=city;journalHistory(view,city);updateControls();
    }
    function seek(n){
      if(failed)return;
      const next=Math.max(0,Math.min(data.frames.length-1,Number(n))),animate=next===step+1;
      stop();step=next;paint(animate);
    }
    function schedule(){
      if(!playing)return;
      timer=setTimeout(()=>{
        if(!playing||failed)return;
        if(step<data.frames.length-1){step++;paint(true);schedule();}
        else if(data.complete)stop();else schedule();
      },1200/speed);
    }
    function start(){playing=true;$('replayPlay').textContent='Ⅱ';$('replayPlay').setAttribute('aria-label',t('Pausar'));schedule();}
    function setup(){
      viewer=data.full?0:-1;playCursor=ReplayState.cursor(data.frames);indexCursor=ReplayState.cursor();
      controls.hidden=false;history.replaceChildren();$('history').setAttribute('aria-label',t('Historial completo de la repetición'));
      controls.innerHTML=`<details id="replayDock" open><summary><strong>${t('Repetición')}</strong><output id="replayPosition"></output></summary><div class="replay-body">
        <div class="replay-top"><a href="/profile?tab=history">← ${t('Historial')}</a><button id="replayGeneral" title="${t('Vista general')}" aria-label="${t('Vista general')}" aria-pressed="false">◎</button></div>
        <div class="replay-transport"><button id="replayFirst" aria-label="${t('Ir al inicio')}">⏮</button><button id="replayPrevious" aria-label="${t('Paso anterior')}">◀</button><button id="replayPlay" aria-label="${t('Reproducir')}">▶</button><button id="replayNext" aria-label="${t('Paso siguiente')}">▶|</button><button id="replayLast" aria-label="${t('Ir al final')}">⏭</button><select id="replaySpeed" aria-label="${t('Velocidad')}">${[.5,1,2,4,8].map(n=>`<option ${n===1?'selected':''} value="${n}">${n}×</option>`).join('')}</select></div>
        <input id="replaySeek" type="range" min="0" value="0" aria-label="${t('Paso de la repetición')}">
        <small id="replayProgress" role="status"></small>
        ${!data.match.complete?`<small>${t('Registro parcial: la grabación comenzó con la partida ya iniciada.')}</small>`:''}
      </div></details>`;
      selectViewer=i=>{if(!data.full||i< -1||i>=data.match.players.length||failed)return;stop();viewer=i;paint(false);};
      $('replayGeneral').onclick=()=>selectViewer(-1);
      $('replayFirst').onclick=()=>seek(0);$('replayPrevious').onclick=()=>seek(step-1);$('replayNext').onclick=()=>seek(step+1);$('replayLast').onclick=()=>seek(data.frames.length-1);
      $('replaySeek').oninput=e=>seek(e.target.value);
      $('replayPlay').onclick=()=>{if(playing)stop();else{if(data.complete&&step===data.frames.length-1){step=0;paint(false);}start();}};
      $('replaySpeed').onchange=e=>{const resume=playing;stop();speed=Number(e.target.value);if(resume)start();};
      history.onclick=e=>{const row=e.target.closest('[data-step]');if(row)seek(row.dataset.step);};
      ready=true;place();compact.addEventListener('change',place);document.addEventListener('visibilitychange',visibility);
    }
    function indexFrames(){
      for(;indexed<data.frames.length;indexed++){
        const frame=data.frames[indexed],state=indexCursor.push(frame),view=ReplayState.view(state,0);
        const journal=view.turnHistory||[];
        // Only inspect changed rows. A checkpoint needs a full scan, a normal
        // frame usually adds one event to one row of the shared journal.
        let changed=null;
        if(!frame.snapshot&&state.shared?.turnHistory){
          changed=new Set();for(const change of frame.changes){const path=change.path;if(path[0]==='shared'&&path[1]==='turnHistory'){if(path.length<3){changed=null;break;}changed.add(Number(path[2]));}}
        }
        for(const row of changed?[...changed].map(i=>journal[i]).filter(Boolean):journal){
          const signature=JSON.stringify(row);if(rows.get(row.id)?.signature===signature)continue;
          rows.set(row.id,{row:structuredClone(row),signature});historyDirty=true;
          for(const e of row.events)if(!eventSteps.has(e.id))eventSteps.set(e.id,indexed);
        }
        if(!journal.length){
          const entries=frame.events?.length?frame.events:[{text:indexed?t('Actualización de la partida'):t('Inicio de la grabación')}];
          for(const [i,entry]of entries.entries()){
            const id=`legacy:${indexed}:${i}`;fallbackRows.push({id,seat:entry.seat??null,turn:null,at:frame.at,events:[{id,type:'legacy',data:entry}]});eventSteps.set(id,indexed);historyDirty=true;
          }
        }
      }
    }
    try{
      await load(id,next=>{
        if(controller.signal.aborted)return;
        data=next;if(!data.frames.length)return;
        const first=!ready;if(first)setup();indexFrames();
        if(first){paint(false);loader.close();document.documentElement.classList.remove('replay-loading-mode');}
        else{updateControls();if(historyDirty&&lastView)journalHistory(lastView,lastCity);}
      },controller.signal);
      if(!ready)throw Error(t('Esta repetición no está disponible.'));
    }catch(error){
      if(controller.signal.aborted)return;
      failed=true;stop();
      loader.innerHTML=`<p role="alert">${escape(error.message)}</p><button id="retryReplay">${t('Reintentar')}</button><a href="/profile?tab=history">${t('Volver al historial')}</a>`;
      if(!loader.open)loader.showModal();$('retryReplay').onclick=()=>open({id,load,show,decorateRow,cancelEffects});
    }
  }
  return {open,selectViewer:i=>selectViewer(i)};
})();
