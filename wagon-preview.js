import * as THREE from './vendor/three.module.js';
import { createWagonRenderer } from './wagon-renderer.js';
import { WAGON_STYLES, wagonStyle } from './wagon-models.mjs';

// Same meshes and materials as the board, with a closer showroom camera.
export function createWagonPreview({ container, onFailure }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene(), meshes = [];
  const camera = new THREE.OrthographicCamera(-18, 18, 10, -10, .1, 200);
  camera.up.set(0, 0, 1); camera.position.set(24, -38, 29); camera.lookAt(0, 0, 4);
  scene.add(new THREE.HemisphereLight(0xfff9e8, 0x365466, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.position.set(-40, 40, 90); scene.add(sun);
  const dummy = new THREE.Object3D(), paint = new THREE.Color();
  const wagons = createWagonRenderer({ renderer, capacity: 1,
    instances(geometry, capacity, material) {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.count = 0; mesh.frustumCulled = false; meshes.push(mesh); scene.add(mesh); return mesh;
    },
    put(mesh, x, y, z, angle, sx, sy, sz, color) {
      dummy.position.set(x, -y, z); dummy.rotation.set(0, 0, -angle * Math.PI / 180); dummy.scale.set(sx, sy, sz); dummy.updateMatrix();
      const i = mesh.count++; mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, paint.set(color));
    },
  });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#4c513d', transparent: true, opacity: .12, depthWrite: false }));
  shadow.scale.set(11, 4.7, 1); shadow.position.z = -.01; scene.add(shadow);
  let frame = 0, disposed = false, current = null;
  function render() {
    if (frame || disposed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const w = container.clientWidth, h = container.clientHeight;
      if (disposed || !w || !h || document.hidden) return;
      renderer.setSize(w, h, false);
      const halfHeight = Math.max(7.5, 15 * h / w);
      camera.top = halfHeight; camera.bottom = -halfHeight;
      camera.left = -halfHeight * w / h; camera.right = halfHeight * w / h;
      camera.updateProjectionMatrix(); renderer.render(scene, camera);
    });
  }
  function lost(event) { event.preventDefault(); onFailure(); }
  function visible() { if (!document.hidden) render(); }
  renderer.domElement.addEventListener('webglcontextlost', lost);
  document.addEventListener('visibilitychange', visible);
  container.append(renderer.domElement);
  const observer = new ResizeObserver(render); observer.observe(container);
  return {
    update(color) {
      const style = wagonStyle(color), description = WAGON_STYLES.find(s => s.model === style.model);
      if (current !== color) {
        current = color;
        for (const mesh of meshes) mesh.count = 0;
        wagons.draw({ x: 0, y: 0, angle: 0 }, { color }, false);
        for (const mesh of meshes) {
          mesh.visible = mesh.count > 0; mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
      render(); return description;
    },
    dispose() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect();
      document.removeEventListener('visibilitychange', visible);
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      meshes.forEach(mesh => mesh.dispose()); wagons.dispose(); shadow.geometry.dispose(); shadow.material.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
