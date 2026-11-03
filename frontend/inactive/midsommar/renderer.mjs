import * as THREE from '../../vendor/three.module.js';
import { MIDSOMMAR_TRAIN, MIDSOMMAR_VARIANTS, midsommarCrowdParts } from './model.mjs';
import { bakeMidsommarCrowd } from './geometry.mjs';

export function createMidsommarCrowd({instances,put,capacity=300}) {
  let crowdDetail = 'low';
  const crowdBatches = new Map();
  const crowdMaterial = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:.86, metalness:0 });
  // The same destination-highlight tint as ordinary wagon parts, applied after
  // vertex colours. A per-instance value keeps mixed highlighted routes batched.
  crowdMaterial.onBeforeCompile = shader => {
    shader.uniforms.midsommarMuted = { value:new THREE.Color('#bbd6d9') };
    shader.vertexShader = 'attribute float crowdFade; varying float vCrowdFade;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrowdFade = crowdFade;');
    shader.fragmentShader = 'varying float vCrowdFade; uniform vec3 midsommarMuted;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vCrowdFade < 0.0 ? diffuseColor.rgb * 0.28 : mix(diffuseColor.rgb, midsommarMuted, vCrowdFade);');
  };
  crowdMaterial.customProgramCacheKey = () => 'midsommar-crowd-fade-v1';
  function drawCrowd(cell, faded, appearance) {
    const variant = MIDSOMMAR_VARIANTS.some(v=>v.id===appearance.variant) ? appearance.variant : MIDSOMMAR_VARIANTS[0].id;
    const key = `${variant}:${crowdDetail}`;
    if (!crowdBatches.has(key)) {
      const geometry = bakeMidsommarCrowd(midsommarCrowdParts({variant,detail:crowdDetail}),crowdDetail);
      // Reflect into the board's Y axis before instancing, including winding.
      // Negative instance scales are unsupported; all instances keep positive scale.
      geometry.scale(1,-1,1);
      const indices = geometry.index.array;
      for (let i=0;i<indices.length;i+=3) [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
      geometry.index.needsUpdate=true;
      geometry.name=`midsommar-crowd:${key}`;
      geometry.setAttribute('crowdFade',new THREE.InstancedBufferAttribute(new Float32Array(capacity),1));
      crowdBatches.set(key,instances(geometry,capacity,crowdMaterial));
    }
    const mesh=crowdBatches.get(key),fade=mesh.geometry.getAttribute('crowdFade');
    fade.setX(mesh.count,faded==='dim'?-1:faded?.72:0);fade.needsUpdate=true;
    put(mesh,cell.x,cell.y,0,cell.angle,1,1,1,'#ffffff');
  }

  return {draw:drawCrowd,setDetail(detail){crowdDetail=detail==='high'?'high':'low';},dispose(){crowdBatches.forEach(mesh=>mesh.geometry.dispose());crowdBatches.clear();crowdMaterial.dispose();}};
}
