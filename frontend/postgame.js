"use strict";
const Postgame=(()=>{
 const $=id=>document.getElementById(id),t=(...a)=>I18n.t(...a),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let cfg,mode='map',snapshot=null,plan=null,result=null,category=null,index=0,total=0,shown={},lit=new Set(),borrowed=new Set(),medals=[],active=[],running=false,paused=false,elapsed=0,last=0,frame=0,speed=1,counterHeight=0,viewportKey='';
 let counted=false,stepSpeed=1,holdDuration=0,generation=0;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 function setup(options){cfg=options;
  const counter=document.createElement('section');counter.id='recountCounter';counter.hidden=true;counter.setAttribute('aria-label',t('Recuento'));document.body.append(counter);
  new ResizeObserver(layout).observe($('mapscroll'));window.addEventListener('resize',layout);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)togglePause();});
  reduced.addEventListener('change',()=>{if(reduced.matches&&running)skip();});
 }
 function layout(){if(!cfg||mode==='map')return;const r=$('mapscroll').getBoundingClientRect(),a=cfg.area(r);
  for(const [key,val]of Object.entries({left:r.left+a.x,top:r.top+a.y,width:a.width,height:a.height}))document.body.style.setProperty('--postgame-'+key,val+'px');
  const key=a.width+':'+a.height;
  if(key!==viewportKey&&mode==='recount'&&!$('recountCounter').hidden){counterHeight=$('recountCounter').getBoundingClientRect().height;cfg.fit(plan.hidden);}
  viewportKey=key;
  if(plan&&['results','recount'].includes(mode))cfg.board()?.setScoreMedals(medals,cameraArea(a));
 }
 function remember(){if(!snapshot)snapshot=cfg.capture();}
 function stop(){running=false;generation++;cancelAnimationFrame(frame);frame=0;cfg?.board()?.cancelAnimations();cfg?.board()?.pauseConstruction(false);}
 function sync(){cfg?.refresh();layout();}
 function results(){if(mode==='replay')cfg.endReplay();remember();stop();mode='results';document.body.classList.add('is-postgame');$('recountCounter').hidden=true;$('postgameReplayReturn')?.setAttribute('hidden','');sync();}
 function map(){if(mode==='replay')cfg.endReplay();stop();mode='map';document.body.classList.remove('is-postgame');$('overlay').classList.remove('postgame-results');$('recountCounter').hidden=true;$('postgameReplayReturn')?.setAttribute('hidden','');cfg.board()?.setScoreMedals([]);plan=null;lit.clear();active=[];if(snapshot){const previous=snapshot;snapshot=null;cfg.restore(previous);}sync();}
 function reset(){if(!cfg)return;map();result=null;}
 function categoryName(){return t({routes:'Rutas construidas',destinations:'Destinos',express:'Camino más largo',stations:'Estaciones'}[category]);}
 function cameraArea(area){
  if(!plan||!['recount','results'].includes(mode))return area;
  return {...area,height:Math.max(80,area.height-counterHeight-12)};
 }
 function counter(){
  const root=$('recountCounter'),focusId=root.contains(document.activeElement)?document.activeElement.id:null;
  root.hidden=mode!=='recount';root.dataset.category=category;root.dataset.total=total;root.dataset.step=index;root.dataset.running=String(running);
  const key=[running,paused,category,result.seat].join(':');
  if(root.dataset.controls!==key){
   root.dataset.controls=key;
   root.innerHTML=`<div class="recount-heading">${ShellIcons.svg(category==='express'?'express':category==='destinations'?'ticket':category==='stations'?'station':'routes')}<span>${esc(result.name)}<small>${categoryName()}</small></span><strong><output id="recountTotal"></output><small>${t(category==='express'?'vagones':'puntos')}</small></strong></div><div class="recount-caption"></div><div class="recount-controls">${running?`<button id="recountPause">${t(paused?'Continuar':'Pausar')}</button><button id="recountSkip">${t('Saltar')}</button><select id="recountSpeed" aria-label="${t('Velocidad')}">${[.5,1,2,4].map(n=>`<option value="${n}" ${speed===n?'selected':''}>${n}×</option>`).join('')}</select>`:`<button id="recountAgain">${t('Repetir')}</button><button id="recountResults" class="primary">${t('Volver a resultados')}</button>`}</div>`;
   if(running){$('recountPause').onclick=togglePause;$('recountSkip').onclick=skip;$('recountSpeed').onchange=e=>{speed=Number(e.target.value);};}
   else{$('recountResults').onclick=cfg.results;$('recountAgain').onclick=()=>start(result,category);}
   if(focusId)($(focusId)||$(running?'recountPause':'recountResults'))?.focus({preventScroll:true});
  }
  $('recountTotal').setAttribute('aria-live',!running||paused?'polite':'off');$('recountTotal').textContent=total??'—';
  root.querySelector('.recount-caption').textContent=plan.available===false?t('Detalle no disponible para este registro.'):(plan.steps[Math.min(index,plan.steps.length-1)]?.label?.map(cfg.city).join(' — ')||'')+(!running&&category==='express'&&plan.bonus!=null?` · ${t('Bonificación')}: +${plan.bonus}`:'');
  if(mode==='recount'&&!counterHeight)counterHeight=root.getBoundingClientRect().height;
 }
 function togglePause(){paused=!paused;last=performance.now();cfg.board()?.pauseConstruction(paused);counter();}
 function visual(){cfg.sync();cfg.board()?.setScoreMedals(medals.map(m=>({...m,active:running&&m.step===index})),cameraArea(cfg.area($('mapscroll').getBoundingClientRect())));}
 function reveal(step){active=step.routes;for(const id of step.routes){lit.add(id);const n=cfg.geometry(id)?.cells.length||0;shown[id]??=[];if(step.cell!=null){if(!shown[id].includes(step.cell))shown[id].push(step.cell);}else shown[id]=Array.from({length:n},(_,i)=>i);}
  for(const id of step.borrowed||[])borrowed.add(id);visual();
 }
 function medal(step){const geo=cfg.geometry(step.anchor),cell=step.cell==null?geo?.cells[Math.floor(geo.cells.length/2)]:geo?.cells[step.cell];let point=cell||cfg.cityPoint(step.label?.[0]);if(!point)return;
  const m={id:category==='express'?'length':String(index),x:point.x,y:point.y,text:category==='express'?String(total):(step.points>=0?'+':'')+step.points,step:index};
  if(category==='express')medals=[m];else medals.push(m);
 }
 function commit(){if(counted)return;counted=true;elapsed=0;last=performance.now();const step=plan.steps[index];total+=step.points;medal(step);visual();counter();}
 function duration(){
  if(category!=='express')return category==='destinations'?1150:800;
  const step=plan.steps[index],next=plan.steps[index+1];
  return 700+(next&&next.anchor!==step.anchor?350:0);
 }
 function beginStep(){
  elapsed=0;counted=false;stepSpeed=speed;
  const step=plan.steps[index],animationDuration=Math.min(600,duration()*.7),currentGeneration=generation,currentIndex=index;
  holdDuration=duration()-animationDuration;
  reveal(step);counter();
  let landings=0;
  const landed=()=>{if(!running||generation!==currentGeneration||index!==currentIndex)return;if(--landings===0){commit();cfg.landed?.();}};
  // Count this step when its last wagon lands, retaining its caption during the
  // reading pause. Speed changes take effect at the next step for both clocks.
  if(!reduced.matches)for(const id of step.routes){
   if(cfg.board()?.animateConstruction({routeId:id},landed,{duration:animationDuration/stepSpeed,cells:step.cell==null?null:[step.cell],simultaneous:category==='destinations'}))landings++;
  }
  if(!landings)commit();
 }
 function finish(){stop();total=plan.total;active=[];counter();visual();}
 function tick(now){frame=0;if(!running)return;const dt=Math.max(0,Math.min(100,now-last));last=now;if(!paused&&counted){elapsed+=dt*stepSpeed;if(elapsed>=holdDuration){index++;if(index>=plan.steps.length){finish();return;}beginStep();}}frame=requestAnimationFrame(tick);}
 function skip(){stop();for(;index<plan.steps.length;index++){reveal(plan.steps[index]);commit();counted=false;}finish();}
 function start(row,kind){remember();stop();mode='recount';result=row;category=kind;plan=ScoreRecount.plan(row,kind,cfg.routes());index=total=counterHeight=0;shown={};lit=new Set();borrowed=new Set();medals=[];active=[];paused=false;document.body.classList.add('is-postgame');cfg.hideResults();$('postgameReplayReturn')?.setAttribute('hidden','');
  counted=false;cfg.board()?.setScoreMedals([]);running=true;layout();counter();cfg.fit(plan.hidden);sync();if(!plan.steps.length||reduced.matches){skip();$('recountResults').focus({preventScroll:true});return;}beginStep();$('recountPause').focus({preventScroll:true});last=performance.now();frame=requestAnimationFrame(tick);
 }
 async function replay(){remember();stop();cfg.board()?.setScoreMedals([]);mode='replay';cfg.hideResults();$('recountCounter').hidden=true;$('postgameReplayReturn')?.setAttribute('hidden','');sync();try{await cfg.replay();}catch(error){cfg.results();cfg.error(error.message);}}
 return {setup,results,map,reset,start,replay,layout,cameraArea,mode:()=>mode,
  spotlight:()=>mode==='results'||mode==='recount'?{routes:[...lit],completedRoutes:[],activeRoutes:active,stationRoutes:[...borrowed],endpoints:plan?.steps[index]?.label||[],strength:1}:undefined,
  recount:()=>plan&&(mode==='results'||mode==='recount')?{hidden:plan.hidden,visible:shown}:null};
})();
