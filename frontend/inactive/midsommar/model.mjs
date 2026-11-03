import { passengerPerson } from '../../wagon-people.mjs';

// Inactive model. Activation is reserved for a future administrator catalog.
export const MIDSOMMAR_TRAIN = Object.freeze({
  enabled: false, model: 'midsommar-summer', label: 'Midsommar Summer', color: '#ffffff',
  people: Object.freeze({ roof: 8, windows: 10, exterior: 0, door: 4 }),
});
export const MIDSOMMAR_VARIANTS = Object.freeze([
  {id:'picnic',label:'Merienda de verano',description:'Tarta de fresas, una jarra y viajeros compartiendo la merienda.'},
  {id:'plaza',label:'Músicos del sol',description:'Acordeón y violín, acompañados por palmas y conversaciones.'},
  {id:'towers',label:'Coronas de abedul',description:'Un poste vegetal con dos coronas colgantes preside la terraza.'},
  {id:'diagonal',label:'Baile de verano',description:'Una pareja tomada de las manos gira entre los viajeros.'},
  {id:'balcony',label:'Taller de flores',description:'Una corona en elaboración y otra terminada entre cestas de flores.'},
  {id:'gathering',label:'Bienvenida floral',description:'Un arco de hojas y flores recibe saludos y un ramo.'},
].map(Object.freeze));

export const MIDSOMMAR_WHITES=Object.freeze(['#ffffff','#fffdf5','#f6f2e8']);
export const MIDSOMMAR_CLOTH_PALETTE=Object.freeze({
  red:Object.freeze(['#8e3036','#ba3f42','#d36354']),
  blue:Object.freeze(['#26364a','#315a79','#557791']),
  mustard:Object.freeze(['#b48a35','#d5ad50','#e6c36b']),
  dark:Object.freeze(['#252b34','#303341','#424151']),
});
export const MIDSOMMAR_OUTFITS=Object.freeze([
  ['red-bodice','Corpiño rojo'],['blue-bodice','Corpiño azul'],['striped-vest','Chaleco a rayas'],
  ['red-vest','Chaleco rojo'],['blue-vest','Chaleco azul'],['apron','Falda y delantal'],
].map(([id,label])=>Object.freeze({id,label})));
export const MIDSOMMAR_HAIRSTYLES=Object.freeze([
  ['side-part','Raya al lado'],['fringe','Flequillo'],['bob','Melena corta'],['braid','Trenza'],
  ['twin-braids','Dos trenzas'],['bun','Recogido'],['bald','Pelado'],['receding','Calvicie parcial'],
].map(([id,label])=>Object.freeze({id,label})));
const GREEN=['#315943','#4c7450','#6a8c56'],BLUE='#467fa3',YELLOW='#e8c255',WOOD='#d6bb8e';
const IDENTITY=[0,0,0,1];
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,b)=>{const [x,y,z,w]=a,[u,v,t,s]=b;return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];};
const rotate=([x,y,z],[qx,qy,qz,qw])=>{
  const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
};
const yawQ=a=>[0,0,Math.sin(a/2),Math.cos(a/2)];
function vertical(direction){
  const length=Math.hypot(...direction),[x,y,z]=direction.map(n=>n/length);
  if(z<-.999999)return [1,0,0,0];
  const q=[-y,x,0,1+z],norm=Math.hypot(...q);return q.map(n=>n/norm);
}
function variantIndex(variant){
  const index=MIDSOMMAR_VARIANTS.findIndex(v=>v.id===variant);
  if(index<0)throw new RangeError('Unknown Midsommar variant: '+variant);
  return index;
}

// One flat terrace replaces the crowded stepped roof. Bench and shoe supports
// use the very same surface; the body remains the owner's pure white paint.
export const MIDSOMMAR_ROOF=Object.freeze([Object.freeze({length:19.2,width:7.8,bottom:7.4,top:8.15})]);
export function midsommarRoofHeight(x,y){
  return Math.abs(x)<=9.6&&Math.abs(y)<=3.9?8.15:null;
}
function roofSlots(v){
  const xs=[[-6.45,-2.15,2.15,6.45],[-6.6,-2.8,2.8,6.6],[-7,-3.9,3.9,7],
    [-6,-2,2,6],[-6.45,-2.15,2.15,6.45],[-7.1,-3.9,3.9,7.1]][v];
  const slots=[-1,1].flatMap(side=>xs.map((x,col)=>({
    x:x+(v===3?side*.45:0),y:side*(v===5?2:v===4?2.25:2.5),side,col,
    yaw:v===5?(col%2?Math.PI/2:-Math.PI/2):v===4?(side>0?0:Math.PI):(side>0?Math.PI:0),
  })));
  if(v===0){slots[1].activity='serve';slots[6].activity='cup';slots[3].activity='hat';}
  if(v===1){
    Object.assign(slots[5],{x:-2.5,y:1.15,yaw:0,activity:'accordion'});
    Object.assign(slots[6],{x:2.6,y:1.15,yaw:0,activity:'violin'});
    slots[1].activity='clap';slots[3].activity='clap';
  }
  if(v===2){slots[1].headYaw=-.65;slots[6].headYaw=-.65;slots[1].headTilt=.16;slots[6].headTilt=.16;}
  if(v===3)return [
    {x:-6.7,y:-2.4,yaw:0},{x:-3.8,y:-2.4,yaw:.25,activity:'clap'},
    {x:6.7,y:-2.4,yaw:0},{x:-6.7,y:2.4,yaw:Math.PI},
    {x:3.8,y:2.4,yaw:Math.PI+.25,activity:'clap'},{x:6.7,y:2.4,yaw:Math.PI},
    {x:-1.5,y:0,yaw:-Math.PI/2,stance:'standing',activity:'dance',outfit:'blue-vest',pitch:.12},
    {x:1.5,y:0,yaw:Math.PI/2,stance:'standing',activity:'dance',outfit:'red-bodice',pitch:.12},
  ].map((s,col)=>({side:s.y<0?-1:1,col,...s}));
  if(v===4){
    for(const slot of slots){slot.y=slot.side*2.5;slot.yaw=slot.side>0?Math.PI:0;}
    Object.assign(slots[5],{x:-2.15,y:.45,yaw:0,activity:'weave',headTilt:-.2});
    Object.assign(slots[6],{x:2.15,y:.45,yaw:0,activity:'present-wreath'});
  }
  if(v===5)return [
    ...[-1,1].flatMap(side=>[-6.5,-2.8,.9].map((x,col)=>({x,y:side*2.45,side,col,yaw:side>0?Math.PI:0}))),
    {x:6.4,y:-1.25,side:-1,col:3,yaw:-Math.PI/2,stance:'standing',activity:'welcome'},
    {x:6.4,y:1.25,side:1,col:3,yaw:-Math.PI/2,stance:'standing',activity:'bouquet'},
  ];
  return slots;
}

