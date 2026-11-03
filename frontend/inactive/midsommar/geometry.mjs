import * as THREE from '../../vendor/three.module.js';
import { createMidsommarHairShapes } from './hair.mjs';

function merge(geometries){
  const positions=[],normals=[],indices=[];
  for(const geometry of geometries){
    const offset=positions.length/3;
    positions.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);
    const source=geometry.index?.array||Array.from({length:geometry.attributes.position.count},(_,i)=>i);
    for(const i of source)indices.push(i+offset);
    geometry.dispose();
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setIndex(indices);return g;
}

function shapes(detail){
  const high=detail==='high',segments=high?16:6;
  const sphere=()=>new THREE.SphereGeometry(.5,segments,high?12:4);
  const cylinder=(a,b,h=1)=>new THREE.CylinderGeometry(a,b,h,segments).rotateX(Math.PI/2);
  const cap=()=>new THREE.SphereGeometry(.5,segments,high?8:4,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).translate(0,0,.12);
  const torso=new THREE.LatheGeometry([[0,-.5],[.32,-.5],[.38,-.25],[.5,.2],[.44,.38],[.23,.5],[0,.5]].map(p=>new THREE.Vector2(...p)),high?12:6).rotateX(Math.PI/2);
  const limb=high?new THREE.CapsuleGeometry(.5,1,2,8).rotateX(Math.PI/2).scale(1,1,.5):cylinder(.5,.5);
  const trouser=high?new THREE.LatheGeometry([[0,-.5],[.36,-.5],[.43,-.38],[.5,-.04],[.48,.3],[.4,.5],[0,.5]].map(p=>new THREE.Vector2(...p)),12).rotateX(Math.PI/2):cylinder(.42,.5);
  // Z-aligned fabric: generous cloth with broad folds and a slightly uneven hem.
  // Both LODs keep the same silhouette instead of replacing clothing with sticks.
  function cloth(profile,{folds=7,depth=.025,hem=0}={}){
    const silhouette=high?profile:[profile[0],profile[1],profile[Math.floor(profile.length/2)],profile.at(-2),profile.at(-1)];
    const g=new THREE.LatheGeometry(silhouette.map(p=>new THREE.Vector2(...p)),high?24:6).rotateX(Math.PI/2);
    const positions=g.attributes.position;
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),a=Math.atan2(y,x);
      const wave=1+depth*Math.cos(a*folds+z*.9);
      positions.setXYZ(i,x*wave,y*wave,z+hem*(Math.sin(a*3)+Math.cos(a))*(.5-z));
    }
    g.computeVertexNormals();return g;
  }
  const panel=cloth([[0,-.5],[.38,-.5],[.5,-.32],[.44,.32],[.25,.5],[0,.5]],{depth:.05,hem:.025});
  // A triangular drape, expressed in its physical width instead of a rigid box.
  function poncho(edgeOnly=false){
    const positions=[],indices=[],n=high?32:12;
    const rows=edgeOnly?[.88,1]:[0,.32,.66,1];
    for(const t of rows)for(let i=0;i<=n;i++){
      const a=i/n*Math.PI*2,r=.19+t*.33;
      positions.push(Math.cos(a)*r,Math.sin(a)*r,
        .5-t*(.83+.17*Math.abs(Math.sin(a)))+.024*Math.cos(a*8)*t);
    }
    for(let r=0;r<rows.length-1;r++)for(let i=0;i<n;i++){
      const a=r*(n+1)+i,b=a+n+1;indices.push(a,b,a+1,b,b+1,a+1,a+1,b,a,a+1,b+1,b);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  const flower=merge(Array.from({length:5},(_,i)=>{
    const a=i/5*Math.PI*2;return sphere().scale(.43,.65,.43).translate(Math.cos(a)*.29,0,Math.sin(a)*.29);
  }));
  const necklace=new THREE.TorusGeometry(.5,.035,high?5:3,high?20:10).rotateX(Math.PI/2);
  const hood=merge([cap(),new THREE.SphereGeometry(.5,segments,high?8:4).scale(1,.48,1.1).translate(0,-.24,-.12)]);
  // Folk silhouettes retain their volume in board detail: full skirts, fitted
  // waistcoats, puff sleeves and a tied kerchief with an open face.
  function drapedSkirt(edgeOnly=false,apron=false){
    const levels=edgeOnly?[[1.05,1.05,.43,-1.04],[1.09,1.07,.42,-1.18]]:
      [[.65,0,.43,0],[.98,.55,.67,-.15],[1.04,1,.46,-.88],[1.09,1.07,.42,-1.18]];
    const positions=[],indices=[],n=high?24:10;
    for(const [rx,cy,ry,z] of levels)for(let i=0;i<=n;i++){
      const a=apron?(-.65+i/n*1.3):i/n*Math.PI*2;
      const fold=1+.035*Math.cos(a*10);
      positions.push(Math.sin(a)*rx*fold,cy+Math.cos(a)*ry*fold,z);
    }
    for(let r=0;r<levels.length-1;r++)for(let i=0;i<n;i++){
      const a=r*(n+1)+i,b=a+n+1;indices.push(a,a+1,b,b,a+1,b+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  function kerchief(){
    const positions=[],indices=[],n=high?24:12,rows=high?9:4;
    for(let r=0;r<=rows;r++)for(let i=0;i<=n;i++){
      const a=i/n*Math.PI*2,front=Math.max(0,Math.cos(a));
      const phi=r/rows*(2.12-1.03*front*front),radius=.54;
      positions.push(Math.sin(a)*Math.sin(phi)*radius,Math.cos(a)*Math.sin(phi)*radius,Math.cos(phi)*radius+.025);
    }
    for(let r=0;r<rows;r++)for(let i=0;i<n;i++){
      const a=r*(n+1)+i,b=a+n+1;indices.push(a,a+1,b,b,a+1,b+1);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  const leaf=new THREE.BufferGeometry();
  leaf.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,0,0,0,.5,.5,0,0,0,0,-.5,0,.5,0,0,-.5,0],3));
  leaf.setIndex([0,4,1,1,4,2,2,4,3,3,4,0,0,1,5,1,2,5,2,3,5,3,0,5]);leaf.computeVertexNormals();
  function bellows(){
    const positions=[],indices=[],folds=high?10:7;
    for(let i=0;i<=folds*2;i++){
      const x=i/(folds*2)-.5,r=i%2?.5:.38;
      for(const [y,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])positions.push(x,y*r,z*r);
      if(i)for(let j=0;j<4;j++){
        const a=(i-1)*4+j,b=(i-1)*4+(j+1)%4,c=i*4+j,d=i*4+(j+1)%4;
        indices.push(a,c,b,b,c,d);
      }
    }
    const end=folds*8;indices.push(0,1,2,0,2,3,end,end+2,end+1,end,end+3,end+2);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  const violin=new THREE.Shape();
  violin.moveTo(-.5,0);
  violin.bezierCurveTo(-.5,.48,-.22,.53,-.13,.24);
  violin.bezierCurveTo(-.04,.13,.03,.13,.13,.37);
  violin.bezierCurveTo(.35,.72,.55,.32,.5,0);
  violin.bezierCurveTo(.55,-.32,.35,-.72,.13,-.37);
  violin.bezierCurveTo(.03,-.13,-.04,-.13,-.13,-.24);
  violin.bezierCurveTo(-.22,-.53,-.5,-.48,-.5,0);
  const violinBody=new THREE.ExtrudeGeometry(violin,{depth:.9,bevelEnabled:true,bevelSize:.025,bevelThickness:.05,bevelSegments:1,steps:1,curveSegments:high?10:4})
    .translate(0,0,-.45).rotateX(Math.PI/2);
  function dancingSkirt(hem=false){
    const profile=hem?[[.5,-.5],[.5,-.49],[.48,-.38],[.48,-.37]]:
      [[0,-.5],[.5,-.5],[.48,-.35],[.36,.16],[.26,.5],[0,.5]];
    const g=cloth(profile,{folds:9,depth:.055}),pos=g.attributes.position;
    for(let i=0;i<pos.count;i++){
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),a=Math.atan2(y,x),swing=.5-z;
      pos.setXYZ(i,x+.12*swing*swing,y+.045*Math.sin(a)*swing,z+.075*(1+Math.cos(a-1))*swing);
    }
    g.computeVertexNormals();return g;
  }
  return {
    'person-head':sphere(), 'ext-sphere':sphere(), 'ext-torso':torso, 'ext-limb':limb, 'ext-trouser':trouser,
    'ext-blouse':cloth([[0,-.5],[.42,-.5],[.48,-.2],[.5,.15],[.43,.38],[.22,.5],[0,.5]],{depth:.04}),
    'ext-hem':cloth([[0,-.5],[.5,-.5],[.47,-.1],[.41,.5],[0,.5]],{depth:.045,hem:.05}),
    'ext-flare':cloth([[0,-.5],[.33,-.5],[.38,-.25],[.43,.18],[.5,.5],[0,.5]],{depth:.045}),
    'ext-sleeve':cloth([[0,-.5],[.35,-.5],[.46,0],[.5,.5],[0,.5]],{depth:.05}),
    'ext-panel':panel, 'ext-ribbon':panel.clone(),
    'ext-poncho':poncho(), 'ext-poncho-edge':poncho(true),
    'ext-shawl':cloth([[0,-.5],[.48,-.5],[.5,-.15],[.35,.5],[0,.5]],{depth:.06,hem:.09}),
    'ext-headband':new THREE.CylinderGeometry(.5,.5,1,high?24:12,1,true).rotateX(Math.PI/2),
    'ext-flower':flower,'ext-necklace':necklace,
    'ext-shoe':sphere(), 'ext-box':new THREE.BoxGeometry(1,1,1),
    'ext-robe':cylinder(.37,.5), 'ext-band':cylinder(.5,.5),
    'ext-scarf':new THREE.BoxGeometry(1,1,1),
    ...createMidsommarHairShapes(detail,merge),
    'ext-hair-veil':hood,
    'ext-hair-turban':merge([sphere().scale(1.05,1,.72).translate(0,0,.3),cylinder(.5,.5,.1).translate(0,0,.2)]),
    'ext-cap':merge([cylinder(.43,.48,.66).translate(0,0,.12),cylinder(.49,.49,.12).scale(1,1.08,1).translate(0,.08,-.22)]),
    'ext-sunhat':merge([cylinder(.27,.35,.7).translate(0,0,.12),cylinder(.5,.5,.12).translate(0,0,-.28)]),
    'mid-waistcoat':cloth([[0,-.5],[.44,-.5],[.4,-.12],[.49,.35],[.35,.5],[0,.5]],{depth:.015}),
    'mid-puff-sleeve':cloth([[0,-.5],[.22,-.5],[.47,-.27],[.5,.1],[.37,.4],[.22,.5],[0,.5]],{folds:6,depth:.035}),
    'mid-skirt':cloth([[0,-.5],[.5,-.5],[.48,-.35],[.38,.18],[.28,.5],[0,.5]],{folds:10,depth:.035}),
    'mid-skirt-hem':cloth([[.5,-.5],[.5,-.49],[.49,-.38],[.49,-.37]],{folds:10,depth:.035}),
    'mid-seated-skirt':drapedSkirt(), 'mid-seated-skirt-hem':drapedSkirt(true), 'mid-seated-apron':drapedSkirt(false,true),
    'mid-kerchief':kerchief(), 'mid-leaf':leaf,
    'mid-wreath':new THREE.TorusGeometry(.5,.055,high?6:4,high?28:16).rotateX(Math.PI/2),
    'mid-vessel':new THREE.LatheGeometry([[0,-.5],[.35,-.5],[.46,-.3],[.5,.2],[.43,.5],[.35,.5],[.4,.15],[.32,-.32],[0,-.32]].map(p=>new THREE.Vector2(...p)),segments).rotateX(Math.PI/2),
    'mid-berry':new THREE.LatheGeometry([[0,-.5],[.2,-.35],[.42,0],[.5,.25],[.3,.5],[0,.5]].map(p=>new THREE.Vector2(...p)),high?12:6).rotateX(Math.PI/2),
    'mid-bellows':bellows(), 'mid-violin':violinBody,
    'mid-dancing-skirt':dancingSkirt(), 'mid-dancing-skirt-hem':dancingSkirt(true),
  };
}

// Bake one crowd per variant/LOD: vertex colours retain every outfit, while GPU
// instancing renders a complete crowd in one call instead of one mesh per limb.
export function bakeMidsommarCrowd(parts,detail='high'){
  const primitives=shapes(detail),positions=[],normals=[],colors=[],indices=[];
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(),color=new THREE.Color();
  for(const p of parts.filter(p=>p.person!==undefined||p.decoration)){
    const source=primitives[p.shape];if(!source)throw new Error('Missing crowd shape: '+p.shape);
    matrix.compose(position.fromArray(p.xyz),q.fromArray(p.rotation),scale.fromArray(p.size));
    const g=source.clone().applyMatrix4(matrix),offset=positions.length/3;
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
    color.set(p.color);
    for(let i=0;i<g.attributes.position.count;i++)colors.push(color.r,color.g,color.b);
    const sourceIndices=g.index?.array||Array.from({length:g.attributes.position.count},(_,i)=>i);
    for(const i of sourceIndices)indices.push(i+offset);
    g.dispose();
  }
  for(const g of Object.values(primitives))g.dispose();
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
