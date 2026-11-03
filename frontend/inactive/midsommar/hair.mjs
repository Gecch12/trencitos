import * as THREE from '../../vendor/three.module.js';

// Head-local geometry: +Y is the face, -Y the nape, +Z the crown. Hair is a
// continuous shell or a flowing lock, never a cluster of balls on a helmet.
export function createMidsommarHairShapes(detail,merge){
  const high=detail==='high',around=high?32:8,rings=high?12:4;
  const make=(positions,indices)=>{
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  };
  function scalp({radius=.535,top=.025,part=false,curls=false,buzz=false,receding=false,nape=false,style=''}={}){
    const positions=[],indices=[];
    const start=receding||nape?.79:0,end=Math.PI*2-start;
    for(let row=0;row<=rings;row++)for(let col=0;col<=around;col++){
      const theta=start+(end-start)*col/around,front=Math.max(0,Math.cos(theta));
      const first=nape?1.29:receding?1.46-.18*Math.max(0,-Math.cos(theta))+.02*Math.sin(theta*4):0;
      let hairline=(buzz?1.82:1.97)-(buzz?.68:.83)*front**4;
      if(style==='side-part')hairline=1.88-.9*front*front+.1*Math.sin(theta)*front;
      if(style==='fringe')hairline=1.97-front*front+.55*front*(.5+.5*Math.sin(theta));
      const t=row/rings,phi=first+(hairline-first)*t,s=Math.sin(phi);
      // Broad connected waves read as curls; the crown stays smooth at the pole.
      const wave=curls?.052*Math.sin(theta*9+phi*3)*Math.sin(phi*6)*s*s:0;
      const groove=part?.052*Math.exp(-(((Math.sin(theta)*s-.24)/.065)**2))*s:0;
      const sweep=style==='fringe'?.045*front*s:0;
      const lift=style==='quiff'?.29*front*front*Math.sin(t*Math.PI)*(.8+.2*Math.sin(theta)):
        style==='side-part'?.1*Math.max(0,-Math.sin(theta))*Math.sin(t*Math.PI):0;
      const r=radius+wave-groove+sweep;
      positions.push(Math.sin(theta)*s*r,Math.cos(theta)*s*r,
        Math.cos(phi)*r+top*(1-t)+lift+(buzz?0:.025*Math.sin(theta)*s));
    }
    for(let row=0;row<rings;row++)for(let col=0;col<around;col++){
      const a=row*(around+1)+col,b=a+around+1;
      indices.push(a,b+1,b,a,a+1,b+1);
    }
    // A tucked-in edge prevents the hairline from looking like a paper cutout.
    const edge=rings*(around+1),inner=positions.length/3;
    for(let col=0;col<=around;col++){
      const i=(edge+col)*3;
      positions.push(positions[i]*.91,positions[i+1]*.91,positions[i+2]*.94);
      if(col<around)indices.push(edge+col,inner+col+1,inner+col,edge+col,edge+col+1,inner+col+1);
    }
    return make(positions,indices);
  }
  function lock(points,width,depth,{steps=high?14:4,sides=high?8:4,taper=true}={}){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const frames=curve.computeFrenetFrames(steps,false),positions=[],indices=[];
    for(let i=0;i<=steps;i++){
      const t=i/steps,center=curve.getPointAt(t);
      const size=taper?(.2+.8*Math.sin(Math.PI*(.16+t*.82))):1;
      for(let j=0;j<=sides;j++){
        const a=j/sides*Math.PI*2;
        const point=center.clone().addScaledVector(frames.normals[i],Math.cos(a)*width*size)
          .addScaledVector(frames.binormals[i],Math.sin(a)*depth*size);
        positions.push(...point.toArray());
        if(i<steps&&j<sides){const q=i*(sides+1)+j,r=q+sides+1;indices.push(q,q+1,r,r,q+1,r+1);}
      }
    }
    for(const [row,reverse] of [[0,true],[steps,false]]){
      const center=positions.length/3;positions.push(...curve.getPointAt(row/steps).toArray());
      for(let j=0;j<sides;j++){
        const a=row*(sides+1)+j;
        indices.push(center,reverse?a+1:a,reverse?a:a+1);
      }
    }
    return make(positions,indices);
  }
  function curtain(length,wavy=false,curly=false){
    const positions=[],indices=[],rows=high?10:3;
    for(let layer=0;layer<2;layer++)for(let row=0;row<=rows;row++)for(let col=0;col<=around;col++){
      const t=row/rows,theta=.63+(Math.PI*2-1.26)*col/around;
      const wave=curly?.065*Math.sin(t*Math.PI*4+theta*5)*Math.sin(theta*7)*t:
        wavy?.07*Math.sin(t*Math.PI*2+theta*3)*t:.018*Math.sin(theta*5)*t;
      const radius=.4+.16*Math.sin(t*Math.PI*.65)+wave-layer*.075;
      positions.push(Math.sin(theta)*radius,Math.cos(theta)*radius,
        .25-t*length+.035*Math.cos(theta*4)*t);
    }
    const span=(rows+1)*(around+1);
    for(let layer=0;layer<2;layer++)for(let row=0;row<rows;row++)for(let col=0;col<around;col++){
      const a=layer*span+row*(around+1)+col,b=a+around+1;
      const triangles=[a,b+1,b,a,a+1,b+1];indices.push(...(layer?triangles.reverse():triangles));
    }
    for(let col=0;col<around;col++){
      const a=rows*(around+1)+col,b=a+span;indices.push(a,b,a+1,b,b+1,a+1);
    }
    for(const col of [0,around])for(let row=0;row<rows;row++){
      const a=row*(around+1)+col,b=a+around+1;
      const triangles=[a,a+span,b,b,a+span,b+span];indices.push(...(col?triangles.reverse():triangles));
    }
    return make(positions,indices);
  }
  const sidePart=scalp({part:true,top:.06,style:'side-part'});
  const fringe=scalp({top:.04,style:'fringe'});
  const quiff=scalp({part:true,top:.06,style:'quiff'});
  const bob=merge([scalp({part:true}),curtain(.91)]);
  const frontLocks=(length,wave=0)=>[-1,1].map(side=>lock([
    [side*.08,.26,.5],[side*.43,.35,.18],[side*(.54+wave),.34,-.45],
    [side*(.43-wave),.38,-length]],.15,.095));
  const long=merge([scalp({part:true}),curtain(1.65,true),...frontLocks(1.12)]);
  const centerPart=merge([scalp({part:true,top:.04}),curtain(1.82),...frontLocks(1.28)]);
  const waves=merge([scalp({part:true,top:.07}),curtain(1.94,true),...frontLocks(1.39,.09)]);
  const ponytail=merge([scalp(),lock([[0,-.45,.26],[.03,-.75,.3],[.15,-.84,-.4],[.24,-.71,-1.44]],.24,.16)]);
  const braidPoints=Array.from({length:high?35:12},(_,i)=>{
    const t=i/(high?34:11);return [.06+t*.23,-.46-.16*Math.sin(t*Math.PI),.14-t*1.65];
  });
  const braid=merge([scalp(),...(high?[0,1,2].map(strand=>lock(braidPoints.map((p,i)=>{
    const a=i/(braidPoints.length-1)*Math.PI*6+strand*Math.PI*2/3;
    return [p[0]+Math.cos(a)*.072,p[1]+Math.sin(a)*.065,p[2]];
  }),.065,.06,{steps:34,sides:6,taper:false})):[lock(braidPoints,.14,.11)])]);
  const coil=Array.from({length:high?31:15},(_,i)=>{
    const t=i/(high?30:14),a=t*Math.PI*4,r=.24*(1-t*.7);
    return [Math.cos(a)*r,-.54-t*.1,.15+Math.sin(a)*r];
  });
  const twinBraids=merge([scalp({part:true}),...[-1,1].flatMap(side=>{
    const points=Array.from({length:high?29:12},(_,i)=>{
      const t=i/(high?28:11);return [side*(.48+.11*Math.sin(t*Math.PI)),.08+t*.34,.08-t*1.52];
    });
    return high?[0,1,2].map(strand=>lock(points.map((p,i)=>{
      const a=i/(points.length-1)*Math.PI*8+strand*Math.PI*2/3;
      return [p[0]+Math.cos(a)*.055,p[1]+Math.sin(a)*.05,p[2]];
    }),.07,.06,{steps:28,sides:6,taper:false})):[lock(points,.15,.12)];
  })]);
  const halfUp=merge([scalp({part:true}),curtain(1.72,true),
    lock(coil.map(([x,y,z])=>[x*.7,y,z+.16]),.11,.08,{taper:false}),
    ...frontLocks(.95)]);
  // A thick continuous jaw shell, open above the cheeks. The outline narrows
  // towards the chin; long beards fall onto the chest in broad, connected waves.
  function beard(length,width,wavy=false){
    const positions=[],indices=[],rows=high?12:3,cols=high?24:7;
    for(let layer=0;layer<2;layer++)for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      const t=row/rows,a=-1.39+col/cols*2.78;
      const taper=1-t*.49,front=Math.cos(a);
      const fold=wavy?.035*Math.sin(a*8+t*6)*Math.sin(t*Math.PI):0;
      const radius=(.52-layer*.085+fold)*taper;
      positions.push(Math.sin(a)*radius*width,front*radius+.13*t,
        -.12-.13*front-t*(length-.22*Math.abs(Math.sin(a)))+.035*Math.cos(a*5)*t);
    }
    const stride=cols+1,span=(rows+1)*stride;
    for(let layer=0;layer<2;layer++)for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
      const a=layer*span+row*stride+col,b=a+stride;
      const tri=[a,b+1,b,a,a+1,b+1];indices.push(...(layer?tri.reverse():tri));
    }
    for(const row of [0,rows])for(let col=0;col<cols;col++){
      const a=row*stride+col,b=a+span;const tri=[a,b,a+1,b,b+1,a+1];indices.push(...(row?tri:tri.reverse()));
    }
    for(const col of [0,cols])for(let row=0;row<rows;row++){
      const a=row*stride+col,b=a+stride;const tri=[a,a+span,b,b,a+span,b+span];indices.push(...(col?tri.reverse():tri));
    }
    return make(positions,indices);
  }
  return {
    'ext-hair-center-part':centerPart,'ext-hair-waves':waves,
    'ext-hair-twin-braids':twinBraids,'ext-hair-half-up':halfUp,
    'ext-hair-side-part':sidePart,'ext-hair-fringe':fringe,'ext-hair-quiff':quiff,
    'ext-hair-buzz':scalp({radius:.507,top:0,buzz:true}),
    'ext-hair-bob':bob,'ext-hair-long':long,'ext-hair-ponytail':ponytail,
    'ext-hair-braid':braid,'ext-hair-bun':merge([scalp(),lock(coil,.12,.085,{taper:false})]),
    'ext-hair-curls':merge([scalp({radius:.565,top:.09,curls:true}),curtain(1.62,true,true),...frontLocks(1.07,.06)]),
    'ext-hair-receding':scalp({radius:.516,top:0,receding:true}),
    'ext-hair-nape':scalp({radius:.512,top:0,nape:true}),
    'ext-beard-short':beard(.31,1.03),
    'ext-beard-medium':beard(.65,1.1),
    'ext-beard-long':beard(1.08,1.09,true),
  };
}