export function midsommarPeople(variant=MIDSOMMAR_VARIANTS[0].id){
  const v=variantIndex(variant),people=[];
  function person(zone,origin,yaw,pose,scale,extra={}){
    const id=people.length,base=passengerPerson(v*97+id*3+11,zone==='roof'?1:-1,id);
    const outfit=extra.outfit??MIDSOMMAR_OUTFITS[(id*5+v)%6].id;
    const skirt=['red-bodice','blue-bodice','apron'].includes(outfit);
    const family=outfit==='blue-bodice'||outfit==='blue-vest'?'blue':'red';
    const white=MIDSOMMAR_WHITES[(id+v)%3],accent=MIDSOMMAR_CLOTH_PALETTE[family][1];
    const hairOptions=skirt?['braid','bun','twin-braids','bob']:['side-part','bald','fringe','receding'];
    const hairstyle=hairOptions[(Math.floor(id/2)+v)%hairOptions.length];
    const cover=skirt?((id+v)%4===0?'flowers':(id+v)%3===0?null:'kerchief'):
      ((id+v)%3===0?null:(id+v)%5===0?'red-cap':'felt-hat');
    people.push({...base,id,zone,origin,yaw,pose,scale,outfit,skirt,family,white,
      clothes:white,trousers:MIDSOMMAR_CLOTH_PALETTE.mustard[1],accent,trim:MIDSOMMAR_CLOTH_PALETTE.red[0],
      skirtColor:MIDSOMMAR_CLOTH_PALETTE.dark[(id+v)%3],stockings:(id+v)%3===0?'#303746':white,
      shoes:'#252b2d',hairstyle,cover,coverColor:skirt&&id%3===0?'#344563':white,
      beard:!skirt&&(id+v)%3===0?'short':'none',lean:(id%3-1)*.045,pitch:.045,...extra});
  }
  for(const {x,y,side,col,yaw,stance='seated',activity,...extra} of roofSlots(v)){
    const scale=.93+(col+v)%2*.025;
    person('roof',[x,y,stance==='standing'?8.24+1.65*scale:9.25],yaw+(activity?0:(col%2?-.06:.06)*(v%2?1:-1)),
      activity==='welcome'?'wave':['sit','talk','wave','sit'][(col+v+(side>0?1:0))%4],scale,
      {stance,side,activity,...(stance==='seated'?{seat:[x,y,9.05]}:{}),...extra});
  }
  for(const side of [-1,1])for(let col=0;col<5;col++){
    person('windows',[(col-2)*3.2,side*3.53,4.67],side>0?0:Math.PI,
      (col+v+(side>0?1:0))%4===0?'wave':'rest',.87,
      {stance:'window',side,window:col,lean:(col%2?-.06:.06)});
  }
  for(const end of [-1,1])for(const side of [-1,1]){
    person('door',[end*9.8,side*1.85,4.53],-end*Math.PI/2,
      (v+(side>0?1:0))%2?'wave':'stand',.9,{stance:'standing',end,side,pitch:0,lean:0});
  }
  return people;
}

