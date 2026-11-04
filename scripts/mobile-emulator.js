"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

try {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), "Library/Android/sdk");
  const emulator = path.join(sdk, "emulator/emulator");
  const avds = execFileSync(emulator, ["-list-avds"], { encoding: "utf8" }).trim().split(/\r?\n/).filter(Boolean);
  const avd = process.argv[2] || process.env.TRENCITOS_ANDROID_AVD || (avds.includes("Trencitos_API_36") ? "Trencitos_API_36" : avds[0]);
  if (!avd || !avds.includes(avd)) throw new Error(`Elige un AVD instalado: ${avds.join(", ") || "crea uno en Android Studio"}`);
  console.log(`Iniciando ${avd} con OpenGL. Espera a ver Inicio y ejecuta npm run mobile:android en otra terminal.`);
  // Use the Mac's GPU without the emulator's Vulkan bridge; avoid stale snapshots.
  const result = spawnSync(emulator, ["-avd", avd, "-gpu", "host", "-feature", "-Vulkan", "-memory", "3072", "-no-snapshot", "-grpc-use-jwt", "-no-metrics", "-crash-report-mode", "never"], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? (result.signal === "SIGINT" ? 0 : 1);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
