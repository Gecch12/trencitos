import { wagonParts, passengerPerson, wagonRouteAppearances, PASSENGER_VARIANTS } from './wagon-models.mjs';

// This study is intentionally absent from the game catalogue and saved state.
export const PASSENGER_EXTREME = Object.freeze({
  model: 'passenger-extreme', label: 'Hippie Train', color: '#ffffff',
  people: Object.freeze({ roof: 60, windows: 16, exterior: 8, door: 6 }),
});
export const EXTREME_VARIANTS = Object.freeze([
  {id:'picnic', label:'Sobremesa', description:'Grupos sentados, conversaciones y saludos en los extremos.'},
  {id:'plaza', label:'Plaza llena', description:'Un núcleo de pie y viajeros sentados alrededor.'},
  {id:'towers', label:'Dos multitudes', description:'Los extremos se elevan; el centro viaja sentado.'},
  {id:'diagonal', label:'Ola de viajeros', description:'Alturas escalonadas y gestos cruzados en diagonal.'},
  {id:'balcony', label:'Todos a mirar', description:'Una silueta asimétrica con grupos girados hacia un lado.'},
  {id:'gathering', label:'Encuentros', description:'Pequeños corrillos, rodillas dobladas y brazos en movimiento.'},
].map(Object.freeze));

export const EXTREME_HAIRSTYLES=Object.freeze([
  ['center-part','Raya al medio'],['waves','Melena larga ondulada'],['twin-braids','Dos trenzas'],
  ['half-up','Semirrecogido'],['bob','Melena a los hombros'],['long','Melena suelta'],
  ['ponytail','Coleta larga'],['braid','Trenza larga'],['bun','Moño desenfadado'],
  ['curls','Melena rizada'],['bald','Pelado'],['receding','Calvicie parcial'],
].map(([id,label])=>Object.freeze({id,label})));
export const HIPPIE_LONG_HAIR=Object.freeze(['center-part','waves','twin-braids','half-up','long','ponytail','braid','curls']);
export const HIPPIE_WHITES=Object.freeze(['#fffdf7','#f6f1e5','#eee9df','#ffffff']);
export const HIPPIE_OUTFITS=Object.freeze([
  ['linen','Camisa de lino'],['open-shirt','Sobrecamisa abierta'],['poncho','Poncho'],
  ['tunic','Túnica holgada'],['vest','Chaleco'],['kaftan','Caftán'],
  ['blouse','Blusa amplia'],['summer','Verano'],['shawl','Chal y camisa'],
  ['overalls','Peto ancho'],['kurta','Camisa larga'],['sunhat','Sombrero y lino'],
].map(([id,label])=>Object.freeze({id,label})));

// One pastel wardrobe for all six crowds. Each family has a shaded,
// base and lighter cloth tone; skin/hair palettes remain independent.
export const EXTREME_CLOTH_PALETTE=Object.freeze(Object.fromEntries(Object.entries({
  sky:['#89adc7','#a9cbe3','#bdd9ec'],
  sage:['#97b194','#b8ceb4','#cadbc6'],
  lavender:['#aa9ac7','#c5b9dd','#d6cce9'],
  rose:['#c195a6','#deb6c4','#ebccd6'],
  peach:['#cc9f84','#e8bea5','#f2d3bd'],
  butter:['#c7b777','#e5d59b','#f0e4b6'],
}).map(([key,tones])=>[key,Object.freeze(tones)])));
const clothTone=(family,tone=1)=>EXTREME_CLOTH_PALETTE[family][tone];
// One pastel family + whites per person. Window passengers must wear their white
// above the sill; invisible white trousers cannot satisfy the visual contract.
function wardrobe(outfit,variant,id,zone){
  const family=Object.keys(EXTREME_CLOTH_PALETTE)[(id*5+Math.floor(id/6)+variant*2)%6];
  const white=HIPPIE_WHITES[(id+variant)%HIPPIE_WHITES.length];
  const whiteTop=zone==='windows'||(id+variant)%5<3;
  return {family,white,whiteGarment:whiteTop?'top':'trousers',
    clothes:whiteTop?white:clothTone(family,1),trousers:whiteTop?clothTone(family,0):white,
    accent:clothTone(family,1),trim:clothTone(family,0),cover:white,
    shoes:'#a58665',shorts:['summer','sunhat'].includes(outfit)};
}

