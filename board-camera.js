"use strict";
// Fixed tilt keeps the map's projection affine: SVG hit targets and Three.js
// share the same ground coordinates, with no second input/rules system.
const BoardCamera = (() => {
  const tilt = Math.PI / 7, compression = Math.cos(tilt);
  function view(bounds, viewport, safe, zoom, center, camera) {
    const v = camera({ ...bounds, y: bounds.y * compression, height: bounds.height * compression },
      viewport, safe, zoom, { x: center.x, y: center.y * compression });
    return { ...v, y: v.y / compression, height: v.height / compression,
      scaleY: v.scale / compression, focus: { x: v.focus.x, y: v.focus.y / compression } };
  }
  return { tilt, compression, view };
})();
if (typeof module !== "undefined") module.exports = BoardCamera;
