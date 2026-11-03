import * as THREE from '/vendor/three.module.js';
import { createExtremeHairShapes } from './passenger-extreme-hair.mjs';

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
    ...createExtremeHairShapes(detail,merge),
    'ext-hair-veil':hood,
    'ext-hair-turban':merge([sphere().scale(1.05,1,.72).translate(0,0,.3),cylinder(.5,.5,.1).translate(0,0,.2)]),
    'ext-cap':merge([cylinder(.43,.48,.66).translate(0,0,.12),cylinder(.49,.49,.12).scale(1,1.08,1).translate(0,.08,-.22)]),
    'ext-sunhat':merge([cylinder(.27,.35,.7).translate(0,0,.12),cylinder(.5,.5,.12).translate(0,0,-.28)]),
  };
}

// Bake one crowd per variant/LOD: vertex colours retain every outfit, while GPU
// instancing renders a complete crowd in one call instead of one mesh per limb.
export function bakeExtremeCrowd(parts,detail='high'){
  const primitives=shapes(detail),positions=[],normals=[],colors=[],indices=[];
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3(),color=new THREE.Color();
  for(const p of parts.filter(p=>p.person!==undefined)){
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