// Local, head-centred parts are shared by the real crowd and the hairstyle view.
// Faceless heads: hair and beards define the silhouettes without facial features.
export function extremeHeadParts(p){
  const parts=[];
  const put=(shape,xyz,size,color,role)=>parts.push({shape,xyz,size,color,role,rotation:[0,0,0,1]});
  put('person-head',[0,0,0],[1.38,1.38,1.38],p.skin,'head');
  if(p.hairstyle!=='bald'){
    put('ext-hair-'+p.hairstyle,[0,0,0],[1.38,1.38,1.38],p.hair,'hair');
  }
  if(p.beard&&p.beard!=='none')put('ext-beard-'+p.beard,[0,0,0],[1.38,1.38,1.38],p.hair,'beard');
  if(p.outfit==='sunhat')put('ext-sunhat',[0,0,.72],[2.05,1.92,.55],p.white,'cover');
  else if(p.headband){
    put('ext-headband',[0,0,.24],[1.54,1.54,.11],p.accent,'headband');
    if(p.headband==='flower'){
      put('ext-flower',[.59,.46,.26],[.42,.12,.42],p.white,'flower');
      put('ext-sphere',[.59,.53,.26],[.12,.07,.12],clothTone('butter'),'flower-center');
    }
    if(p.headband==='tie')put('ext-ribbon',[-.64,-.15,-.11],[.16,.1,.72],p.accent,'ribbon');
  }
  return parts;
}

const outfits=HIPPIE_OUTFITS.map(o=>o.id);
// Three overlapping rounded slabs expose five shallow longitudinal terraces.
// The same elevations drive the seats, soles and roof-gripping hands.
export const EXTREME_ROOF = Object.freeze([
  {length:19.2,width:7.8,bottom:7.4,top:8.52},
  {length:18.95,width:4.7,bottom:8.48,top:8.92},
  {length:18.7,width:1.6,bottom:8.88,top:9.32},
].map(Object.freeze));
export function extremeRoofHeight(x,y){
  const tier=EXTREME_ROOF.findLast(t=>Math.abs(x)<=t.length/2&&Math.abs(y)<=t.width/2);
  return tier?.top??null;
}
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,b)=>{const [x,y,z,w]=a,[u,v,t,s]=b;return [w*u+x*s+y*t-z*v,w*v-x*t+y*s+z*u,w*t+x*v-y*u+z*s,w*s-x*u-y*v-z*t];};
const rotate=([x,y,z],[qx,qy,qz,qw])=>{
  const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
  return [x+qw*tx+qy*tz-qz*ty,y+qw*ty+qz*tx-qx*tz,z+qw*tz+qx*ty-qy*tx];
};
function vertical(direction){
  const length=Math.hypot(...direction),[x,y,z]=direction.map(n=>n/length);
  if(z<-.999999)return [1,0,0,0];
  const q=[-y,x,0,1+z],norm=Math.hypot(...q);return q.map(n=>n/norm);
}
function variantIndex(variant){
  const index=EXTREME_VARIANTS.findIndex(v=>v.id===variant);
  if(index<0)throw new RangeError('Unknown Extreme variant: '+variant);
  return index;
}

// Same six-item shuffle bag contract as normal passengers, without replay fields.
export function extremeRouteVariants(key,length){
  return wagonRouteAppearances('passenger','extreme:'+key,length).map(a=>EXTREME_VARIANTS[PASSENGER_VARIANTS.indexOf(a.variant)].id);
}

