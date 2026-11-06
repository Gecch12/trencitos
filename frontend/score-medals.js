import * as THREE from './vendor/three.module.js';
// Real raised medallions: beveled rim and a camera-facing number above the trains.
export function createScoreMedals({scene,camera,container}){
 const items=new Map(),rim=new THREE.CylinderGeometry(1,1,.16,40),face=new THREE.PlaneGeometry(1.72,1.72);
 let bounds=null,dirty=true,layoutKey="",obstacles=[];
 rim.rotateX(Math.PI/2);
 function clear(){for(const item of items.values()){scene.remove(item.group);item.texture.dispose();item.faceMaterial.dispose();item.rimMaterial.dispose();item.line.geometry.dispose();item.line.material.dispose();}items.clear();}
 function update(values,area){
  bounds=area||bounds;dirty=true;
  const keep=new Set(values.map(v=>v.id));for(const [id,item] of items)if(!keep.has(id)){scene.remove(item.group);item.texture.dispose();item.faceMaterial.dispose();item.rimMaterial.dispose();item.line.geometry.dispose();item.line.material.dispose();items.delete(id);}
  for(const value of values){let item=items.get(value.id);if(!item){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   const group=new THREE.Group(),rimMaterial=new THREE.MeshStandardMaterial({color:'#c89743',metalness:.4,roughness:.35,depthTest:false}),faceMaterial=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false});
   const edge=new THREE.Mesh(rim,rimMaterial),label=new THREE.Mesh(face,faceMaterial);label.position.z=.1;edge.renderOrder=80;label.renderOrder=81;group.add(edge,label);
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,-1,0)]),new THREE.LineBasicMaterial({color:'#f8e8b7',depthTest:false}));line.renderOrder=79;group.add(line);scene.add(group);
   item={group,canvas,texture,faceMaterial,rimMaterial,line};items.set(value.id,item);
  }
  item.value=value;const ctx=item.canvas.getContext('2d');ctx.clearRect(0,0,128,128);ctx.fillStyle=value.active?'#fff1bf':'#e5f0ec';ctx.beginPath();ctx.arc(64,64,63,0,Math.PI*2);ctx.fill();ctx.fillStyle='#193b49';ctx.font='bold 46px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(value.text),64,64,116);item.texture.needsUpdate=true;
  }
 }
 function layout(){
  if(!items.size)return;
  const width=container.clientWidth,height=container.clientHeight;
  const key=[width,height,...camera.position.toArray(),camera.left,camera.top].join(':');
  if(dirty||key!==layoutKey){
   const origin=container.getBoundingClientRect();
   obstacles=[...container.parentElement.querySelectorAll('[data-city-label]')]
    .filter(el=>el.style.opacity!=='0'&&el.style.display!=='none')
    .map(el=>el.querySelector('text').getBoundingClientRect())
    .filter(r=>r.width&&r.height).map(r=>({left:r.left-origin.left,right:r.right-origin.left,top:r.top-origin.top,bottom:r.bottom-origin.top}));
   dirty=false;layoutKey=key;
  }
  const area=bounds||{x:0,y:0,width,height},used=[],radius=21,scale=(camera.right-camera.left)/Math.max(1,width)*19;
  const offsets=[[0,0]];
  for(const r of [42,84,126,168])offsets.push([0,-r],[-r,-r/2],[r,-r/2],[-r,0],[r,0],[0,r],[-r,r/2],[r,r/2]);
  for(const item of items.values()){
   const v=item.value;item.group.position.set(v.x,-v.y,30);item.group.quaternion.copy(camera.quaternion);item.group.scale.setScalar(scale);
   const p=item.group.position.clone().project(camera),original={x:(p.x+1)*width/2,y:(1-p.y)*height/2};
   const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
   const candidates=offsets.map(([dx,dy])=>({x:clamp(original.x+dx,area.x+radius,area.x+area.width-radius),y:clamp(original.y+dy,area.y+radius,area.y+area.height-radius)}));
   const blocked=q=>used.some(u=>Math.hypot(u.x-q.x,u.y-q.y)<radius*2)||obstacles.some(r=>q.x+radius>r.left&&q.x-radius<r.right&&q.y+radius>r.top&&q.y-radius<r.bottom);
   const point=candidates.find(q=>!blocked(q))||candidates.find(q=>!used.some(u=>Math.hypot(u.x-q.x,u.y-q.y)<radius*2))||candidates[0];
   used.push(point);item.screen={...point,radius:19,text:v.text};p.x=2*point.x/width-1;p.y=1-2*point.y/height;item.group.position.copy(p.unproject(camera));
   const anchor=new THREE.Vector3(v.x,-v.y,12);item.group.updateMatrixWorld();item.group.worldToLocal(anchor);
   const positions=item.line.geometry.attributes.position;positions.setXYZ(0,0,-.9,0);positions.setXYZ(1,anchor.x,anchor.y,anchor.z);positions.needsUpdate=true;
  }
 }
 return {update,layout,clear,stats:()=>[...items.values()].map(item=>item.screen).filter(Boolean),dispose(){clear();rim.dispose();face.dispose();}};
}
