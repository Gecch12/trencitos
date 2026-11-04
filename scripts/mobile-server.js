"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { mobilePort } = require("./mobile-config");
const ROOT = path.resolve(__dirname, "..");

async function startMobileServer({ port = mobilePort(), stateFile = path.join(ROOT, ".qa/mobile/rooms.json") } = {}) {
  // Override inherited settings before loading any application modules.
  process.env.STATE_BACKEND = "file";
  process.env.STATE_FILE = stateFile;
  process.env.AUTH_ENABLED = "false";
  process.env.RENDER = "false";
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const app = require("../backend/server");
  app.server.prependListener("request", (_req, res) => {
    res.setHeader("X-Trencitos-Development", "capacitor");
  });
  await app.ready;
  await new Promise((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(port, "127.0.0.1", () => {
      app.server.removeListener("error", reject);
      resolve();
    });
  });
  return app;
}

if (require.main === module) {
  startMobileServer().then(app => {
    console.log(`Trencitos móvil: http://localhost:${app.server.address().port} · invitados · almacenamiento local`);
    console.log("Mantén esta terminal abierta. En otra: npm run mobile:ios o npm run mobile:android");
    process.once("SIGINT", () => app.shutdown());
    process.once("SIGTERM", () => app.shutdown());
  }).catch(error => {
    console.error(error.code === "EADDRINUSE" ? "El puerto móvil está ocupado. Usa el servidor existente de esta tarea o elige TRENCITOS_MOBILE_PORT." : error.message);
    process.exit(1);
  });
}

module.exports = { startMobileServer };
