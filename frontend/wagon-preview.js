import * as THREE from './vendor/three.module.js';
import { createWagonRenderer } from './wagon-renderer.js';
import { WAGON_STYLES, wagonAppearance, wagonStyle, wagonVariants } from './wagon-models.mjs';

// The shared couplers reach +/-10.65: this spacing joins adjacent wagons.
const WAGON_SPACING = 21.3;

// Same meshes as the board: compact 3/4 preview, optional collection or connected train.
export function createWagonPreview({ container, onFailure, train = false, gallery = false, translate = text => text }) {
  train ||= gallery;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(), meshes = [];
  const camera = new THREE.OrthographicCamera(-18, 18, 10, -10, .1, 200);
  camera.up.set(0, 0, 1);
  const sky = new THREE.HemisphereLight(0xfff9e8, 0x365466, 2.2);
  sky.position.set(0, 0, 1); scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-40, 40, 90); scene.add(sun);
  const dummy = new THREE.Object3D(), paint = new THREE.Color(), pose = new THREE.Quaternion();
  const capacity = train ? Math.max(...WAGON_STYLES.map(style => wagonVariants(style.model).length)) : 1;
  const galleryBounds = new THREE.Box3();
  const wagons = createWagonRenderer({ renderer, capacity,
    instances(geometry, capacity, material) {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.count = 0; mesh.frustumCulled = false; meshes.push(mesh); scene.add(mesh); return mesh;
    },
    put(mesh, x, y, z, angle, sx, sy, sz, color, rotation) {
      dummy.position.set(x, -y, z); dummy.rotation.set(0, 0, -angle * Math.PI / 180);
      if (rotation) dummy.quaternion.multiply(pose.set(-rotation[0],rotation[1],-rotation[2],rotation[3]));
      dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
      const i = mesh.count++; mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, paint.set(color));
    },
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#4c513d', transparent: true, opacity: .12, depthWrite: false }));
  shadow.scale.set(11, 4.7, 1); shadow.position.z = -.01; shadow.visible = !train; scene.add(shadow);
  let frame = 0, disposed = false, current = null, currentColor = null, currentVisualKey = null, rendered = null, items = [];
  const mobile = train && !gallery ? matchMedia('(max-width: 600px), (max-width: 950px) and (max-height: 500px)') : null;
  if (train) container.classList.add('wagon-preview-train');
  if (gallery) container.scrollLeft = 0;
  function draw(color, appearances) {
    for (const mesh of meshes) mesh.count = 0;
    appearances.forEach((appearance, index) => {
      const x = (index - (appearances.length - 1) / 2) * WAGON_SPACING;
      wagons.draw({ x, y: 0, angle: 0 }, { color }, false, appearance);
    });
    galleryBounds.makeEmpty();
    for (const mesh of meshes) {
      mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (gallery && mesh.visible) { mesh.computeBoundingBox(); galleryBounds.union(mesh.boundingBox); }
    }
  }
  function frameCamera(w, h, count = 1) {
    const sideView = train && !mobile?.matches;
    const centerX = gallery ? (galleryBounds.min.x + galleryBounds.max.x) / 2 : 0;
    const centerZ = gallery ? (galleryBounds.min.z + galleryBounds.max.z) / 2 : 5.2;
    if (sideView) { camera.position.set(centerX, -80, centerZ); camera.lookAt(centerX, 0, centerZ); }
    else { camera.position.set(24, -38, 29); camera.lookAt(0, 0, 4); }
    shadow.visible = !sideView;
    const halfHeight = gallery ? Math.max((galleryBounds.max.z - galleryBounds.min.z + 2.4) / 2,
      (galleryBounds.max.x - galleryBounds.min.x + 3) * h / w / 2)
      : sideView
      ? Math.max(6.2, (count * WAGON_SPACING + 3) * h / w / 2)
      : Math.max(9.2, 15 * h / w);
    camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.left = -halfHeight * w / h; camera.right = halfHeight * w / h;
    camera.updateProjectionMatrix();
  }
  function render() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const viewportWidth = container.clientWidth, h = container.clientHeight;
      if (disposed || !viewportWidth || !h || !currentColor || document.hidden) return;
      // The collection is one wide canvas inside a native horizontal scroller.
      // Set its CSS size too: the drawing buffer can be twice as large on Retina.
      const w = gallery ? Math.max(viewportWidth, Math.round(items.length * Math.min(260, viewportWidth * .82))) : viewportWidth;
      renderer.setSize(w, h, gallery);
      let count = 1;
      const detail = !train && h>=240 ? 'high' : 'low';
      if (train) {
        count = mobile?.matches ? Math.min(1, items.length) : items.length;
        if (!count) return;
        items.forEach(({ stage }, index) => { stage.hidden = index >= count; });
        const key = `${current}:${count}:${detail}`;
        if (rendered !== key) {
          draw(currentColor, items.slice(0, count).map(item => item.appearance));
          rendered = key;
        }
      } else if (rendered !== `${current}:${detail}`) {
        draw(currentColor,[wagonAppearance(wagonStyle(currentColor).model,currentVisualKey)]);
        rendered=`${current}:${detail}`;
      }
      renderer.setViewport(0, 0, w, h); frameCamera(w, h, count); renderer.render(scene, camera);
    });
  }
  function lost(event) { event.preventDefault(); onFailure(); }
  function visible() { if (!document.hidden) render(); }
  renderer.domElement.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', visible);
  mobile?.addEventListener('change', render);
  container.append(renderer.domElement);
  const observer = new ResizeObserver(render); observer.observe(container);
  return {
    update(color, visualKey = 'preview') {
      const style = wagonStyle(color), description = WAGON_STYLES.find(s => s.model === style.model);
      const key = `${color}:${visualKey}`;
      const variants = wagonVariants(style.model);
      if (current !== key) {
        current = key; currentColor = color; currentVisualKey = visualKey;
        if (gallery) container.scrollLeft = 0;
        if (train) {
          for (const { stage } of items) stage.remove();
          items = variants.map(({ id, label }) => {
            const stage = document.createElement('div');
            stage.className = 'wagon-preview-item'; stage.dataset.variant = id;
            stage.setAttribute('role', 'img'); container.append(stage);
            const appearance = { ...wagonAppearance(style.model, `${visualKey}:${id}`), variant: id };
            return { stage, label, appearance };
          });
        }
      }
      for (const item of items) {
        item.stage.setAttribute('aria-label', `${translate(description.label)}: ${translate(item.label)}`);
      }
      render(); return { ...description, variantCount: variants.length };
    },
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', visible);
      mobile?.removeEventListener('change', render);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      meshes.forEach(mesh => mesh.dispose()); wagons.dispose(); shadow.geometry.dispose(); shadow.material.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      for (const { stage } of items) stage.remove();
      container.classList.remove('wagon-preview-train');
    },
  };
}
