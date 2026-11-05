"use strict";
const HistoryUI = (() => {
  const $=id=>document.getElementById(id),t=I18n.t;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>new Intl.DateTimeFormat(I18n.language,{dateStyle:'short',timeStyle:'short'}).format(value);
  const status={active:'En curso',completed:'Completada',abandoned:'Abandonada'};
  async function api(id='') {
    const response=await TrencitosConnection.request('/api/history'+(id?'/'+encodeURIComponent(id):''),{credentials:'same-origin',cache:'no-store'}),data=await response.json();
    if(!response.ok)throw Error(t(data.message));return data;
  }
  function duration(match) {
    if (!Number.isFinite(match.closedAt) || !Number.isFinite(match.startedAt)) return '—';
    const seconds = Math.max(0, Math.floor((match.closedAt - match.startedAt) / 1000));
    const parts = [Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2,'0'));
    if (seconds >= 3600) parts.unshift(String(Math.floor(seconds / 3600)));
    return (match.complete ? '' : '~') + parts.join(':');
  }
  function scoreDetails(match) {
    return `<div class="history-detail-content"><strong>${escape(t(match.map))} · ${escape(t(match.mode))}</strong>
      ${!match.complete ? `<p>${t('Registro parcial: la grabación comenzó con la partida ya iniciada.')}</p>` : ''}
      <div class="history-score-table"><table><caption class="sr-only">${t(match.status==='completed'?'Desglose de puntos':'Progreso registrado')}</caption>
      <thead><tr><th>${t('Jugador')}</th>${['trophy','routes','ticket','station','express'].map(icon=>`<th>${ShellIcons.scoreHeader(icon)}</th>`).join('')}</tr></thead>
      <tbody>${match.scores.map(s=>`<tr><th>${escape(match.players[s.seat]?.name)}${s.winner?' 🏆':''}</th><td class="history-score-total">${s.score}${s.partial?'*':''}</td><td>${s.route}</td><td>${s.partial?'—':s.destination}</td><td>${s.partial?'—':s.stations}</td><td>${s.partial?'—':s.express}</td></tr>`).join('')}</tbody></table></div>
      ${match.status!=='completed'?`<p>${t('Puntos parciales de rutas. Los destinos y las bonificaciones no se liquidan hasta completar la partida.')}</p>`:''}
      ${match.status==='active'?`<p>${t('La repetición estará disponible cuando la partida se cierre.')}</p>`:''}</div>`;
  }
  const replayIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4Z"/></svg>';
  function historyRows(matches) {
    return matches.map((m,i)=>{
      const when=escape(date(m.startedAt)), rank=m.status==='completed'&&Number.isInteger(m.rank)?`${m.rank}/${m.players.length}`:'—';
      const names=m.players.map((p,seat)=>`<span class="${seat===m.ownSeat?'history-self':''}">${escape(p.name)}</span>`).join('<span aria-hidden="true"> · </span>');
      return `<tr class="history-row" data-history-row="${i}">
        <td class="history-date"><button class="history-expand" type="button" aria-expanded="false" aria-controls="match-detail-${i}" aria-label="${escape(t`Ver detalles de la partida del ${date(m.startedAt)}`)}"><span class="history-chevron" aria-hidden="true">›</span><time datetime="${new Date(m.startedAt).toISOString()}">${when}</time></button></td>
        <td class="history-rank ${m.rank===1?'is-winner':''}" aria-label="${escape(t`Tu puesto: ${rank}`)}">${rank}</td>
        <td class="history-players"><div title="${escape(m.players.map(p=>p.name).join(' · '))}">${names}</div></td>
        <td class="history-duration" title="${t(!m.complete?'Tiempo registrado':'Duración')}">${duration(m)}</td>
        <td class="history-state"><span class="match-status ${m.status}">${t(status[m.status])}</span></td>
        <td class="history-replay">${m.status==='active'?`<span class="replay-unavailable" title="${t('La repetición estará disponible cuando la partida se cierre.')}">—</span>`:`<a href="/replay?id=${encodeURIComponent(m.id)}" aria-label="${escape(t`Ver repetición del ${date(m.startedAt)}`)}" title="${t('Ver repetición')}">${replayIcon}</a>`}</td>
      </tr><tr id="match-detail-${i}" class="history-detail" hidden><td colspan="6">${scoreDetails(m)}</td></tr>`;
    }).join('');
  }
  let profileRequest=0, scrollCleanups=[];
  const clearTracks=()=>{scrollCleanups.forEach(clean=>clean());scrollCleanups=[];};
  async function profile(tab) {
    const request=++profileRequest;clearTracks();ShellIcons.hideTooltip();
    const root=$('historyPanel');root.hidden=!['history','overview'].includes(tab);if(root.hidden)return;
    root.innerHTML=`<p role="status">${t('Cargando…')}</p>`;
    try {
      const {matches}=await api();if(request!==profileRequest)return;
      if(tab==='overview') {
        const completed=matches.filter(m=>m.status==='completed');
        root.innerHTML=t`<div class="history-summary"><strong>${completed.length}</strong><span>Partidas completadas</span><strong>${matches.filter(m=>m.status==='abandoned').length}</strong><span>Partidas abandonadas</span><strong>${matches.filter(m=>m.status==='active').length}</strong><span>Partidas en curso</span></div><p class="shell-muted">Las partidas abandonadas no cuentan como resultados completados.</p>`;
        return;
      }
      root.innerHTML=`<div class="history-toolbar"><label for="historyFilter">${t('Filtrar partidas')}<select id="historyFilter"><option value="all">${t('Todas')}</option><option value="active">${t('En curso')}</option><option value="completed" selected>${t('Completadas')}</option><option value="abandoned">${t('Abandonadas')}</option></select></label>
        <details class="history-info"><summary aria-label="${t('Acerca de tu historial')}" title="${t('Acerca de tu historial')}">i</summary><p>${t('Tu historial se guarda en el servidor. Vincula Google para acceder desde otros dispositivos; sin vincular, borrar los datos del navegador puede hacerte perder el acceso.')}</p></details></div>
        <div id="matchList" class="history-list"></div>`;
      const draw=()=>{
        clearTracks();ShellIcons.hideTooltip();
        const rows=matches.filter(m=>$('historyFilter').value==='all'||m.status===$('historyFilter').value);
        $('matchList').innerHTML=rows.length?`<table class="history-table"><caption class="sr-only">${t('Historial de partidas')}</caption>
          <thead><tr><th>${t('Fecha')}</th><th>${t('Tu puesto')}</th><th>${t('Jugadores')}</th><th>${t('Duración')}</th><th>${t('Estado')}</th><th><span class="sr-only">${t('Ver repetición')}</span></th></tr></thead>
          <tbody>${historyRows(rows)}</tbody></table>`:`<p class="history-empty">${t(matches.length?'No hay partidas con este filtro.':'Todavía no hay partidas en este historial.')}</p>`;
        ShellIcons.mount($('matchList'));
        scrollCleanups=[...$('matchList').querySelectorAll('.history-score-table')].map(ShellIcons.scrollTrack);
      };
      $('matchList').onclick=event=>{
        const row=event.target.closest('[data-history-row]');
        if(!row || event.target.closest('a'))return;
        const button=row.querySelector('.history-expand'), open=button.getAttribute('aria-expanded')!=='true';
        for(const other of $('matchList').querySelectorAll('.history-expand')) {
          other.setAttribute('aria-expanded','false');$(other.getAttribute('aria-controls')).hidden=true;
        }
        button.setAttribute('aria-expanded',String(open));$(button.getAttribute('aria-controls')).hidden=!open;
      };
      $('historyFilter').onchange=draw;draw();
    } catch(error){if(request!==profileRequest)return;root.innerHTML=`<p role="alert">${escape(error.message)}</p><button id="retryHistory">${t('Reintentar')}</button>`;$('retryHistory').onclick=()=>profile(tab);}
  }
  async function loadReplay(id,onUpdate,signal){
    const response=await TrencitosConnection.request('/api/history/'+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/x-ndjson'},signal});
    if(!response.ok){const error=await response.json();throw Error(t(error.message));}
    if(!response.headers.get('content-type')?.includes('application/x-ndjson')){
      const data=await response.json();data.complete=true;onUpdate(data);return data;
    }
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let pending='',data=null,ended=false,start=performance.now(),dirty=false;
    const accept=line=>{
      const item=JSON.parse(line);
      if(ended)throw Error(t('Esta repetición no está disponible.'));
      if(item.type==='match'&&!data)data={...item,frames:[],complete:false};
      else if(item.type==='frame'&&data){
        const previous=data.frames.at(-1);
        if(previous&&item.frame.seq!==previous.seq+1||!previous&&!item.frame.snapshot)throw Error(t('Esta repetición no está disponible.'));
        data.frames.push(item.frame);dirty=true;
      }else if(item.type==='end'&&data&&item.steps===data.frames.length&&item.steps===data.match.steps){data.complete=true;ended=true;dirty=true;}
      else throw Error(t('Esta repetición no está disponible.'));
    };
    try{
      while(true){
        const {value,done}=await reader.read();pending+=decoder.decode(value,{stream:!done});
        let newline;
        while((newline=pending.indexOf('\n'))>=0){
          const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(line)accept(line);
          if(dirty&&(data.frames.length===1||performance.now()-start>16)){
            onUpdate(data);dirty=false;
            await new Promise(resolve=>setTimeout(resolve,0));start=performance.now();
          }
        }
        if(dirty){onUpdate(data);dirty=false;}
        if(done)break;
      }
      if(!ended||pending.trim())throw Error(t('Esta repetición no está disponible.'));
      return data;
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  const replay=(id,show,options={})=>ReplayUI.open({id,load:loadReplay,show,...options});
  return {profile,replay};
})();
