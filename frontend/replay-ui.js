"use strict";
if (location.pathname === '/replay') document.documentElement.classList.add('replay-loading-mode');
const ReplayUI = (() => {
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function open({id,load,show}) {
    const t=I18n.t,controls=$('replayControls');
    let loader=$('replayLoading');
    if(!loader){loader=document.createElement('dialog');loader.id='replayLoading';loader.className='replay-loading';document.body.append(loader);}
    loader.innerHTML=`<div class="loading-train" aria-hidden="true"><span>▰</span><span>▰</span><span>▰</span></div><p role="status">${t('Preparando repetición…')}</p>`;
    loader.oncancel=e=>e.preventDefault();if(!loader.open)loader.showModal();
    try {
      const data=await load(id);if(!data.frames?.length)throw Error(t('Esta repetición no está disponible.'));
      let step=0,viewer=data.full?0:-1,timer=null,speed=1;
      const labels=data.frames.map((f,i)=>f.events?.map(e=>e.message?I18n.format(e.message):t(e.text)).join(' · ')||t(i?'Actualización de la partida':'Inicio de la grabación'));
      const milestones=data.analysis?.flatMap((a,i)=>(a.milestones||[]).map(m=>({...m,step:i})))||[];
      const milestoneNames={construction:'Ruta construida',station:'Estación construida',ticket_completed:'Destino completado',longest_leader:'Nuevo camino más largo',longest_tie:'Empate en camino más largo',tunnel_abandoned:'Túnel abandonado',last_round:'Última ronda',finish:'Partida terminada'};
      controls.hidden=false;$('gameSidebar').prepend(controls);
      controls.innerHTML=`<details id="replayDock" open><summary><strong>${t('Repetición')}</strong><output id="replayPosition"></output></summary><div class="replay-body">
        <div class="replay-top"><a href="/profile?tab=history">← ${t('Historial')}</a><span>${t(data.full?'Participante':'Público')}</span></div>
        <div id="replayAvatars" class="replay-avatars"><button data-viewer="-1" title="${t('Pública · sin secretos')}" aria-label="${t('Pública · sin secretos')}">◎</button>${data.full?data.match.players.map((p,i)=>`<button data-viewer="${i}" title="${escape(p.name)}" aria-label="${escape(p.name)}">${escape(p.name.slice(0,2).toUpperCase())}</button>`).join(''):''}</div>
        <label class="replay-perspective">${t('Perspectiva')}<select id="replayViewer"><option value="-1">${t('Pública · sin secretos')}</option>${data.full?data.match.players.map((p,i)=>`<option value="${i}">${escape(p.name)}</option>`).join(''):''}</select></label>
        <div class="replay-transport"><button id="replayFirst" aria-label="${t('Ir al inicio')}">⏮</button><button id="replayPrevious" aria-label="${t('Paso anterior')}">◀</button><button id="replayPlay" aria-label="${t('Reproducir')}">▶</button><button id="replayNext" aria-label="${t('Paso siguiente')}">▶|</button><button id="replayLast" aria-label="${t('Ir al final')}">⏭</button><select id="replaySpeed" aria-label="${t('Velocidad')}">${[.5,1,2,4,8].map(n=>`<option ${n===1?'selected':''} value="${n}">${n}×</option>`).join('')}</select></div>
        <input id="replaySeek" type="range" min="0" max="${data.frames.length-1}" value="0" aria-label="${t('Paso de la repetición')}">
        <div class="replay-jumps"><button id="replayNextBuild">${t('Siguiente construcción')}</button><button id="replayNextMilestone">${t('Siguiente hito')}</button></div>
        <select id="replayEvent" aria-label="${t('Acción')}">${labels.map((label,i)=>`<option value="${i}">${i+1}. ${escape(label)}</option>`).join('')}</select>
        <div id="replayMilestones" class="replay-milestones" aria-label="${t('Hitos de la partida')}">${milestones.map(m=>`<button data-step="${m.step}" title="${escape(t(milestoneNames[m.type]||m.type))}">${m.step+1} · ${escape(t(milestoneNames[m.type]||m.type))}</button>`).join('')}</div>
        <details class="replay-market"><summary>${t('Cartas disponibles')}</summary><div id="replayMarket"></div></details>
        <details class="replay-analysis"><summary>${t('Estadísticas de este paso')}</summary><div id="replayStats"></div></details>
        ${data.full?`<div class="replay-private"><button id="replaySecretsOpen">${t('Ver cartas y destinos')}</button><a href="/api/history/${encodeURIComponent(id)}/audit">${t('Descargar auditoría')}</a></div>`:`<p>${t('Repetición pública sin secretos')}</p>`}
        ${!data.match.complete?`<small>${t('Registro parcial: la grabación comenzó con la partida ya iniciada.')}</small>`:''}
      </div></details>`;
      const compact=matchMedia('(max-width:767px)');
      const place=()=>{if(compact.matches){document.body.append(controls);$('replayDock').open=false;}else{$('gameSidebar').prepend(controls);$('replayDock').open=true;}};
      place();compact.addEventListener('change',place);
      for(const button of controls.querySelectorAll('[data-viewer]')){
        const p=data.match.players[Number(button.dataset.viewer)];if(p)button.style.setProperty('--replay-player',p.color);
        button.onclick=()=>{viewer=Number(button.dataset.viewer);paint(false);};
      }
      const history=$('historyEntries');history.replaceChildren();$('history').setAttribute('aria-label',t('Historial completo de la repetición'));
      const historyRows=data.frames.flatMap((frame,i)=>{
        const entries=frame.events?.length?frame.events:[{text:labels[i]}];
        return entries.map(entry=>{const button=document.createElement('button');button.type='button';button.className='replay-history-row';button.dataset.step=i;
          button.textContent=entry.message?I18n.format(entry.message):t(entry.text);button.onclick=()=>seek(i);history.append(button);return button;});
      });
      function stop(){clearTimeout(timer);timer=null;$('replayPlay').textContent='▶';$('replayPlay').setAttribute('aria-label',t('Reproducir'));}
      function paint(animate=false){
        const state=ReplayState.at(data.frames,step),view=structuredClone(state.views[data.full?viewer+1:0]);
        if(data.match.status==='abandoned'&&(step===data.frames.length-1||view.phase==='finished')){view.phase='abandoned';view.result=null;}
        const names=new Map((state.definition?.map.cities||[]).map(c=>[c.id,c.name])),city=id=>names.get(id)||(!view.definitionVersion?CITIES[id]?.[2]:null)||id;
        if(data.full){
          const colors={red:'Rojo',blue:'Azul',green:'Verde',yellow:'Amarillo',black:'Negro',white:'Blanco',orange:'Naranja',purple:'Morado',wild:'Locomotora'};
          const cards=items=>(items||[]).map(c=>escape(t(colors[c]||c))).join(', ')||'—';
          const tickets=items=>(items||[]).map(ticket=>`${escape(city(ticket.a))} — ${escape(city(ticket.b))} (${ticket.p})`).join('<br>')||'—';
          $('replaySecretsContent').innerHTML=state.views.slice(1).map((v,i)=>`<section><h3>${escape(data.match.players[i].name)}</h3><p><b>${t('Mano')}:</b> ${cards(v.hand)}</p><p><b>${t('Billetes conservados')}:</b><br>${tickets(v.tickets)}</p><p><b>${t('Billetes pendientes')}:</b><br>${tickets(v.initial||v.ticketOffer?.tickets)}</p>${v.tunnel?`<p>${t('Cartas del túnel')}: ${cards(v.tunnel.revealed)} · ${t('Suplemento')}: ${v.tunnel.surcharge}</p>`:''}</section>`).join('');
        }
        $('replayMarket').innerHTML=(view.face||[]).map(color=>`<img src="/assets/cards/${escape(color)}.svg" alt="${escape(t(color))}" />`).join('');
        const analysis=data.analysis?.[step];
        $('replayStats').innerHTML=analysis?.available?analysis.players.map(p=>`<section class="replay-stat-player"><strong>${escape(data.match.players[p.seat].name)}${p.leader?' ★':''}</strong><dl><dt>${t('Puntos de construcción')}</dt><dd>${p.routePoints}</dd><dt>${t('Rutas construidas')}</dt><dd>${p.routes}</dd><dt>${t('Camino más largo')}</dt><dd>${p.longest}</dd><dt>${t('Vagones restantes')}</dt><dd>${p.trains}</dd><dt>${t('Cartas')} / ${t('Estaciones')}</dt><dd>${p.cards} / ${p.stations}</dd>${data.full&&viewer>=0?`<dt>${t('Destinos completados')}</dt><dd>${p.completed??'—'} / ${p.tickets}</dd><dt>${t('Puntos completados / pendientes')}</dt><dd>+${p.completedPoints??'—'} / −${p.pendingPoints??'—'}</dd><dt>${t('Bonificación provisional')}</dt><dd>${p.provisionalBonus??'—'}</dd><dt>${t('Puntuación si terminara ahora')}</dt><dd>${p.projectedScore??'—'}</dd>`:''}</dl></section>`).join(''):`<p>${t('Datos no disponibles en esta grabación.')}</p>`;
        const frame=data.frames[step],actor=frame.action?.seat??frame.events?.find(e=>Number.isInteger(e.seat))?.seat;
        show(view,state.members,{at:frame.at,seat:viewer,full:data.full,match:data.match,definition:state.definition,animate,speed,step,
          builds:(analysis?.milestones||[]).filter(m=>m.type==='construction'||m.type==='station')});
        $('replayViewer').value=viewer;$('replaySeek').value=step;$('replayEvent').value=step;$('replayPosition').textContent=`${step+1}/${data.frames.length}`;
        for(const button of controls.querySelectorAll('[data-viewer]')){const seat=Number(button.dataset.viewer);button.setAttribute('aria-pressed',String(seat===viewer));button.classList.toggle('is-actor',seat===actor);if(seat>=0)button.title=data.match.players[seat].name+(seat===actor?' · '+t('Acción de este paso'):'');}
        $('replayFirst').disabled=$('replayPrevious').disabled=step===0;$('replayLast').disabled=$('replayNext').disabled=step===data.frames.length-1;
        $('replayNextBuild').disabled=!milestones.some(m=>m.step>step&&['construction','station'].includes(m.type));$('replayNextMilestone').disabled=!milestones.some(m=>m.step>step);
        for(const row of historyRows){const i=Number(row.dataset.step);row.classList.toggle('is-future',i>step);row.classList.toggle('is-current',i===step);row.setAttribute('aria-current',i===step?'step':'false');}
        historyRows.find(r=>Number(r.dataset.step)===step)?.scrollIntoView({block:'nearest'});
        for(const button of $('replayMilestones').children)button.classList.toggle('is-current',Number(button.dataset.step)===step);
      }
      function seek(n){stop();step=Math.max(0,Math.min(data.frames.length-1,Number(n)));paint(false);}
      function play(){ $('replayPlay').textContent='Ⅱ';$('replayPlay').setAttribute('aria-label',t('Pausar'));timer=setTimeout(()=>{if(step<data.frames.length-1){step++;paint(true);play();}else stop();},1200/speed); }
      $('replayFirst').onclick=()=>seek(0);$('replayPrevious').onclick=()=>seek(step-1);$('replayNext').onclick=()=>seek(step+1);$('replayLast').onclick=()=>seek(data.frames.length-1);
      $('replaySeek').oninput=e=>seek(e.target.value);$('replayEvent').onchange=e=>seek(e.target.value);
      $('replayPlay').onclick=()=>{if(timer)stop();else{if(step===data.frames.length-1){step=0;paint(false);}play();}};
      $('replaySpeed').onchange=e=>{const running=!!timer;stop();speed=Number(e.target.value);if(running)play();};
      $('replayViewer').onchange=e=>{viewer=Number(e.target.value);paint(false);};
      $('replayNextBuild').onclick=()=>{const next=milestones.find(m=>m.step>step&&['construction','station'].includes(m.type));if(next)seek(next.step);};
      $('replayNextMilestone').onclick=()=>{const next=milestones.find(m=>m.step>step);if(next)seek(next.step);};
      $('replayMilestones').onclick=e=>{const button=e.target.closest('[data-step]');if(button)seek(button.dataset.step);};
      if(data.full)$('replaySecretsOpen').onclick=()=>{stop();$('replaySecrets').showModal();};
      document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
      paint(false);loader.close();document.documentElement.classList.remove('replay-loading-mode');
    }catch(error){loader.innerHTML=`<p role="alert">${escape(error.message)}</p><button id="retryReplay">${t('Reintentar')}</button><a href="/profile?tab=history">${t('Volver al historial')}</a>`;$('retryReplay').onclick=()=>open({id,load,show});}
  }
  return {open};
})();