export function extremePeople(variant=EXTREME_VARIANTS[0].id){
  const v=variantIndex(variant),people=[];
  let bag=[],seed=(v+1)*7919;
  function hairstyle(){
    if(!bag.length){
      bag=[...EXTREME_HAIRSTYLES.map(s=>s.id),...HIPPIE_LONG_HAIR];
      for(let i=bag.length-1;i>0;i--){
        seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
        const j=(seed>>>0)%(i+1);[bag[i],bag[j]]=[bag[j],bag[i]];
      }
    }
    return bag.pop();
  }
  function person(zone,origin,yaw,pose,scale,extra={}){
    const id=people.length,p=passengerPerson(v*97+id*3+11,zone==='roof'?1:-1,id);
    const outfit=outfits[(id*5+v*7)%outfits.length];
    const hair=hairstyle(),clothing=wardrobe(outfit,v,id,zone);
    // Independent from hair, skin, clothing and placement: long-haired and bald
    // travellers both mix clean-shaven, short, broad and flowing beards.
    const beard=['none','short','medium','none','long'][(id*3+Math.floor(id/7)+v)%5];
    const headband=[null,'tie',null,'flower','plain'][(id*7+Math.floor(id/5)+v)%5];
    people.push({id,zone,origin,yaw,pose,scale,...p,hairstyle:hair,outfit,beard,headband,...clothing,
      lean:(id%3-1)*.09, ...extra});
  }
  // The crowded silhouette is deliberate: overlaps are allowed at game scale.
  // Keep the original people size, fill the ends, and mix heights within clusters.
  const slots=Array.from({length:60},(_,i)=>({row:Math.floor(i/12),col:i%12,key:i}));
  const skyline=[
    (c,r)=>Math.abs(c-5.5)+(r===2?4:0),
    (c,r)=>10-Math.abs(c-5.5)*1.6-Math.abs(r-2)*1.3,
    (c,r)=>Math.abs(c-5.5)*3-Math.abs(r-2)*.2,
    (c,r)=>10-Math.abs(c-(2*r+1))*1.8,
    (c,r)=>r*3+Math.sin(c)*1.2,
    (c,r)=>Math.max(10-Math.hypot(c-2.5,(r-1)*2)*2,10-Math.hypot(c-8,(r-3)*2)*2),
  ][v];
  const score=s=>skyline(s.col,s.row)+Math.sin(s.key*2+v)*.2;
  const standing=new Set([...slots].sort((a,b)=>score(b)-score(a)).slice(0,14).map(s=>s.key));
  const crouchScore=s=>-Math.abs(s.row-2)*2+Math.sin(s.key*3+v);
  const crouching=new Set(slots.filter(s=>!standing.has(s.key)&&s.row>0&&s.row<4)
    .sort((a,b)=>crouchScore(b)-crouchScore(a)).slice(0,8).map(s=>s.key));
  for(let row=0;row<5;row++){
    const outer=row===0||row===4;
    for(let col=0;col<12;col++){
      const side=row<2?-1:row>2?1:((col+v)%2?-1:1);
      const x=(col-5.5)*1.48+((row+v)%2?.18:-.18)+Math.sin(col*2.1+row+v)*.16;
      const y=(row-2)*1.54+Math.sin(col*1.7+v+row)*.12;
      const stand=standing.has(row*12+col),crouch=crouching.has(row*12+col);
      const pose=stand?['stand','wave','talk'][(col+row+v)%3]:crouch?'crouch':(col+v)%3===0?'wave':(col+v)%3===1?'talk':'sit';
      let yaw=side>0?0:Math.PI;
      yaw+=Math.sin(col*3+row*2+v)*.32+(v===4?.15:0);
      if(stand&&!outer)yaw+=(col%2?1:-1)*.8;
      const scale=.85+(col+row+v)%3*.035;
      const surface=extremeRoofHeight(x,y),hip=surface+(stand?1.89*scale:crouch?.78*scale:.18);
      person('roof',[x,y,hip],yaw,pose,scale,{stance:stand?'standing':crouch?'crouching':'seated',outer,row,
        lean:Math.sin(col*2+row+v)*.2,pitch:.1+Math.sin(col+row*2+v)*.12});
    }
  }
  for(const side of [-1,1])for(let col=0;col<5;col++){
    const count=(col+v+(side>0?1:0))%5<3?2:1;
    for(let j=0;j<count;j++){
      const pose=['peek','reach','wave'][(col+v+j+(side>0?1:0))%3];
      person('windows',[(col-2)*3.2+(count===2?(j?-.52:.52):0),side*(j?3.37:3.6),j?4.97:4.65],side>0?0:Math.PI,pose,j?.82:.86,
        {stance:'window',side,window:col,lean:(j?-.15:.2)+(col%2)*.1});
    }
  }
  for(const side of [-1,1])for(let col=0;col<4;col++){
    const pose=(col+v)%2?'hold-one':'hold-two';
    person('exterior',[(col-1.5)*3.2+Math.sin(col+v)*.18,side*(4.45+(col+v)%2*.12),5.45+(col+v)%3*.18],
      side>0?0:Math.PI,pose,.84+(col+v)%2*.04,
      {stance:'hanging',side,lean:((col+v)%2?1:-1)*.32,pitch:.18,footSupport:4.58});
  }
  // One on each side of each door; two more switch sides/ends between variants.
  for(const end of [-1,1])for(const side of [-1,1]){
    const doubled=side===(v%2?end:-end),count=doubled?2:1;
    for(let j=0;j<count;j++){
      person('door',[end*(j?9.66:9.58),side*(j?2.78:1.05),j?4.24:4.47],-end*Math.PI/2,
        j?'door-wave':'door-grip',j?.7:.81,{stance:'standing',end,side,lean:j?-.13:.08});
    }
  }
  return people;
}