export function midsommarHeadParts(p){
  const parts=[],put=(shape,xyz,size,color,role,rotation=IDENTITY)=>parts.push({shape,xyz,size,color,role,rotation});
  put('person-head',[0,0,0],[1.38,1.38,1.38],p.skin,'head');
  if(p.hairstyle!=='bald')put('ext-hair-'+p.hairstyle,[0,0,0],[1.38,1.38,1.38],p.hair,'hair');
  if(p.beard!=='none')put('ext-beard-'+p.beard,[0,0,0],[1.38,1.38,1.38],p.hair,'beard');
  if(p.cover==='kerchief'){
    put('mid-kerchief',[0,-.03,.04],[1.53,1.53,1.53],p.coverColor,'cover');
    for(const side of [-1,1])put('ext-ribbon',[side*.18,-.6,-.56],[.3,.16,.7],p.coverColor,'scarf-tail',yawQ(side*.35));
  }else if(p.cover==='felt-hat'){
    put('ext-sunhat',[0,0,.69],[1.95,1.82,.8],'#2c3438','cover');
    put('ext-headband',[0,0,.68],[1.12,1.12,.14],p.accent,'hat-band');
  }else if(p.cover==='red-cap')put('ext-cap',[0,0,.55],[1.48,1.4,.71],'#b13c3d','cover');
  else if(p.cover==='flowers'){
    put('ext-headband',[0,0,.25],[1.52,1.52,.17],GREEN[1],'flower-crown');
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5;
      put('ext-flower',[Math.sin(a)*.73,Math.cos(a)*.73,.3],[.36,.12,.36],i%2?p.white:'#e8c255','flower',yawQ(-a));
    }
  }
  return parts;
}

export function midsommarBodyParts(passengerParts){
  return passengerParts.filter(p=>!['roof','coach-roof-seams','coach-vent'].includes(p.shape)&&
    !p.shape.startsWith('coach-curtain-')&&!(p.shape==='coach-end-panels'&&p.material==='glass'))
    .map(p=>{
      if(p.shape==='coach-steps')return {...p,size:[21,7.9,.7],color:WOOD,material:'cargo'};
      if(p.shape.startsWith('coach-belt'))return {...p,color:'#91a78c'};
      if(p.shape==='coach-door-frames'||p.shape==='coach-window-frames')return {...p,color:'#ede7d5'};
      if(p.shape==='coach-end-panels')return {...p,color:'#c5d0bd',material:'cargo'};
      if(p.shape==='box'&&Math.abs(p.xyz[1])===3.74)return {...p,color:'#233e44',material:'cargo'};
      return p;
    }).concat(MIDSOMMAR_ROOF.map(t=>({shape:'round',xyz:[0,0,(t.top+t.bottom)/2],size:[t.length,t.width,t.top-t.bottom],color:'paint',material:'paint',role:'roof-terrace'})));
}

function festivalTools(put,high,v=0){
  function beam(a,b,width,color,role){
    const d=b.map((n,i)=>n-a[i]);put('ext-limb',a.map((n,i)=>(n+b[i])/2),[width,width,Math.hypot(...d)],color,role,vertical(d));
  }
  function flower(xyz,size,color,rotation=IDENTITY){
    put('ext-flower',xyz,[size,size*.19,size],color,'flower',rotation);
    put('ext-sphere',add(xyz,rotate([0,size*.1,0],rotation)),[size*.23,size*.15,size*.23],YELLOW,'flower-center');
  }
  function ribbon(xyz,rotation=IDENTITY){
    for(const side of [-1,1]){
      put('ext-ribbon',add(xyz,rotate([side*.18,0,-.43],rotation)),[.22,.12,1.1],side<0?BLUE:YELLOW,'ribbon',mul(rotation,yawQ(side*.18)));
      put('mid-leaf',add(xyz,rotate([side*.26,0,.05],rotation)),[.7,.13,.29],side<0?BLUE:YELLOW,'bow',mul(rotation,yawQ(side*.6)));
    }
  }
  function wreath(center,radius,rotation=IDENTITY,role='wreath',ties=true){
    put('mid-wreath',center,[radius*2,.18,radius*2],GREEN[0],role,rotation);
    for(let i=0;i<14;i++){
      const a=i*Math.PI*2/14,local=[Math.sin(a)*radius,0,Math.cos(a)*radius];
      put('mid-leaf',add(center,rotate(local,rotation)),[radius*.7,.16,radius*.32],GREEN[i%3],role+'-leaf',mul(rotation,[0,Math.sin(a/2),0,Math.cos(a/2)]));
      if(i%3===v%3)flower(add(center,rotate([local[0],.16,local[2]],rotation)),Math.min(.4,radius*.48),i%2?'#fffdf3':BLUE,rotation);
    }
    if(ties)ribbon(add(center,rotate([0,.2,-radius],rotation)),rotation);
  }
  function basket(x,y,z){
    put('ext-robe',[x,y,z+.25],[.94,.85,.5],'#b89565','basket');
    for(let i=0;i<5;i++){
      const a=i*Math.PI*2/5,fx=x+Math.cos(a)*.32,fy=y+Math.sin(a)*.22;
      beam([fx,fy,z+.35],[fx,fy,z+.7],.07,GREEN[1],'stem');
      flower([fx,fy,z+.75],.37,i%3?'#fffdf3':BLUE,[Math.SQRT1_2,0,0,Math.SQRT1_2]);
    }
  }
  function mug(center,scale=1){
    put('mid-vessel',center,[.52*scale,.52*scale,.6*scale],'#fffaf0','cup');
    put('mid-wreath',add(center,[.32*scale,0,0]),[.32*scale,.11*scale,.38*scale],BLUE,'cup-handle');
    put('ext-band',add(center,[0,0,.13*scale]),[.4*scale,.4*scale,.035*scale],'#664738','drink');
    if(high)flower(add(center,[0,.27*scale,0]),.15*scale,BLUE);
  }
  function bouquet(center,scale=1){
    const flowers=high?7:5;
    for(let i=0;i<flowers;i++){
      const a=i*Math.PI*2/flowers,tip=add(center,[Math.cos(a)*.4*scale,Math.sin(a)*.26*scale,.68*scale+(i%2)*.16*scale]);
      beam(add(center,[0,0,-.12*scale]),tip,.055*scale,GREEN[i%3],'bouquet-stem');
      put('mid-leaf',add(center,[Math.cos(a)*.18*scale,Math.sin(a)*.12*scale,.25*scale]),[.48*scale,.12*scale,.24*scale],GREEN[1],'bouquet-leaf',yawQ(a));
      flower(tip,.4*scale,i%3===0?BLUE:i%3===1?YELLOW:'#fffdf3');
    }
    put('ext-band',center,[.3*scale,.28*scale,.16*scale],BLUE,'bouquet-tie');
  }
  return {beam,flower,ribbon,wreath,basket,mug,bouquet};
}

