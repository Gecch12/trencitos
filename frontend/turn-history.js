"use strict";
// Live input is filtered by the server. Only closed replays request revealAll.
const TurnHistory = (() => {
  const I18n=typeof module!=='undefined'&&module.exports?require('../shared/i18n'):globalThis.TrencitosI18n;
  const t=(...args)=>I18n.t(...args);
  // Hide automatic pile maintenance only in presentation; keep the journal intact.
  const visibleEvent=event=>!['market_refill','recycled'].includes(event.type);
  function displayRows(rows) {
    return rows.flatMap(source=>{
      const row={...source,events:source.events.filter(visibleEvent)};
      if(!row.events.length)return [];
      const milestones=row.events.filter(e=>e.type==='longest');
      if(!milestones.length)return [row];
      const events=row.events.filter(e=>e.type!=='longest');
      return [...(events.length?[{...row,events}]:[]),...milestones.map(event=>({
        id:`longest:${event.id}`,at:event.at,turn:null,seat:null,kind:'longest',events:[event],
      }))];
    });
  }
  function content(row, {players,city,revealAll=false}) {
    const parts=[],events=row.events.filter(visibleEvent),hasDraws=events.some(e=>e.type==='draw');
    if(!events.length)return parts;
    let section='header',system=false,afterDraw=false,phase=null;
    const add=part=>parts.push({...part,section,system,phase});
    const text=value=>add({text:value}),cards=(label,values,className)=>add({text:label,cards:values,className});
    const payment=value=>value?Array(value.regular||0).fill(value.color).concat(Array(value.wild||0).fill('wild')):[];
    const route=value=>`${city(value.a)} — ${city(value.b)}`;
    const name=seat=>players[seat]?.name||'—';
    const ticketKey=ticket=>ticket.id??`${ticket.a}:${ticket.b}:${ticket.p}`;
    const tickets=(offered,kept=[],discarded=[])=>{
      const items=new Map([...(offered||[]),...kept,...discarded].map(ticket=>[ticketKey(ticket),ticket]));
      if(!items.size)return false;
      const yes=new Set(kept.map(ticketKey)),no=new Set(discarded.map(ticketKey));
      add({tickets:[...items].map(([key,ticket])=>({route:route(ticket),points:ticket.p,status:yes.has(key)?'kept':no.has(key)?'discarded':null}))});return true;
    };
    const actors=[...new Set(events.filter(e=>!['market_refresh','destinations','longest','deck_empty'].includes(e.type)).map(e=>e.actor))];
    if(row.turn===null&&row.at&&row.kind!=='longest')text(new Date(row.at).toLocaleTimeString(I18n.language==='en'?'en-GB':'es-PE',{hour:'2-digit',minute:'2-digit'}));
    if(row.seat!==null)text(name(row.seat));
    if(actors.includes('replacement'))text(t('Bot de reemplazo'));
    if(actors.includes('timer'))text(t('Automático por tiempo'));
    let drawn=0,previousDraw=null;
    for(const [index,e] of events.entries()){
      const d=e.data;section=index;phase=null;
      system=['market_refresh','deck_empty'].includes(e.type);
      if(system&&hasDraws)phase=afterDraw?'after':drawn?'during':'before';
      switch(e.type){
        case 'draw': {
          drawn++;
          const color=!revealAll&&d.index<0?'back':d.color||'back';
          if(index>0&&events[index-1].type==='draw')previousDraw.cards.push(color);
          else {cards(t('Robó'),[color],'history-drawn-cards');previousDraw=parts.at(-1);}
          afterDraw=d.endsTurn??(drawn>=2||d.index>=0&&d.color==='wild');break;
        }
        case 'market_refresh':cards(t('Mesa retirada por 3 comodines'),d.before,'history-market-refresh');cards(t('Nueva mesa'),d.after,'history-market-new');break;
        case 'deck_empty':text(t('Mazo agotado'));break;
        case 'tunnel':text(t`Túnel ${route(d)}`);cards(t('Base'),payment(d.base));cards(t('Reveló'),d.revealed);text(t`Extra: ${d.surcharge}`);if(!events.some(e=>e.type==='tunnel_result'))text(t('En curso'));break;
        case 'tunnel_result':
          if(d.outcome==='built'){cards(t('Pagó extra'),payment(d.extra));text(t`Construido (+${d.points})`);}
          else text(t(d.reason==='timeout'?'Desistió por tiempo; conserva sus cartas':'Desistió; conserva sus cartas'));break;
        case 'build':text(t`Ocupó ${route(d)} (+${d.points})`);cards(t('Pagó'),payment(d.payment));break;
        case 'station':text(t`Estación en ${city(d.city)}`);cards(t('Pagó'),payment(d.payment));break;
        case 'initial':case 'tickets_kept':
          if(e.type==='initial'&&d.handCount)cards(t('Mano inicial'),d.hand||Array(d.handCount).fill('back'),'history-initial-cards');
          if(!revealAll||!tickets(d.offeredTickets,d.tickets,d.discardedTickets))text(t`Destinos: recibió ${d.received}, conservó ${d.kept}, descartó ${d.discarded}`);
          break;
        case 'tickets_offer':
          if(events.some(event=>event.type==='tickets_kept'))break;
          text(t`Recibió ${d.received} destinos; está eligiendo`);if(revealAll)tickets(d.tickets);break;
        case 'setup':text(t`Inicio · empieza ${name(d.first)}`);break;
        case 'timeout':text(t('Tiempo agotado'));break;
        case 'no_action':text(t('Turno sin jugada'));break;
        case 'pass':text(t('Pasó: sin movimientos legales'));break;
        case 'disconnected':text(t('Se desconectó'));break;
        case 'connected':text(t('Regresó a la partida'));break;
        case 'bot_control':text(t('Un bot tomó el control'));break;
        case 'human_control':text(t('Recuperó el control'));break;
        case 'paused':text(t('Partida pausada: todos desconectados'));break;
        case 'resumed':text(t('Partida reanudada'));break;
        case 'longest': {
          const names=d.leaders.map(name),last=names.pop();
          text(!d.leaders.length?t('Sin líder de camino más largo'):d.leaders.length===1?
            t`${last} lidera el camino más largo · +${d.points} provisional`:
            t`${names.join(', ')} y ${last} empatan en el camino más largo · +${d.points} provisional cada uno`);break;
        }
        case 'destinations':
          if(d.completed.length)text(revealAll?t`${name(d.subjectSeat??e.seat)} · Destinos cumplidos: ${d.completed.length}`:t`Tus destinos cumplidos: ${d.completed.length}`);
          if(d.pending.length)text(revealAll?t`${name(d.subjectSeat??e.seat)} · Destinos pendientes: ${d.pending.length}`:t`Tus destinos pendientes tras reasignar estaciones: ${d.pending.length}`);break;
        case 'notice':case 'legacy':case 'ended':text(d.message?I18n.format(d.message):t(d.text));break;
      }
    }
    return parts;
  }
  function render(row,context,{button=false}={}) {
    const node=document.createElement(button?'button':'div');node.className='turn-history-row';node.dataset.historyId=row.id;
    const events=row.events.filter(visibleEvent);
    if(events.length&&events.every(e=>['draw','pass','no_action','connected','disconnected','tickets_offer'].includes(e.type)))node.classList.add('history-compact');
    if(button)node.type='button';
    if(row.kind==='longest'){
      node.classList.add('history-system');
      const icon=document.createElement('span');icon.className='history-system-icon';icon.setAttribute('aria-hidden','true');
      icon.innerHTML=ShellIcons.svg('trophy');node.append(icon);
    }
    let container=null,section=null,lastPhase=null;
    for(const part of content(row,context)){
      if(part.section!==section){
        section=part.section;container=document.createElement('span');
        container.className=section==='header'?'history-turn-heading':row.kind==='longest'?'history-system-text':'history-step';
        if(part.system){
          container.classList.add('history-system-step');container.dataset.phase=part.phase;
          if(part.phase&&part.phase!==lastPhase){const label=document.createElement('small');label.className='history-step-label';label.textContent=t(part.phase==='after'?'Después del robo':part.phase==='before'?'Antes del robo':'Durante el robo');container.append(label);}
          lastPhase=part.phase;
        } else lastPhase=null;
        node.append(container);
      } else if(!part.tickets&&part.className!=='history-market-new'){const separator=document.createElement('span');separator.className='history-separator';separator.textContent=' · ';container.append(separator);}
      const span=document.createElement('span');span.textContent=part.text||'';container.append(span);
      if(part.tickets){
        span.className='history-tickets';span.setAttribute('role','list');span.setAttribute('aria-label',t('Destinos'));
        for(const ticket of part.tickets){
          const item=document.createElement('span');item.className='history-ticket';item.setAttribute('role','listitem');
          const status=document.createElement('span');status.className='history-ticket-status '+(ticket.status||'');
          status.textContent=ticket.status==='kept'?'✓':ticket.status==='discarded'?'✕':'•';
          if(ticket.status){status.setAttribute('role','img');status.setAttribute('aria-label',t(ticket.status==='kept'?'Billetes conservados':'Descartados'));}
          const route=document.createElement('span');route.textContent=ticket.route;
          const points=document.createElement('strong');points.textContent=ticket.points;points.setAttribute('aria-label',t`${ticket.points} puntos`);
          item.append(status,route,points);span.append(item);
        }
      }
      if(part.cards){
        span.className=['history-draw',part.className].filter(Boolean).join(' ');
        if(!part.cards.length)span.append(document.createTextNode(' 0'));
        for(const color of part.cards){const img=document.createElement('img');img.src=`/assets/cards/${color}.svg`;img.alt=t(color==='back'?'Carta oculta del mazo':({red:'Rojo',blue:'Azul',green:'Verde',yellow:'Amarillo',black:'Negro',white:'Blanco',orange:'Naranja',purple:'Morado',wild:'Comodín'}[color]||color));img.title=img.alt;span.append(img);}
      }
    }
    return node;
  }
  return {displayRows,content,render};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TurnHistory;