export function extremeBodyParts(){
  return wagonParts('passenger',{variant:'classic'})
    .filter(p=>!['roof','coach-roof-seams','coach-vent'].includes(p.shape)&&!p.shape.startsWith('coach-curtain-')&&!(p.shape==='coach-end-panels'&&p.material==='glass'))
    .map(p=>{
      // Wider end footboards support the extra travellers beside each doorway.
      if(p.shape==='coach-steps')return {...p,size:[21,7.9,.7]};
      if(p.shape.startsWith('coach-belt'))return {...p,color:'#e9d8ae'};
      if(p.shape==='coach-end-panels'||p.shape==='box'&&Math.abs(p.xyz[1])===3.74)return {...p,color:'#182f35',material:'cargo'};
      return p;
    }).concat(EXTREME_ROOF.map(t=>({shape:'round',xyz:[0,0,(t.top+t.bottom)/2],size:[t.length,t.width,t.top-t.bottom],color:'paint',material:'paint',role:'roof-terrace'})));
}

export function passengerExtremeParts({variant=EXTREME_VARIANTS[0].id,detail='high',people=extremePeople(variant)}={}){
  if(!['high','low'].includes(detail))throw new RangeError('Unknown detail: '+detail);
  const parts=extremeBodyParts(),high=detail==='high';
  for(const p of people){
    const turn=[0,0,Math.sin(p.yaw/2),Math.cos(p.yaw/2)],s=p.scale;
    const bodyQ=vertical([p.lean,p.stance==='window'?.35:p.pitch??.08,1]);
    const point=v=>rotate(v,bodyQ);
    const robe=['tunic','kaftan','kurta'].includes(p.outfit);
    const cloth=p.clothes,trouser=p.trousers;
    function part(shape,xyz,size,color,rotation=[0,0,0,1],role){
      parts.push({shape,xyz:add(rotate(xyz.map(n=>n*s),turn),p.origin),size:size.map(n=>n*s),color,
        material:'person',rotation:mul(turn,rotation),person:p.id,zone:p.zone,role});
    }
    function limb(from,to,width,color,shape='ext-limb',role){
      const direction=to.map((n,i)=>n-from[i]);
      part(shape,from.map((n,i)=>(n+to[i])/2),[width,width,Math.hypot(...direction)+width*.18],color,vertical(direction),role);
    }
    const window=p.stance==='window',bodyHeight=window?1.25:1.5;
    const body=point([0,0,bodyHeight/2]);
    part('ext-blouse',body,[1.66,1.08,bodyHeight],cloth,bodyQ,'clothes');
    if(!window)part('ext-torso',[0,0,-.15],[1.68,1.02,.62],trouser,[0,0,0,1],'waist');
    // Every top drapes over the waist: asymmetrical hems, volume and wide sleeves
    // remain in far detail. Layers use the same pastel family as the trousers.
    if(!window)part('ext-hem',point([0,0,robe?-.29:.02]),
      [robe?1.95:1.8,1.18,robe?1.32:.69],cloth,bodyQ,'shirt-hem');
    if(p.outfit==='poncho')part('ext-poncho',point([0,0,.78]),[2.52,1.6,1.65],cloth,bodyQ,'poncho');
    if(['open-shirt','vest'].includes(p.outfit)){
      for(const side of [-1,1])part('ext-panel',point([side*.56,.3,.73]),
        [side<0?.62:.68,.35,p.outfit==='vest'?1.3:1.8],p.accent,bodyQ,'outer-shirt');
    }
    if(p.outfit==='shawl')part('ext-shawl',point([0,-.04,1.08]),[2.2,1.37,1.07],p.accent,bodyQ,'shawl');
    if(p.outfit==='overalls'){
      part('ext-panel',point([0,.53,.61]),[.95,.12,.99],trouser,bodyQ,'overalls');
      for(const side of [-1,1])part('ext-ribbon',point([side*.34,.48,1.1]),[.16,.12,.72],trouser,bodyQ,'strap');
    }
    if(high){
      // Broad pleats are modelled into the cloth; only small seams disappear far away.
      if(['linen','kurta','blouse','tunic'].includes(p.outfit)){
        for(const side of [-1,1])part('ext-panel',point([side*.19,.38,bodyHeight-.17]),[.31,.13,.32],p.white,bodyQ,'collar');
        if(p.outfit!=='blouse')for(const z of [.57,.83,1.09])part('ext-sphere',point([.02,.55,z]),[.065,.05,.065],p.trim,bodyQ,'button');
      }
      if(['kaftan','kurta'].includes(p.outfit))for(const side of [-1,1])part('ext-ribbon',point([side*.18,.56,.75]),[.085,.065,1.01],p.accent,bodyQ,'embroidery');
      if(p.outfit==='poncho')part('ext-poncho-edge',point([0,0,.78]),[2.54,1.62,1.65],p.accent,bodyQ,'fringe');
      if(p.outfit==='shawl')part('ext-ribbon',point([.64,.53,.57]),[.32,.17,1.18],p.accent,bodyQ,'scarf');
      if(p.id%3===0){
        part('ext-necklace',point([0,.42,1.15]),[.72,.28,.65],'#bd9760',bodyQ,'necklace');
        part('ext-sphere',point([0,.61,.83]),[.14,.08,.18],p.accent,bodyQ,'pendant');
      }
    }
    const head=point([0,0,bodyHeight+.44]);
    for(const h of extremeHeadParts(p))part(h.shape,add(head,h.xyz),h.size,h.color,h.rotation,h.role);

    if(!window)for(const side of [-1,1]){
      let knee,ankle;
      if(p.stance==='seated'){
        knee=[side*.5,p.outer?1.05:.79,p.outer?-.25:.02];
        ankle=[side*.54,p.outer?1.77:1.14,-1.55+(side>0?.14:0)];
      }
      else if(p.stance==='crouching'){knee=[side*.8,.55,-.12];ankle=[side*.62,-.15,-.53];}
      else if(p.stance==='hanging'){
        knee=[side*.7,.12,-.54];
        ankle=[side*.62,(3.95-Math.abs(p.origin[1]))/s,(p.footSupport-p.origin[2])/s+.25];
        if(p.pose==='hold-one'&&side===1){ankle[1]+=.3;ankle[2]-=.65;}
      }
      else {knee=[side*.4,side>0?.12:-.07,-.84];ankle=[side*.5,side>0?.23:-.14,-1.64];}
      if(p.zone==='roof'&&(!p.outer||p.stance==='standing')){
        const world=add(rotate(add(ankle,[0,.14,0]).map(n=>n*s),turn),p.origin),support=extremeRoofHeight(world[0],world[1]);
        if(support!==null)ankle[2]=(support-p.origin[2])/s+.25;
      }
      const beach=p.shorts;
      const hip=[side*.39,0,-.08];
      if(beach){
        const hem=hip.map((n,i)=>n+(knee[i]-n)*.78);
        limb(hip,hem,.91,trouser,'ext-trouser','short');
        limb(hem,knee,.36,p.skin,'ext-limb','bare-leg');
        limb(knee,ankle,.33,p.skin,'ext-limb','bare-leg');
      }else{
        limb(hip,knee,.83,trouser,'ext-trouser','trouser-upper');
        limb(knee,ankle,.88,trouser,'ext-flare','trouser-lower');
      }
      part('ext-shoe',add(ankle,[0,.14,-.09]),[.46,.68,.32],p.shoes,[0,0,0,1],'shoe');
      if(high){
        part('ext-shoe',add(ankle,[0,.22,-.025]),[.37,.47,.19],p.skin,[0,0,0,1],'foot');
        part('ext-band',add(ankle,[0,.13,.015]),[.43,.14,.09],p.white,[0,0,0,1],'sandal-strap');
      }
    }
    for(const side of [-1,1]){
      const shoulder=point([side*.57,0,bodyHeight*.81]);
      let elbow=[side*.78,.46,.62],hand=[side*.48,1.02,.08];
      if(window){elbow=[side*.84,.65,.56];hand=[side*.64,.94,.12];}
      if(p.pose==='reach'){elbow=[side*.99,.85,.86];hand=[side*1.25,1.25,.65];}
      if((p.pose==='wave'||p.pose==='door-wave')&&side===1){elbow=[.94,.23,1.43];hand=[1.12,.17,2.43];}
      if(p.pose==='talk'&&side===-1){elbow=[-.9,.4,.91];hand=[-1.23,.66,1.24];}
      if(p.pose==='stand'){elbow=[side*.79,.03,.61];hand=[side*.77,.1,-.05];}
      if(p.pose==='door-grip'){
        elbow=[side*.72,-.16,1.2];hand=[side*.82,-.28,2.23];
      }
      if(p.stance==='hanging'){
        // Actual contact on the roof edge, with feet on the lower window sill.
        if(p.pose==='hold-two'||side===-1){
          hand=[side*.69,(3.78-Math.abs(p.origin[1]))/s,(extremeRoofHeight(p.origin[0],3.78)-p.origin[2]) /s];
          elbow=[side*.95,.16,1.95];
        }else {elbow=[.94,.38,1.02];hand=[1.2,.59,1.66];}
      }
      const sleeveless=p.outfit==='summer';
      limb(shoulder,elbow,sleeveless?.38:.69,sleeveless?p.skin:cloth,sleeveless?'ext-limb':'ext-sleeve','sleeve');
      if(['blouse','kaftan','tunic','kurta'].includes(p.outfit)){
        const cuff=elbow.map((n,i)=>n+(hand[i]-n)*.73);
        limb(elbow,cuff,.71,cloth,'ext-sleeve','sleeve');limb(cuff,hand,.27,p.skin);
      }else limb(elbow,hand,.27,p.skin);
      if(high)part('ext-sphere',hand,[.35,.3,.34],p.skin);
    }
  }
  return parts;
}
