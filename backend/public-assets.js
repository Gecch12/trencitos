"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
// Public URLs are a transport contract, independent of the repository layout.
// Never expose a directory wholesale: shared modules are public only if listed.
const ASSETS = Object.freeze({
  "/profile-style.js": ["frontend/profile-style.js", "text/javascript; charset=utf-8"],
  ...Object.fromEntries([
    'passenger', 'tanker', 'alfalfa', 'grain', 'goods', 'timber', 'auto-carrier', 'coal', 'stone', 'mail',
    'steel', 'crane', 'wine', 'tractors', 'cement', 'fruit', 'flowers', 'boat', 'dwelling', 'circus',
  ].map(model => [`/assets/wagons/${model}.png`, [`frontend/assets/wagons/${model}.png`, 'image/png']])),
  "/profile-rules.js": ["shared/profile-rules.js", "text/javascript; charset=utf-8"],
  "/profile-summary.js": ["frontend/profile-summary.js", "text/javascript; charset=utf-8"],
  "/postgame.js": ["frontend/postgame.js", "text/javascript; charset=utf-8"],
  "/score-recount.js": ["frontend/score-recount.js", "text/javascript; charset=utf-8"],
  "/score-medals.js": ["frontend/score-medals.js", "text/javascript; charset=utf-8"],
  "/postgame.css": ["frontend/postgame.css", "text/css; charset=utf-8"],
  "/profile-ui.js": ["frontend/profile-ui.js", "text/javascript; charset=utf-8"],
  "/profile.css": ["frontend/profile.css", "text/css; charset=utf-8"],
  "/assets/avatars/capybara.png": ["frontend/assets/avatars/capybara.png", "image/png"],
  "/turn-history.js": ["frontend/turn-history.js", "text/javascript; charset=utf-8"],
  "/": ["frontend/index.html", "text/html; charset=utf-8"],
  "/index.html": ["frontend/index.html", "text/html; charset=utf-8"],
  "/privacy.html": ["frontend/privacy.html", "text/html; charset=utf-8"],
  "/privacy.css": ["frontend/privacy.css", "text/css; charset=utf-8"],
  "/board-3d.js": ["frontend/board-3d.js", "text/javascript; charset=utf-8"],
  "/ticket-map.js": ["frontend/ticket-map.js", "text/javascript; charset=utf-8"],
  "/tunnel-board.js": ["frontend/tunnel-board.js", "text/javascript; charset=utf-8"],
  "/destination-planner.js": ["frontend/destination-planner.js", "text/javascript; charset=utf-8"],
  "/destination-map.css": ["frontend/destination-map.css", "text/css; charset=utf-8"],
  "/wagon-renderer.js": ["frontend/wagon-renderer.js", "text/javascript; charset=utf-8"],
  "/wagon-preview.js": ["frontend/wagon-preview.js", "text/javascript; charset=utf-8"],
  "/wagon-models.mjs": ["frontend/wagon-models.mjs", "text/javascript; charset=utf-8"],
  "/board-camera.js": ["frontend/board-camera.js", "text/javascript; charset=utf-8"],
  "/board-3d.css": ["frontend/board-3d.css", "text/css; charset=utf-8"],
  "/vendor/three.module.js": ["node_modules/three/build/three.module.js", "text/javascript; charset=utf-8"],
  "/vendor/three.core.js": ["node_modules/three/build/three.core.js", "text/javascript; charset=utf-8"],
  "/app.js": ["frontend/app.js", "text/javascript; charset=utf-8"],
  "/connection.js": ["frontend/connection.js", "text/javascript; charset=utf-8"],
  "/mobile-runtime.js": ["frontend/mobile-runtime.js", "text/javascript; charset=utf-8"],
  "/manifest.webmanifest": ["frontend/manifest.webmanifest", "application/manifest+json; charset=utf-8"],
  "/pwa.js": ["frontend/pwa.js", "text/javascript; charset=utf-8"],
  "/service-worker.js": ["frontend/service-worker.js", "text/javascript; charset=utf-8"],
  "/offline.html": ["frontend/offline.html", "text/html; charset=utf-8"],
  "/offline.css": ["frontend/offline.css", "text/css; charset=utf-8"],
  "/offline.js": ["frontend/offline.js", "text/javascript; charset=utf-8"],
  "/assets/icons/app-180.png": ["frontend/assets/icons/app-180.png", "image/png"],
  "/assets/icons/app-192.png": ["frontend/assets/icons/app-192.png", "image/png"],
  "/assets/icons/app-512.png": ["frontend/assets/icons/app-512.png", "image/png"],
  "/mobile-bridge.js": ["frontend/mobile-bridge.js", "text/javascript; charset=utf-8"],
  "/style.css": ["frontend/style.css", "text/css; charset=utf-8"],
  "/maps/europe-v1.js": ["shared/maps/europe-v1.js", "text/javascript; charset=utf-8"],
  "/maps/europe-legacy-v1.js": ["shared/maps/europe-legacy-v1.js", "text/javascript; charset=utf-8"],
  "/data.js": ["shared/data.js", "text/javascript; charset=utf-8"],
  "/layouts/europe-v1.js": ["frontend/layouts/europe-v1.js", "text/javascript; charset=utf-8"],
  "/layouts/laboratory-v1.js": ["frontend/layouts/laboratory-v1.js", "text/javascript; charset=utf-8"],
  "/layouts/south-america-v3.3-beta.js": ["frontend/layouts/south-america-v3.3-beta.js", "text/javascript; charset=utf-8"],
  "/map-options.js": ["shared/map-options.js", "text/javascript; charset=utf-8"],
  "/match-presentation.js": ["frontend/match-presentation.js", "text/javascript; charset=utf-8"],
  "/map-layout.js": ["frontend/map-layout.js", "text/javascript; charset=utf-8"],
  "/game-timing.js": ["shared/game-timing.js", "text/javascript; charset=utf-8"],
  "/game-ui.js": ["frontend/game-ui.js", "text/javascript; charset=utf-8"],
  "/table-ui.js": ["frontend/table-ui.js", "text/javascript; charset=utf-8"],
  "/table.css": ["frontend/table.css", "text/css; charset=utf-8"],
  "/draw-intent.js": ["frontend/draw-intent.js", "text/javascript; charset=utf-8"],
  "/game.css": ["frontend/game.css", "text/css; charset=utf-8"],
  "/responsive.css": ["frontend/responsive.css", "text/css; charset=utf-8"],
  "/lobby.css": ["frontend/lobby.css", "text/css; charset=utf-8"],
  "/lobby-ui.js": ["shared/lobby-ui.js", "text/javascript; charset=utf-8"],
  "/account-ui.js": ["frontend/account-ui.js", "text/javascript; charset=utf-8"],
  "/translations.js": ["shared/translations.js", "text/javascript; charset=utf-8"],
  "/replay-state.js": ["shared/replay-state.js", "text/javascript; charset=utf-8"],
  "/replay-ui.js": ["frontend/replay-ui.js", "text/javascript; charset=utf-8"],
  "/replay.css": ["frontend/replay.css", "text/css; charset=utf-8"],
  "/history-ui.js": ["frontend/history-ui.js", "text/javascript; charset=utf-8"],
  "/i18n.js": ["shared/i18n.js", "text/javascript; charset=utf-8"],
  "/room-map-picker.js": ["frontend/room-map-picker.js", "text/javascript; charset=utf-8"],
  "/room-setup.css": ["frontend/room-setup.css", "text/css; charset=utf-8"],
  "/shell.js": ["frontend/shell.js", "text/javascript; charset=utf-8"],
  "/shell.css": ["frontend/shell.css", "text/css; charset=utf-8"],
  "/shell-icons.js": ["frontend/shell-icons.js", "text/javascript; charset=utf-8"],
  "/wagon-people.mjs": ["frontend/wagon-people.mjs", "text/javascript; charset=utf-8"],
});
const CSP = "default-src 'self'; connect-src 'self' ws: wss: blob:; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
function servePublicAsset(pathname, res) {
  let asset = Object.hasOwn(ASSETS, pathname) ? ASSETS[pathname] : null;
  if (!asset && /^\/assets\/(?:cards\/[a-z]+|favicon|ticket)\.svg$/.test(pathname)) {
    const file = "frontend" + pathname;
    if (fs.existsSync(path.join(ROOT, file))) asset = [file, "image/svg+xml; charset=utf-8"];
  }
  if (!asset) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": asset[1],
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": CSP,
  });
  const stream = fs.createReadStream(path.join(ROOT, asset[0]));
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}
module.exports = { servePublicAsset, ASSETS };
