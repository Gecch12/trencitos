import * as THREE from '/vendor/three.module.js';
import { createWagonRenderer } from './wagon-renderer.js';
import { PASSENGER_EXTREME, EXTREME_VARIANTS, EXTREME_HAIRSTYLES, HIPPIE_OUTFITS, extremePeople, extremeHeadParts, extremeBodyParts, extremeRouteVariants, passengerExtremeParts } from './passenger-extreme-model.mjs';
import { bakeExtremeCrowd } from './passenger-extreme-geometry.mjs';

const stage=document.querySelector('#stage'),renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);stage.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-18,18,12,-12,.1,2000);
camera.up.set(0,0,1);
const sky=new THREE.HemisphereLight(0xfff9e8,0x365466,2.2);sky.position.set(0,0,1);scene.add(sky);
const sun=new THREE.DirectionalLight(0xffffff,2.5);sun.position.set(-40,40,90);scene.add(sun);
const meshes=[],dummy=new THREE.Object3D(),pose=new THREE.Quaternion(),paint=new THREE.Color();
const parts=extremeBodyParts();
const wagons=createWagonRenderer({renderer,capacity:225,additionalModels:[{model:PASSENGER_EXTREME.model,parts}],
  instances(geometry,capacity,material){const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;meshes.push(mesh);scene.add(mesh);return mesh;},
  put(mesh,x,y,z,angle,sx,sy,sz,color,rotation){
    dummy.position.set(x,-y,z);dummy.rotation.set(0,0,-angle*Math.PI/180);
    if(rotation)dummy.quaternion.multiply(pose.set(-rotation[0],rotation[1],-rotation[2],rotation[3]));
    dummy.scale.set(sx,sy,sz);dummy.updateMatrix();const i=mesh.count++;
    mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,paint.set(color));
  },
});
const crowdMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,metalness:0});
const crowds=new Map(),partCounts={};
for(const variant of EXTREME_VARIANTS)for(const detail of ['high','low']){
  const model=passengerExtremeParts({variant:variant.id,detail});partCounts[variant.id+':'+detail]=model.length;
  const geometry=bakeExtremeCrowd(model,detail),mesh=new THREE.InstancedMesh(geometry,crowdMaterial,225);
  mesh.scale.y=-1;mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);crowds.set(variant.id+':'+detail,mesh);
}
const shadowGeometry=new THREE.CircleGeometry(1,40),shadowMaterial=new THREE.MeshBasicMaterial({color:'#475044',transparent:true,opacity:.12,depthWrite:false});
const shadows=new THREE.InstancedMesh(shadowGeometry,shadowMaterial,225);shadows.frustumCulled=false;scene.add(shadows);
const hairSamples=[],wardrobeSamples=[],hairLabels=document.querySelector('#hairLabels');
function makeHairSamples(){
  if(hairSamples.length)return;
  const hairColors=['#493025','#73472b','#ab6537','#272529','#493025','#9b4a2c','#65503b','#c5a875','#78645a','#302926','#493025','#61554d'];
  for(const [i,style] of EXTREME_HAIRSTYLES.entries()){
    const person={hairstyle:style.id,outfit:'linen',skin:['#ddb38e','#b7815c','#8f5a3c'][i%3],hair:hairColors[i],
      beard:['none','short','medium','long'][i%4],headband:i%3===0?'tie':null,accent:'#b8ceb4',white:'#fffdf7'};
    const parts=extremeHeadParts(person).concat([
      {shape:'ext-limb',xyz:[0,0,-.68],size:[.42,.42,.6],color:person.skin},
      {shape:'ext-blouse',xyz:[0,0,-1.5],size:[1.7,.9,1.3],color:'#f6f1e5'},
    ]).map(p=>({...p,person:i,rotation:p.rotation||[0,0,0,1]}));
    const mesh=new THREE.Mesh(bakeExtremeCrowd(parts),crowdMaterial);mesh.visible=false;mesh.scale.y=-1;scene.add(mesh);
    const label=document.createElement('span');label.textContent=style.label;hairLabels.append(label);
    hairSamples.push({mesh,label,id:style.id});
  }
}
function makeWardrobeSamples(){
  if(wardrobeSamples.length)return;
  const people=extremePeople('picnic');
  for(const [i,outfit] of HIPPIE_OUTFITS.entries()){
    const person={...people.find(p=>p.outfit===outfit.id),id:i,zone:'sample',origin:[0,0,0],yaw:0,
      stance:'standing',pose:i%3===0?'talk':'stand',pitch:.07,lean:(i%3-1)*.1,scale:1};
    const mesh=new THREE.Mesh(bakeExtremeCrowd(passengerExtremeParts({people:[person]})),crowdMaterial);
    mesh.visible=false;mesh.scale.y=-1;scene.add(mesh);
    const label=document.createElement('span');label.textContent=outfit.label;hairLabels.append(label);
    wardrobeSamples.push({mesh,label,id:outfit.id});
  }
}
let color=PASSENGER_EXTREME.color,layout='single',variant=EXTREME_VARIANTS[0].id,yaw=-58,zoom=1,frame=0,draws=0,disposed=false,faded=false;
let detail='high',lastDetail='',shownVariants=[];
function framing(){
  const aspect=stage.clientWidth/stage.clientHeight;
  const hairHeight=stage.clientWidth<600?10.8:8.8;
  const halfHeight=(layout==='wardrobe'?Math.max(stage.clientWidth<600?15:11.8,11/aspect):layout==='hair'?Math.max(hairHeight,8/aspect):layout==='stress'?Math.max(160,220/aspect):layout==='train'?Math.max(22,101/aspect):layout==='gallery'?Math.max(27,41/aspect):Math.max(12,17/aspect))/zoom;
  return {aspect,halfHeight};
}
function populate(){
  meshes.forEach(m=>m.count=0);
  crowds.forEach(m=>m.count=0);
  if(layout==='hair')makeHairSamples();
  if(layout==='wardrobe')makeWardrobeSamples();
  for(const [samples,view] of [[hairSamples,'hair'],[wardrobeSamples,'wardrobe']])samples.forEach(s=>{
    s.mesh.visible=layout===view;s.label.hidden=layout!==view;
  });
  const study=layout==='hair'||layout==='wardrobe';hairLabels.hidden=!study;
  stage.classList.toggle('hair-view',study);
  detail=study||stage.clientHeight*13/(framing().halfHeight*2)>=125?'high':'low';lastDetail=detail;
  const count=study?0:layout==='stress'?225:layout==='train'?8:layout==='gallery'?6:1;shadows.count=count;
  shownVariants=layout==='single'?[variant]:layout==='gallery'?EXTREME_VARIANTS.map(v=>v.id):extremeRouteVariants('preview',count);
  for(let i=0;i<count;i++) {
    const cell=layout==='stress'?{x:(i%15-7)*26,y:(Math.floor(i/15)-7)*19,angle:0}:layout==='gallery'?{x:(i%3-1)*27,y:(Math.floor(i/3)-.5)*28,angle:0}:{x:(i-(count-1)/2)*22.7,y:0,angle:0};
    const tone=new THREE.Color(color);
    // Keep pure white identical across variants; lighting supplies the shading.
    if(color!=='#ffffff')tone.multiplyScalar([1,.88,1.05,.95,1.08,.92][EXTREME_VARIANTS.findIndex(v=>v.id===shownVariants[i])]);
    wagons.draw(cell,{color:'#'+tone.getHexString(),wagon:{model:PASSENGER_EXTREME.model}},faded);
    const crowd=crowds.get(shownVariants[i]+':'+detail);
    dummy.position.set(cell.x,cell.y,0);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();
    const index=crowd.count++;crowd.setMatrixAt(index,dummy.matrix);
    crowd.setColorAt(index,paint.setScalar(faded==='dim'?.28:faded?.65:1));
    dummy.position.set(cell.x,-cell.y,-.02);dummy.rotation.set(0,0,0);dummy.scale.set(11,4.7,1);dummy.updateMatrix();shadows.setMatrixAt(i,dummy.matrix);
  }
  for(const mesh of meshes){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  for(const mesh of crowds.values()){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  shadows.instanceMatrix.needsUpdate=true;render();
}
function render(){
  if(frame||disposed||document.hidden)return;
  frame=requestAnimationFrame(()=>{
    frame=0;const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);const {aspect,halfHeight}=framing();
    const study=layout==='hair'||layout==='wardrobe';
    const nextDetail=study||h*13/(halfHeight*2)>=125?'high':'low';
    if(nextDetail!==lastDetail)populate();
    camera.top=halfHeight;camera.bottom=-halfHeight;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;
    camera.position.set(Math.cos(yaw*Math.PI/180)*45,Math.sin(yaw*Math.PI/180)*45,33);
    if(study)camera.position.set(0,-45,11);
    camera.lookAt(0,0,6.5);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    if(study){
      const samples=layout==='hair'?hairSamples:wardrobeSamples;
      const columns=w<600?3:4,rows=Math.ceil(samples.length/columns),full=layout==='wardrobe';
      samples.forEach(({mesh,label},i)=>{
        mesh.position.set((i%columns-(columns-1)/2)*(full?5.4:3.95),0,7.1+((rows-1)/2-Math.floor(i/columns))*(full?6.5:5.0));
        mesh.rotation.z=-(yaw+90)*Math.PI/180;
        const point=mesh.position.clone().add(new THREE.Vector3(0,0,full?-2.7:-2.85)).project(camera);
        label.style.left=(point.x*.5+.5)*w+'px';label.style.top=(-point.y*.5+.5)*h+'px';
        label.style.width=Math.min(130,w/(columns+1))+'px';
      });
    }
    renderer.render(scene,camera);draws++;
  });
}
const selector=document.querySelector('#variant');
for(const v of EXTREME_VARIANTS){const option=document.createElement('option');option.value=v.id;option.textContent=v.label;selector.append(option);}
selector.addEventListener('change',()=>{
  variant=selector.value;document.querySelector('#variantDescription').textContent=EXTREME_VARIANTS.find(v=>v.id===variant).description;
  layout='single';document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.layout==='single'));populate();
});
document.querySelector('#variantDescription').textContent=EXTREME_VARIANTS[0].description;
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{
  color=button.dataset.color;document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',b===button));
  document.querySelector('#colorName').textContent=button.getAttribute('aria-label');populate();
}));
document.querySelectorAll('[data-layout]').forEach(button=>button.addEventListener('click',()=>{
  layout=button.dataset.layout;document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',b===button));populate();
}));
document.querySelector('#zoom').addEventListener('input',event=>{zoom=Number(event.target.value);render();});
document.querySelector('#reset').addEventListener('click',()=>{yaw=-58;zoom=1;document.querySelector('#zoom').value=1;render();});
let dragging=null;
stage.addEventListener('pointerdown',event=>{dragging={id:event.pointerId,x:event.clientX,yaw};stage.setPointerCapture(event.pointerId);});
stage.addEventListener('pointermove',event=>{if(dragging?.id!==event.pointerId)return;yaw=dragging.yaw+(event.clientX-dragging.x)*.45;render();});
stage.addEventListener('pointerup',()=>{dragging=null;});stage.addEventListener('pointercancel',()=>{dragging=null;});
const observer=new ResizeObserver(render);observer.observe(stage);
document.addEventListener('visibilitychange',render);
// Local verification hooks; no game, accounts, purchases or persistent state.
window.extremeStudy={
  stats:()=>({color,layout,variant,detail,shownVariants,yaw,draws,parts:partCounts[variant+':'+detail],people:PASSENGER_EXTREME.people,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,instances:meshes.reduce((n,m)=>n+m.count,0),crowds:[...crowds.values()].reduce((n,m)=>n+m.count,0),hairstyles:hairSamples.filter(s=>s.mesh.visible).map(s=>s.id),outfits:wardrobeSamples.filter(s=>s.mesh.visible).map(s=>s.id),bounds:[...crowds.entries()].map(([id,m])=>({id,min:m.geometry.boundingBox.min.toArray(),max:m.geometry.boundingBox.max.toArray()}))}),
  setView(angle){yaw=angle;render();},
  stress(){layout='stress';populate();},
  fade(value){faded=value;populate();},
};
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();meshes.forEach(m=>m.dispose());wagons.dispose();crowds.forEach(m=>{m.geometry.dispose();m.dispose();});[...hairSamples,...wardrobeSamples].forEach(s=>s.mesh.geometry.dispose());crowdMaterial.dispose();shadowGeometry.dispose();shadowMaterial.dispose();shadows.dispose();renderer.dispose();});
populate();
