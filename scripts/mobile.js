"use strict";

const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { mobilePort, mobileConfig } = require("./mobile-config");
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const [action, platform, ...args] = process.argv.slice(2);
  if (!["run", "open", "sync"].includes(action) || !["ios", "android"].includes(platform)) {
    throw new Error("Uso: node scripts/mobile.js run|open|sync ios|android [--target ID]");
  }
  const beta = args.includes("--beta");
  if (beta) args.splice(args.indexOf("--beta"), 1);
  const port = mobilePort();
  if (action === "run" && !beta) {
    let response;
    try { response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(3000) }); }
    catch { throw new Error("Primero inicia el servidor en otra terminal: npm run mobile:server"); }
    const health = await response.json();
    if (!response.ok || !health.ok || health.storage !== "file" || response.headers.get("x-trencitos-development") !== "capacitor") {
      throw new Error("Ese puerto no corresponde al servidor móvil aislado. Usa npm run mobile:server.");
    }
  }
  const mode = beta ? "beta" : "dev";
  const env = { ...process.env, TRENCITOS_PLATFORM: platform, TRENCITOS_MOBILE_PORT: String(port), TRENCITOS_MOBILE_MODE: mode };
  if (beta) require("./mobile-bundle").bundleMobile();
  const config = mobileConfig(platform, String(port), mode);
  fs.writeFileSync(path.join(ROOT, "ios/mobile.generated.xcconfig"), `TRENCITOS_APP_ID = ${config.appId}\nTRENCITOS_APP_NAME = ${config.appName}\n`);
  if (platform === "android" && process.platform === "darwin") {
    env.ANDROID_HOME ||= path.join(os.homedir(), "Library/Android/sdk");
    if (!env.JAVA_HOME) {
      try { env.JAVA_HOME = execFileSync("/usr/libexec/java_home", ["-v", "21"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
      catch { throw new Error("Android requiere Java 21. Instala un JDK 21 o configura JAVA_HOME."); }
    }
  }
  const cli = path.join(ROOT, "node_modules/@capacitor/cli/bin/capacitor");
  const cap = command => {
    const result = spawnSync(process.execPath, [cli, ...command], { cwd: ROOT, env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Capacitor ${command[0]} terminó con error (${result.status}).`);
  };
  if (!fs.existsSync(path.join(ROOT, platform))) cap(["add", platform]);
  cap(["sync", platform]);
  if (action !== "sync") cap([action, platform, ...args]);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
