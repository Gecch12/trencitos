"use strict";
const ProfileSummary = (() => {
 const t=(...args)=>I18n.t(...args), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>n==null?'—':new Intl.NumberFormat(I18n.language,{maximumFractionDigits:2}).format(n);
 const date=n=>new Intl.DateTimeFormat(I18n.language,{dateStyle:'medium'}).format(n);
 let tooltip=null,owner=null,pinned=false;
 function closeHelp(){if(owner)owner.removeAttribute('aria-describedby');tooltip?.remove();tooltip=owner=null;pinned=false;}
 function help(el,pin=false){
  if(owner===el&&pin&&pinned){closeHelp();return;}
  closeHelp();owner=el;pinned=pin;tooltip=document.createElement('div');tooltip.id='statExplanation';tooltip.role='tooltip';tooltip.className='stat-explanation';tooltip.textContent=el.dataset.statHelp;document.body.append(tooltip);el.setAttribute('aria-describedby',tooltip.id);
  const r=el.getBoundingClientRect(),box=tooltip.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(innerWidth-box.width-8,r.left+r.width/2-box.width/2))+'px';tooltip.style.top=Math.max(8,r.bottom+box.height+12<innerHeight?r.bottom+8:r.top-box.height-8)+'px';
 }
 document.addEventListener('pointerdown',e=>{if(owner&&!owner.contains(e.target)&&!tooltip?.contains(e.target))closeHelp();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHelp();});
 document.addEventListener('scroll',closeHelp,true);window.addEventListener('resize',closeHelp);
 function mount(root){for(const el of root.querySelectorAll('[data-stat-help]')){
  el.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&!pinned)help(el);});el.addEventListener('pointerleave',()=>{if(owner===el&&!pinned)closeHelp();});
  el.addEventListener('focus',()=>help(el));el.addEventListener('blur',()=>{if(owner===el)closeHelp();});el.addEventListener('click',()=>help(el,true));
  if(el.tagName!=='BUTTON')el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();help(el,true);}});
 }}
 const attr=text=>`data-stat-help="${esc(text)}"`;
 function metric(label,value,icon,explanation,detail='',extra=''){
  return `<article class="summary-metric"><button type="button" class="stat-card" ${attr(explanation)}>${ShellIcons.svg(icon)}<span>${t(label)}</span><strong>${esc(value)}</strong>${detail?`<small>${esc(detail)}</small>`:''}</button>${extra}</article>`;
 }
 function chart(rows,key,average,scope){
  const valid=rows.filter(r=>r[key]!=null);if(!valid.length)return `<p class="summary-empty">${t('Sin resultados')}</p>`;
  const values=valid.map(r=>r[key]),bars=key==='destinationRate',lo=bars?0:Math.min(0,...values),hi=bars?100:Math.max(1,...values),y=v=>150-(v-lo)/(hi-lo)*120;
  const x=i=>valid.length===1?300:44+i*512/(valid.length-1);
  const grid=[lo,(hi+lo)/2,hi].map(v=>`<line x1="36" y1="${y(v)}" x2="572" y2="${y(v)}"/><text x="30" y="${y(v)+4}" text-anchor="end">${num(v)}${bars?'%':''}</text>`).join('');
  const marks=valid.map((r,i)=>{
   const value=r[key],explain=bars?t`${r.completed} / ${r.tickets} destinos × 100 = ${num(value)}%.`:t`${num(value)} puntos al terminar la partida.`;
   const label=`${t(r.map)} · ${date(r.date)} · ${explain} ${scope}`;
   return `<g role="button" tabindex="0" aria-label="${esc(label)}" ${attr(label)}>${bars?`<rect class="chart-bar" x="${x(i)-Math.min(12,210/valid.length)}" y="${y(value)}" width="${Math.min(24,420/valid.length)}" height="${Math.max(2,150-y(value))}" rx="4"/>`:`<circle class="chart-dot" cx="${x(i)}" cy="${y(value)}" r="5"/>`}<circle class="chart-hit" cx="${x(i)}" cy="${y(value)}" r="16"/></g>`;
  }).join('');
  return `<svg class="summary-chart" viewBox="0 0 600 184" role="group" aria-label="${esc(t(bars?'Destinos por partida':'Puntuaciones recientes'))}"><g class="chart-grid">${grid}</g>${!bars?`<polyline class="chart-line" points="${values.map((v,i)=>`${x(i)},${y(v)}`).join(' ')}"/>`:average!=null?`<line class="chart-average" x1="36" x2="572" y1="${y(average)}" y2="${y(average)}"/>`:''}${marks}<text x="44" y="178">${date(valid[0].date)}</text><text x="556" y="178" text-anchor="end">${valid.length>1?date(valid.at(-1).date):''}</text></svg>`;
 }
 function render(data,selected){
  const s=data.summary,c=data.commitment,g=data.global;
  const map=data.maps.find(m=>m.id===selected.map)?.name||'Todos',mode={all:'Todas',humans:'Solo humanos',mixed:'Humanos y bots',practice:'Práctica'}[selected.mode];
  const scope=[t(map),t(selected.rules||'Todas'),selected.players||t('Todos'),t(mode),t(selected.period==='all'?'Todo el historial':selected.period==='30'?'Últimos 30 días':'Últimos 90 días')].join(' · ');
  const explanation=text=>`${text} ${scope}`;
  const rateHelp=explanation(t`Promedio del porcentaje de destinos completados en cada partida. Cada partida pesa lo mismo. ${s.destinationSample} partidas con datos válidos; se excluyen abandonos y registros sin destinos.`);
  const compareHelp=t`Comparación de resultados con los mismos filtros. ${g?.sample||0} resultados y ${g?.players||0} jugadores. El percentil del récord requiere 30 resultados y 5 jugadores; el del promedio requiere 5 partidas propias y 5 jugadores con al menos 5 partidas.`;
  const comparisonFormula={
   'Tu promedio':t`${s.totalPoints} puntos / ${s.sample} resultados finales válidos. Se excluyen abandonos.`,
   'Promedio global':t`Suma de puntos / ${g?.sample||0} resultados finales válidos de jugadores con cuenta.`,
   'Mediana global':t('Puntuación central al ordenar los resultados; con dos valores centrales, se usa su media.'),
   'Récord global':t`Mayor puntuación entre ${g?.sample||0} resultados finales válidos.`
  };
  const percent=v=>v==null?'—':num(v)+'%';
  return `<div class="summary-overview">
   <div class="summary-primary">
    ${metric('Partidas jugadas',num(s.played),'history',explanation(t`${s.completed} completadas + ${s.abandoned} abandonos personales. ${s.active} en curso, fuera del cálculo.`))}
    ${metric('Victorias',num(s.wins),'flag',explanation(t`${s.wins} primeros puestos / ${s.played} partidas × 100 = ${percent(s.winRate)}. Incluye victorias compartidas; los abandonos cuentan como derrotas.`),percent(s.winRate))}
    ${metric('Puntos por partida',num(s.average),'trophy',explanation(t`${s.totalPoints} puntos / ${s.sample} resultados finales válidos. Se excluyen abandonos.`))}
    ${metric('Récord personal',num(s.best?.score),'trophy',explanation(t`Mayor puntuación entre ${s.sample} resultados finales válidos.`),s.best?t(s.best.map):'',s.best?`<a class="stat-replay" href="/replay?id=${encodeURIComponent(s.best.matchId)}">${t('Ver partida')}${ShellIcons.svg('chevron')}</a>`:'')}
   </div>
   <div class="summary-charts">
    <section class="profile-card"><header>${ShellIcons.svg('history')}<h3>${t('Puntuaciones recientes')}</h3><small>${t('Últimas 20 partidas')}</small></header>${chart(s.trend,'score',null,scope)}</section>
    <section class="profile-card"><header>${ShellIcons.svg('ticket')}<h3>${t('Destinos completados')}</h3><button type="button" class="chart-value" ${attr(rateHelp)}>${percent(s.destinationAverage)}</button></header><small class="chart-subtitle">${t('Promedio por partida')}</small>${chart(s.trend,'destinationRate',s.destinationAverage,scope)}</section>
   </div>
   <div class="summary-secondary">
    ${metric('Camino más largo',num(s.longest),'express',explanation(t`Mayor longitud entre ${s.sample} resultados finales válidos: un camino continuo propio, sin repetir vías ni usar préstamos de estaciones.`),t('vagones'))}
    ${metric('Victorias seguidas',num(s.winStreak),'flag',explanation(t`Victorias consecutivas desde la partida más reciente dentro de los filtros. Incluye victorias compartidas.`))}
    ${metric('Racha sin abandonos',num(s.completionStreak),'shield',explanation(t`Partidas terminadas consecutivas sin abandono personal, desde la más reciente dentro de los filtros.`))}
   </div>
   <section class="commitment-card summary-commitment"><button type="button" class="commitment-help" ${attr(c.sample===0?t('Sin participaciones computables todavía. Solo mesas con al menos dos humanos originales; excluye práctica y Laboratorio.'):t`Máximo de 0 y 20 menos ${c.abandons} abandonos penalizados en las últimas ${c.sample} participaciones computables (hasta 20). Solo mesas con al menos dos humanos originales; excluye práctica. Es independiente de los filtros; las reconexiones breves no restan.`)}>${ShellIcons.svg('shield')}<h3>${t('Compromiso')}</h3><strong class="commitment-value">${c.score==null?t('Sin datos'):c.score+'/20'}</strong><small>${c.sample}/20 ${t('partidas')}</small>${ShellIcons.svg('info')}</button></section>
   <section class="profile-card summary-comparison"><header>${ShellIcons.svg('globe')}<h3>${t('Comparación con Trencitos')}</h3></header>${g?`${[['Tu promedio',s.average],['Promedio global',g.average],['Mediana global',g.median],['Récord global',g.best]].map(([label,value])=>`<button type="button" class="comparison-row" ${attr(explanation(comparisonFormula[label]+' '+compareHelp))}><span>${t(label)}</span><meter min="${Math.min(0,s.average||0,g.average||0,g.median||0,g.best||0)}" max="${Math.max(1,s.average||0,g.average||0,g.median||0,g.best||0)}" value="${value??0}" aria-hidden="true"></meter><strong>${num(value)}</strong></button>`).join('')}<div class="comparison-percentiles">${metric('Percentil de tu récord',num(g.scorePercentile),'trophy',explanation(compareHelp+' '+t('Porcentaje de resultados con puntuación menor o igual a tu récord.')))}${metric('Percentil de tu promedio',num(g.averagePercentile),'user',explanation(compareHelp+' '+t('Porcentaje de jugadores con promedio menor o igual al tuyo.')))}</div><small>${t('Actualizado')}: ${date(g.updatedAt)}</small>`:`<p class="summary-empty">${t('Sin datos')}</p>`}</section>
  </div>`;
 }
 return {render,mount,closeHelp};
})();
