"use strict";
const HistoryUI = (() => {
  const $=id=>document.getElementById(id),t=I18n.t;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Intl.DateTimeFormat(I18n.language,{dateStyle:'medium',timeStyle:'short'}).format(value);
  const status={active:'En curso',completed:'Completada',abandoned:'Abandonada'};
  async function api(id='') {
    const response=await fetch('/api/history'+(id?'/'+encodeURIComponent(id):''),{credentials:'same-origin',cache:'no-store'}),data=await response.json();
    if(!response.ok)throw Error(t(data.message));return data;
  }
  let profileRequest=0;
  async function profile(tab) {
    const request=++profileRequest;
    const root=$('historyPanel');root.hidden=!['history','overview'].includes(tab);if(root.hidden)return;
    root.innerHTML=`<p role="status">${t('Cargando…')}</p>`;
    try {
      const {matches}=await api();if(request!==profileRequest)return;
      if(tab==='overview') {
        const completed=matches.filter(m=>m.status==='completed');
        root.innerHTML=t`<div class="history-summary"><strong>${completed.length}</strong><span>Partidas completadas</span><strong>${matches.filter(m=>m.status==='abandoned').length}</strong><span>Partidas abandonadas</span><strong>${matches.filter(m=>m.status==='active').length}</strong><span>Partidas en curso</span></div><p class="shell-muted">Las partidas abandonadas no cuentan como resultados completados.</p>`;
        return;
      }
      root.innerHTML=t`<p class="shell-muted">Tu historial se guarda en el servidor. Vincula Google para acceder desde otros dispositivos; sin vincular, borrar los datos del navegador puede hacerte perder el acceso.</p><label>Filtrar partidas<select id="historyFilter"><option value="all">Todas</option><option value="active">En curso</option><option value="completed">Completadas</option><option value="abandoned">Abandonadas</option></select></label><div id="matchList"></div>`;
      const draw=()=>{
        const rows=matches.filter(m=>$('historyFilter').value==='all'||m.status===$('historyFilter').value);
        $('matchList').innerHTML=rows.length?rows.map(m=>t`<article class="history-card"><header><strong>${escape(t(m.map))} · ${escape(t(m.mode))}</strong><span class="match-status ${m.status}">${t(status[m.status])}</span></header><p>${escape(date(m.startedAt))} · ${escape(m.players.map(p=>p.name).join(' · '))}</p>${!m.complete?`<p class="shell-muted">${t('Registro parcial: la grabación comenzó con la partida ya iniciada.')}</p>`:''}<details><summary>${t(m.status==='completed'?'Desglose de puntos':'Progreso registrado')}</summary><div class="history-score-table"><table><thead><tr><th>${t('Jugador')}</th><th>${t('Rutas')}</th><th>${t('Destinos')}</th><th>${t('Estaciones')}</th><th>${t('Camino más largo')}</th><th>${t('Total')}</th></tr></thead><tbody>${m.scores.map(s=>`<tr><th>${escape(m.players[s.seat]?.name)}${s.winner?' 🏆':''}</th><td>${s.route}</td><td>${s.partial?'—':s.destination}</td><td>${s.partial?'—':s.stations}</td><td>${s.partial?'—':s.express}</td><td>${s.score}${s.partial?'*':''}</td></tr>`).join('')}</tbody></table></div>${m.status!=='completed'?`<p>${t('Puntos parciales de rutas. Los destinos y las bonificaciones no se liquidan hasta completar la partida.')}</p>`:''}</details><footer>${m.status==='active'?`<span>${t('La repetición estará disponible cuando la partida se cierre.')}</span>`:`<a class="shell-primary" href="/replay?id=${m.id}">${t('Ver repetición')}</a>`}</footer></article>`).join(''):`<p>${t('Todavía no hay partidas en este historial.')}</p>`;
      };
      $('historyFilter').onchange=draw;draw();
    } catch(error){if(request!==profileRequest)return;root.innerHTML=`<p role="alert">${escape(error.message)}</p><button id="retryHistory">${t('Reintentar')}</button>`;$('retryHistory').onclick=()=>profile(tab);}
  }
  async function replay(id,show) {
    const controls=$('replayControls');controls.hidden=false;
    controls.innerHTML=`<p role="status">${t('Cargando repetición…')}</p>`;
    try {
      const data=await api(id);if(!data.frames.length)throw Error(t('Esta repetición no está disponible.'));
      let step=0,viewer=data.full?0:-1,timer=null,speed=1;
      const labels=data.frames.map((frame,index)=>{
        const events=frame.events?.map(e=>e.message?I18n.format(e.message):t(e.text)).join(' · ');
        if(events)return events;
        const action=frame.action?.action,name=data.match.players[frame.action?.seat]?.name||t('Jugador');
        if(action?.type==='choose_initial')return t`${name} eligió sus destinos iniciales.`;
        if(action?.type==='claim')return t`${name} intentó construir una ruta.`;
        return t(index===0?'Inicio de la grabación':frame.action?.actor==='timer'?'Tiempo agotado':frame.action?.actor==='bot'?'Acción del bot':'Actualización de la partida');
      });
      controls.innerHTML=t`<div class="replay-top"><a href="/profile?tab=history">← Historial</a><strong>${t('Repetición')} · ${t(status[data.match.status])}</strong><label>Perspectiva<select id="replayViewer"><option value="-1">Pública · sin secretos</option>${data.full?data.match.players.map((p,i)=>`<option value="${i}">${escape(p.name)}</option>`).join(''):''}</select></label>${data.full?`<button id="replaySecretsOpen" type="button">${t('Ver cartas y destinos')}</button><a href="/api/history/${id}/audit">${t('Descargar auditoría')}</a>`:''}<span class="replay-privacy">${t(data.full?'Repetición completa para participantes':'Repetición pública sin secretos')}</span></div><div class="replay-transport"><button id="replayFirst" aria-label="Ir al inicio">⏮</button><button id="replayPrevious" aria-label="Paso anterior">◀</button><button id="replayPlay" aria-label="Reproducir">▶</button><button id="replayNext" aria-label="Paso siguiente">▶|</button><button id="replayLast" aria-label="Ir al final">⏭</button><label>Velocidad<select id="replaySpeed">${[.5,1,2,4,8].map(n=>`<option value="${n}" ${n===1?'selected':''}>${n}×</option>`).join('')}</select></label><input id="replaySeek" type="range" min="0" max="${data.frames.length-1}" value="0" aria-label="Paso de la repetición"><output id="replayPosition"></output></div><label class="replay-events">Acción<select id="replayEvent">${labels.map((label,i)=>`<option value="${i}">${i+1}. ${escape(label)}</option>`).join('')}</select></label>${!data.match.complete?`<small>${t('Registro parcial: la grabación comenzó con la partida ya iniciada.')}</small>`:''}`;
      $('replayViewer').value=viewer;
      function stop(){clearTimeout(timer);timer=null;$('replayPlay').textContent='▶';$('replayPlay').setAttribute('aria-label',t('Reproducir'));}
      function paint(){
        const state=ReplayState.at(data.frames,step),view=structuredClone(state.views[data.full?viewer+1:0]);
        if(data.match.status==='abandoned'&&(step===data.frames.length-1||view.phase==='finished')){view.phase='abandoned';view.result=null;}
        const secrets=$('replaySecretsContent');
        if(data.full){
          const colorNames={red:'Rojo',blue:'Azul',green:'Verde',yellow:'Amarillo',black:'Negro',white:'Blanco',orange:'Naranja',purple:'Morado',wild:'Locomotora'};
          const tickets=items=>(items||[]).map(ticket=>`${escape(CITIES[ticket.a]?.[2]||ticket.a)} — ${escape(CITIES[ticket.b]?.[2]||ticket.b)} (${ticket.p})`).join('<br>')||'—';
          secrets.innerHTML=state.views.slice(1).map((v,i)=>{
            const action=data.frames[step].action;
            const reveal=v.tunnel||(action?.seat===i&&action.action?.type==='claim'?v.events?.findLast(e=>e.type==='tunnel_reveal'&&e.routeId===action.action.routeId):null);
            const cards=items=>items.map(c=>escape(t(colorNames[c]||c))).join(', ')||'—';
            return `<section><h3>${escape(data.match.players[i].name)}</h3><p><b>${t('Mano')}:</b> ${cards(v.hand)}</p><p><b>${t('Billetes conservados')}:</b><br>${tickets(v.tickets)}</p><p><b>${t('Billetes pendientes')}:</b><br>${tickets(v.initial||v.ticketOffer?.tickets)}</p>${reveal?`<p><b>${t('Cartas del túnel')}:</b> ${cards(reveal.revealed)}<br>${t('Suplemento')}: ${reveal.surcharge}</p>`:''}</section>`;
          }).join('');
        }
        show(view,state.members,{at:data.frames[step].at,seat:viewer,full:data.full,match:data.match});
        $('replaySeek').value=step;$('replayEvent').value=step;$('replayPosition').textContent=`${step+1}/${data.frames.length}`;
        $('replayFirst').disabled=$('replayPrevious').disabled=step===0;
        $('replayLast').disabled=$('replayNext').disabled=step===data.frames.length-1;
      }
      function play(){
        $('replayPlay').textContent='Ⅱ';$('replayPlay').setAttribute('aria-label',t('Pausar'));
        timer=setTimeout(()=>{if(step<data.frames.length-1){step++;paint();play();}else stop();},1200/speed);
      }
      const seek=n=>{stop();step=Math.max(0,Math.min(data.frames.length-1,+n));paint();};
      $('replayFirst').onclick=()=>seek(0);$('replayPrevious').onclick=()=>seek(step-1);$('replayNext').onclick=()=>seek(step+1);$('replayLast').onclick=()=>seek(data.frames.length-1);
      $('replaySeek').oninput=e=>seek(e.target.value);$('replayEvent').onchange=e=>seek(e.target.value);
      $('replayPlay').onclick=()=>{if(timer)stop();else{if(step===data.frames.length-1){step=0;paint();}play();}};
      $('replaySpeed').onchange=e=>{const running=!!timer;stop();speed=+e.target.value;if(running)play();};
      $('replayViewer').onchange=e=>{viewer=+e.target.value;paint();};
      if(data.full)$('replaySecretsOpen').onclick=()=>{stop();$('replaySecrets').showModal();};
      document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
      new ResizeObserver(()=>document.body.style.setProperty('--replay-height',controls.getBoundingClientRect().height+'px')).observe(controls);
      paint();
    }catch(error){controls.innerHTML=`<p role="alert">${escape(error.message)}</p><a href="/profile?tab=history">${t('Volver al historial')}</a>`;}
  }
  return {profile,replay};
})();