// Scenery is baked with its variant so leaves, ribbons and passengers share one
// instanced draw, destination fading and construction animation. No extra state.
export function midsommarDecorations(variant,detail='high'){
  const v=variantIndex(variant),parts=[],high=detail==='high';
  function put(shape,xyz,size,color,role,rotation=IDENTITY){parts.push({shape,xyz,size,color,rotation,role,decoration:true});}
  const {beam,flower,ribbon,wreath,basket,mug,bouquet}=festivalTools(put,high,v);
  // Pale timber is an inset on the white roof, with open air around the seats.
  put('ext-box',[0,0,8.18],[17.8,6.55,.1],'#e5d7bb','deck');
  if(high)for(const y of [-2.5,-1.25,0,1.25,2.5])put('ext-box',[0,y,8.24],[17.65,.035,.02],'#cdbb9a','deck-seam');
  for(const {x,y,yaw} of roofSlots(v).filter(s=>s.stance!=='standing')){
    const rotation=yawQ(yaw),origin=[x,y,8.94];
    put('ext-box',origin,[2.5,1.04,.22],WOOD,'bench-seat',rotation);
    put('ext-box',add(origin,rotate([0,-.56,.49],rotation)),[2.5,.16,.67],v%2?'#bdcbb3':WOOD,'bench-back',rotation);
    for(const dx of [-.91,.91])put('ext-box',add(origin,rotate([dx,0,-.37],rotation)),[.16,.65,.72],'#a78d67','bench-leg',rotation);
  }
  for(const side of [-1,1]){
    beam([-9.05,side*3.68,9.72],[9.05,side*3.68,9.72],.16,'#f6f4e8','railing');
    for(const x of [-9,-4.5,0,4.5,9])beam([x,side*3.68,8.13],[x,side*3.68,9.72],.14,'#f6f4e8','railing');
    // Four leafy festoons per flank, hung above the windows (never across faces).
    for(let span=0;span<4;span++){
      const x0=-9+span*4.5,steps=high?13:8;
      let previous;
      for(let i=0;i<=steps;i++){
        const t=i/steps,x=x0+t*4.5,z=9.65-(.78+(v%3)*.09)*Math.sin(t*Math.PI),at=[x,side*3.85,z];
        if(previous)beam(previous,at,.13,GREEN[0],'garland-stem');previous=at;
        put('mid-leaf',at,[.78,.22,.36],GREEN[(i+span+v)%3],'garland-leaf',yawQ(side*(i%2?.35:-.35)));
        if(i===Math.round(steps/2)||high&&i===3)flower([x,side*4.01,z],.47,(span+v)%3===0?BLUE:(span+v)%3===1?YELLOW:'#fffdf3',yawQ(side>0?0:Math.PI));
      }
      if((span+v)%2===0)ribbon([x0,side*3.98,9.66],yawQ(side>0?0:Math.PI));
    }
    // Quiet painted folk panels leave most of the carriage white.
    for(const x of [-4.8,4.8]){
      put('ext-box',[x,side*3.76,3.55],[2.1,.08,.73],'#edf0e2','painted-panel');
      flower([x,side*3.83,3.55],.45,v%2?BLUE:'#bd4942',yawQ(side>0?0:Math.PI));
      for(const dx of [-.62,.62])put('mid-leaf',[x+dx,side*3.83,3.55],[.6,.08,.2],GREEN[1],'painted-leaf');
    }
    // Window-side greenery frames alternating outer jambs, not the openings.
    for(const col of (v%2?[-1,1]:[-2,0,2])){
      const x=col*3.2+1.24;
      for(const z of [5.12,5.64,6.17])put('mid-leaf',[x,side*3.94,z],[.32,.15,.64],GREEN[1],'window-leaf',yawQ(.2));
    }
  }
  for(const end of [-1,1]){
    // Low vestibule rails leave room for two travellers, their feet on the steps.
    for(const y of [-3.65,0,3.65])beam([end*10.48,y,3.04],[end*10.48,y,4.65],.13,'#f4f0e3','platform-rail');
    beam([end*10.48,-3.65,4.65],[end*10.48,3.65,4.65],.15,'#f4f0e3','platform-rail');
    wreath([end*9.4,0,6.7],.88,yawQ(-end*Math.PI/2));
    beam([end*9.06,-3.68,9.72],[end*9.06,3.68,9.72],.16,'#f6f4e8','railing');
  }
  function table(x,y,length,width){
    for(const dx of [-length*.35,length*.35])for(const dy of [-width*.32,width*.32])
      put('ext-box',[x+dx,y+dy,8.85],[.16,.16,1.22],WOOD,'table-leg');
    put('ext-box',[x,y,9.48],[length,width,.18],WOOD,'table');
    put('ext-box',[x,y,9.59],[length-.04,width-.02,.045],'#fffdf5','tablecloth');
    for(const side of [-1,1]){
      put('ext-panel',[x,y+side*(width/2-.02),9.3],[length*.9,.08,.58],'#fffdf5','tablecloth-fall');
      put('ext-box',[x,y+side*(width/2+.03),9.09],[length*.88,.035,.12],BLUE,'tablecloth-trim');
    }
  }
  function leafyPath(points,role){
    points.forEach((at,i)=>{
      if(i)beam(points[i-1],at,.17,GREEN[0],role);
      const angle=i*2.4;
      put('mid-leaf',at,[.72,.3,.42],GREEN[i%3],role+'-leaf',yawQ(angle));
      if(i%4===0)flower(add(at,[0,.2,0]),.38,i%8?BLUE:'#fffdf3');
    });
  }
  if(v===0){
    table(0,0,4.8,1.75);
    // A generous white cake, layers, piped cream and recognisable red berries.
    put('ext-band',[-.45,0,9.68],[1.9,1.6,.12],BLUE,'cake-plate');
    put('ext-band',[-.45,0,9.99],[1.58,1.45,.51],'#fff9e9','cake');
    put('ext-band',[-.45,0,9.89],[1.6,1.47,.08],'#d6746e','cake-layer');
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4,x=-.45+Math.cos(a)*.55,y=Math.sin(a)*.47;
      put('ext-sphere',[x,y,10.28],[.31,.29,.23],'#fffdf5','cream');
      put('mid-berry',[x,y,10.46],[.22,.2,.29],'#ba4246','strawberry');
      put('mid-leaf',[x,y,10.59],[.17,.12,.05],GREEN[1],'berry-leaf');
    }
    mug([1.57,-.16,9.99],1.25);
    put('ext-panel',[1.57,.19,10.26],[.23,.32,.18],'#fffdf5','pitcher-spout');
    for(const x of [-1.8,.85])put('ext-band',[x,-.41,9.66],[.63,.57,.055],'#f7f5e9','plate');
    if(high)for(const x of [-1.8,.85])beam([x+.39,-.65,9.66],[x+.39,-.24,9.66],.035,'#8a9998','cutlery');
  }else if(v===1){
    // The instruments are carried by their players below; a case and flowers
    // turn the otherwise empty floor into a small informal concert.
    put('ext-panel',[0,-.15,8.39],[2.3,.78,.29],'#5f4b3e','instrument-case');
    put('ext-panel',[0,-.15,8.5],[2.02,.6,.06],'#c9a988','case-lining');
    basket(-8.2,0,8.24);basket(8.2,0,8.24);
  }else if(v===2){
    // One leafy pole with TWO open hanging rings. The crossbar follows X so
    // both holes remain visible in the game's side view of the train.
    put('ext-box',[0,0,8.36],[1.25,1.1,.24],WOOD,'maypole-base');
    beam([0,0,8.35],[0,0,14.1],.23,WOOD,'maypole');
    for(const side of [-1,1]){
      beam([side*.52,0,8.48],[0,0,9.2],.15,WOOD,'maypole-brace');
      beam([0,side*.45,8.48],[0,0,9.15],.15,WOOD,'maypole-brace');
    }
    leafyPath(Array.from({length:21},(_,i)=>[Math.sin(i*2.1)*.13,Math.cos(i*2.1)*.13,9+i*.25]),'maypole-foliage');
    leafyPath(Array.from({length:17},(_,i)=>[-2.65+i*5.3/16,0,13.55]),'maypole-crossbar');
    for(const side of [-1,1]){
      beam([side*1.78,0,13.55],[side*1.78,0,12.98],.085,'#e7d0a0','maypole-hanger');
      wreath([side*1.78,0,11.96],1.02,IDENTITY,'maypole-ring');
      ribbon([side*2.6,.1,13.55]);
    }
    flower([0,.2,14.12],.63,'#fffdf3');
    basket(-8.25,0,8.24);basket(8.25,0,8.24);
  }else if(v===3){
    // A clear dance floor, with narrow blue/yellow inlays rather than objects
    // under the couple's feet. No benches beneath standing dancers.
    put('ext-box',[0,0,8.242],[5.5,4.2,.014],'#eee0bf','dance-floor');
    for(const side of [-1,1])put('ext-box',[0,side*2.05,8.255],[5.5,.11,.012],side<0?BLUE:YELLOW,'dance-floor-trim');
    for(const x of [-8.2,8.2])basket(x,0,8.24);
    for(const side of [-1,1])for(const x of [-4.5,4.5])ribbon([x,side*3.95,9.66],yawQ(side>0?0:Math.PI));
  }else if(v===4){
    table(0,2.22,5.4,1.45);
    basket(-.95,2.25,9.62);basket(.6,2.4,9.62);
    wreath([1.85,2.3,9.7],.48,[Math.SQRT1_2,0,0,Math.SQRT1_2],'table-wreath',false);
    for(let i=0;i<6;i++){
      const x=-2.1+i*.16;
      beam([x,2.25,9.65],[x+.2,1.76,9.67],.035,GREEN[1],'loose-stem');
      flower([x+.2,1.76,9.72],.22,i%2?YELLOW:'#fffdf3',[Math.SQRT1_2,0,0,Math.SQRT1_2]);
    }
    if(high){
      put('ext-band',[.2,1.94,9.73],[.35,.35,.22],BLUE,'ribbon-spool');
      put('ext-ribbon',[.2,1.57,9.67],[.13,.8,.03],BLUE,'ribbon-offcut');
    }
    for(const x of [-8.2,8.2])basket(x,0,8.24);
  }else{
    // An open arch in the Y/Z plane shelters two standing greeters. Leafy
    // columns are outside their shoulders and the crown clears their hats.
    const x=6.5,radius=2.8;
    for(const side of [-1,1]){
      put('ext-box',[x,side*radius,8.36],[.75,.65,.24],WOOD,'arch-base');
      leafyPath(Array.from({length:9},(_,i)=>[x,side*radius,8.45+i*.26]),'arch-column');
      ribbon([x+.18,side*radius,10.2],yawQ(-Math.PI/2));
    }
    leafyPath(Array.from({length:25},(_,i)=>{const a=i*Math.PI/24;return [x,Math.cos(a)*radius,10.53+Math.sin(a)*radius];}),'arch-crown');
    for(let i=0;i<7;i++){
      const a=.15+i*(Math.PI-.3)/6;
      flower([x+.22,Math.cos(a)*radius,10.53+Math.sin(a)*radius],.62,i%3===0?YELLOW:'#fffdf3',yawQ(-Math.PI/2));
    }
    ribbon([x+.24,0,13.3],yawQ(-Math.PI/2));
    basket(-8.3,0,8.24);
  }
  return parts;
}

export function midsommarCrowdParts({variant=MIDSOMMAR_VARIANTS[0].id,detail='high',people=midsommarPeople(variant)}={}){
  if(!['high','low'].includes(detail))throw new RangeError('Unknown detail: '+detail);
  const parts=midsommarDecorations(variant,detail),high=detail==='high';
  for(const p of people){
    const turn=yawQ(p.yaw),s=p.scale,window=p.stance==='window',seated=p.stance==='seated';
    const bodyQ=vertical([p.lean,window?.24:p.pitch,1]),point=v=>rotate(v,bodyQ);
    function part(shape,xyz,size,color,rotation=IDENTITY,role){
      parts.push({shape,xyz:add(rotate(xyz.map(n=>n*s),turn),p.origin),size:size.map(n=>n*s),color,
        material:'person',rotation:mul(turn,rotation),person:p.id,zone:p.zone,role});
    }
    function limb(a,b,width,color,shape='ext-limb',role){
      const d=b.map((n,i)=>n-a[i]);part(shape,a.map((n,i)=>(n+b[i])/2),[width,width,Math.hypot(...d)+width*.12],color,vertical(d),role);
    }
    const prop=(shape,xyz,size,color,role,rotation=IDENTITY)=>part(shape,xyz,size,color,rotation,role);
    const {beam,flower,wreath,mug,bouquet}=festivalTools(prop,high,variantIndex(variant));
    const height=window?1.18:1.47;
    part('ext-blouse',point([0,0,height/2]),[1.34,.88,height],p.white,bodyQ,'blouse');
    // Fitted sleeveless bodice/waistcoat contrasts with the full white sleeves.
    part('mid-waistcoat',point([0,0,height*.43]),[1.7,1.18,height*.87],p.accent,bodyQ,'waistcoat');
    part('ext-ribbon',point([0,.56,height*.45]),[p.skirt?.1:.21,.07,height*.8],p.white,bodyQ,'shirt-front');
    if(p.outfit==='striped-vest')for(const x of [-.54,-.28,.28,.54]){
      part('ext-ribbon',point([x,.51,height*.43]),[.08,.085,height*.76],'#f2dbac',bodyQ,'vest-stripe');
      part('ext-ribbon',point([x,-.5,height*.43]),[.08,.085,height*.76],'#f2dbac',bodyQ,'vest-stripe');
    }
    part('ext-band',point([0,0,.07]),[1.62,1.09,.17],p.skirt?p.trim:'#755e40',bodyQ,'waistband');
    for(const side of [-1,1])part('ext-panel',point([side*.2,.3,height-.08]),[.38,.24,.31],p.white,bodyQ,'collar');
    if(high){
      for(const z of [.3,.58,.86])part('ext-sphere',point([.13,.58,z]),[.075,.07,.075],'#d9ba78',bodyQ,'button');
      if(p.skirt)for(const z of [.35,.65])for(const side of [-1,1])part('ext-ribbon',point([side*.13,.6,z]),[.26,.055,.055],'#e7d0a2',mul(bodyQ,yawQ(side*.4)),'lacing');
    }
    const head=point([0,0,height+.45]);
    const headQ=mul(yawQ(p.headYaw??(p.pose==='talk'?.2:0)),[Math.sin((p.headTilt??0)/2),0,0,Math.cos((p.headTilt??0)/2)]);
    for(const h of midsommarHeadParts(p))part(h.shape,add(head,rotate(h.xyz,headQ)),h.size,h.color,mul(headQ,h.rotation),h.role);
    if(!window){
      if(p.skirt){
        if(seated){
          part('mid-seated-skirt',[0,0,0],[1,1,1],p.skirtColor,IDENTITY,'skirt');
          part('mid-seated-skirt-hem',[0,0,0],[1.01,1.01,1],p.trim,IDENTITY,'skirt-hem');
          if(p.outfit==='apron')part('mid-seated-apron',[0,.04,.02],[1,1,1],p.white,IDENTITY,'apron');
        }else if(p.activity==='dance'){
          part('mid-dancing-skirt',[0,0,-.76],[2.75,2.05,1.66],p.skirtColor,yawQ(.18),'skirt');
          part('mid-dancing-skirt-hem',[0,0,-.76],[2.77,2.07,1.66],p.trim,yawQ(.18),'skirt-hem');
        }else{
          part('mid-skirt',[0,0,-.8],[2.15,1.48,1.8],p.skirtColor,IDENTITY,'skirt');
          part('mid-skirt-hem',[0,0,-.8],[2.17,1.5,1.8],p.trim,IDENTITY,'skirt-hem');
          if(p.outfit==='apron')part('ext-panel',[0,.67,-.73],[1.12,.14,1.4],p.white,IDENTITY,'apron');
        }
      }
      for(const side of [-1,1]){
        const hip=[side*.38,0,-.08],knee=seated?[side*.48,.91,-.12]:[side*.39,.05,-.79];
        const ankle=seated?[side*.5,1.12,-1.0]:[side*.43,.11,-1.4];
        if(p.activity==='dance'){
          knee[0]=side*.57;knee[1]=side>0?.34:-.15;
          ankle[0]=side*.68;ankle[1]=side>0?.43:-.25;
        }
        const support=p.zone==='roof'?8.24:3.05;
        ankle[2]=(support-p.origin[2])/s+.25;
        if(!p.skirt){
          limb(hip,knee,.81,p.trousers,'ext-trouser','breeches');
          const hem=knee.map((n,i)=>n+(ankle[i]-n)*.23);
          limb(knee,hem,.66,p.trousers,'ext-trouser','breeches');
          limb(hem,ankle,.36,p.stockings,'ext-limb','stocking');
          if(high)part('ext-ribbon',[side*.68,knee[1],knee[2]],[.12,.12,.38],p.trim,IDENTITY,'knee-ribbon');
        }else limb(knee,ankle,.32,p.stockings,'ext-limb','stocking');
        part('ext-shoe',add(ankle,[0,.14,-.09]),[.48,.71,.32],p.shoes,IDENTITY,'shoe');
        if(high)part('ext-box',add(ankle,[0,.27,.015]),[.2,.14,.065],'#c3b28b',IDENTITY,'shoe-buckle');
      }
    }
    for(const side of [-1,1]){
      const shoulder=point([side*.57,0,height*.8]);
      let elbow=[side*.85,.42,.64],hand=[side*.5,.91,.05];
      if(window){elbow=[side*.85,.59,.57];hand=[side*.65,.84,.09];}
      if(p.zone==='door'){elbow=[side*.85,.3,.62];hand=[side*.65,.59,.12];}
      if(p.pose==='stand'){elbow=[side*.83,.08,.68];hand=[side*.76,.12,-.02];}
      if(p.pose==='wave'&&side===1){elbow=[.95,.16,1.35];hand=[1.09,.1,2.27];}
      if(p.pose==='talk'&&side===-1){elbow=[-.94,.38,.87];hand=[-1.07,.67,1.14];}
      if(p.activity==='accordion'){elbow=[side*1.02,.47,.73];hand=[side*.93,.91,.82];}
      if(p.activity==='violin'){
        elbow=side<0?[-.98,.5,1.0]:[1.04,.65,.55];
        hand=side<0?[-1.05,1.0,1.34]:[.68,1.21,.85];
      }
      if(p.activity==='serve'){elbow=[side*.91,.87,.58];hand=[side*.49,1.68,.42];}
      if(p.activity==='cup'&&side===1){elbow=[.94,.46,.93];hand=[.6,.82,1.27];}
      if(p.activity==='weave'){elbow=[side*.88,.64,.66];hand=[side*.5,1.27,.42];}
      if(p.activity==='present-wreath'){elbow=[side*.97,.66,1.05];hand=[side*.68,1.09,1.24];}
      if(p.activity==='clap'){elbow=[side*.92,.53,1.08];hand=[side*.14,.97,1.35];}
      if(p.activity==='bouquet'){elbow=[side*.79,.38,.73];hand=[side*.2,.86,.73];}
      if(p.activity==='hat'&&side===1){elbow=[1.04,.04,1.66];hand=[.61,.02,2.52];}
      if(p.activity==='dance'){
        // Both partners share the same two world-space handholds. Arm lengths
        // follow that contact, not a visually close pair of unrelated gestures.
        const y=side*(p.origin[0]<0?-1:1)*.64,target=[0,y,10.91+(y>0?.1:0)];
        hand=rotate(target.map((n,i)=>(n-p.origin[i])/s),yawQ(-p.yaw));
        elbow=[side*.98,.78,1.03];
      }
      // Rounded puff sleeves taper to narrow white cuffs; hands stay separate.
      limb(shoulder,elbow,.79,p.white,'mid-puff-sleeve','sleeve');
      const cuff=elbow.map((n,i)=>n+(hand[i]-n)*.82);
      limb(elbow,cuff,.61,p.white,'mid-puff-sleeve','sleeve');
      limb(cuff,hand,.26,p.white,'ext-limb','cuff');
      part('ext-sphere',hand,[.32,.29,.33],p.skin,IDENTITY,'hand');
    }
    if(p.activity==='accordion'){
      prop('mid-bellows',[0,.92,.82],[1.24,.72,1.1],'#953f42','accordion-bellows');
      for(const side of [-1,1]){
        prop('ext-box',[side*.77,.92,.82],[.34,.84,1.23],'#314959','accordion-case');
        for(const z of [.28,1.36])prop('ext-box',[side*.77,1.35,z],[.32,.055,.055],'#cba96c','accordion-trim');
        beam([side*.47,.24,1.38],[side*.63,.62,.41],.08,'#76593f','instrument-strap');
      }
      const keys=high?9:6;
      for(let i=0;i<keys;i++){
        const z=.32+i*.99/(keys-1);
        prop('ext-box',[.78,1.36,z],[.27,.08,.99/keys-.012],'#fffaf0','accordion-key');
        if(i%3!==2)prop('ext-box',[.69,1.41,z+.035],[.12,.055,.045],'#263136','accordion-black-key');
      }
      for(let i=0;i<(high?6:3);i++)prop('ext-sphere',[-.77+(i%2)*.1-.05,1.37,.47+Math.floor(i/2)*.26],[.07,.055,.07],'#f2e1b9','accordion-button');
      if(high)for(let i=0;i<10;i++)prop('ext-box',[-.56+i*.124,1.29,.82],[.025,.04,1.05],'#d09b70','bellows-rib');
    }else if(p.activity==='violin'){
      prop('mid-violin',[-.02,1.04,1.28],[1.12,.3,.68],'#b36d36','violin-body');
      prop('mid-violin',[-.02,1.215,1.28],[1.06,.03,.62],'#dca464','violin-top');
      beam([-.53,1.04,1.3],[-1.42,1.04,1.38],.13,'#946039','violin-neck');
      prop('ext-box',[-.75,1.235,1.32],[1.26,.065,.11],'#293436','fingerboard');
      prop('ext-sphere',[-1.47,1.04,1.4],[.22,.21,.26],'#a26436','violin-scroll');
      for(const z of [1.11,1.46])prop('ext-ribbon',[.18,1.24,z],[.22,.025,.055],'#4b382b','violin-soundhole',yawQ(.25));
      for(const z of (high?[1.285,1.315,1.345]:[1.32]))beam([-1.25,1.28,z],[.32,1.28,z],high?.012:.025,'#dfcfab','violin-string');
      prop('ext-box',[.31,1.25,1.32],[.055,.1,.27],'#f0d7a2','violin-bridge');
      beam([.8,1.22,.69],[-.22,1.22,2.03],.065,'#654b32','violin-bow');
      beam([.76,1.27,.7],[-.26,1.27,2.02],.022,'#f3e8c8','bow-hair');
      if(high)for(const x of [-1.32,-1.46])beam([x,.92,1.38],[x,1.16,1.38],.055,'#354045','tuning-peg');
    }else if(p.activity==='serve'){
      prop('ext-band',[0,1.68,.49],[1.18,.92,.09],'#fffdf3','held-plate');
      prop('ext-box',[0,1.68,.65],[.62,.43,.22],'#fff6dc','cake-slice');
      prop('ext-box',[0,1.68,.59],[.63,.44,.045],'#d7837b','slice-layer');
      prop('mid-berry',[0,1.68,.85],[.19,.18,.22],'#bd454a','held-strawberry');
    }else if(p.activity==='cup')mug([.35,.88,1.28],.82);
    else if(p.activity==='weave'){
      wreath([0,1.27,.44],.48,[Math.SQRT1_2,0,0,Math.SQRT1_2],'woven-crown',false);
      beam([.4,1.27,.5],[.7,1.47,.62],.04,GREEN[1],'woven-stem');
      flower([.7,1.47,.65],.3,'#fffdf3');
    }else if(p.activity==='present-wreath')wreath([0,1.1,1.24],.66,IDENTITY,'held-crown',false);
    else if(p.activity==='bouquet')bouquet([0,.87,.73],1);
  }
  return parts;
}

export const MIDSOMMAR_TRANSLATIONS = Object.freeze({
  "Merienda de verano": "Summer picnic",
  "Músicos del sol": "Sunshine musicians",
  "Coronas de abedul": "Birch wreaths",
  "Baile de verano": "Summer dance",
  "Taller de flores": "Flower workshop",
  "Bienvenida floral": "Floral welcome"
});
