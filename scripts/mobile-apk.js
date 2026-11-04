"use strict";
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");
const { betaServer } = require("./mobile-config");
const ROOT = path.resolve(__dirname, "..");
try {
  // Distribution must never inherit a local QA URL or WebView debugging.
  const server = betaServer(process.env.TRENCITOS_BETA_SERVER, false);
  const env = { ...process.env, TRENCITOS_BETA_SERVER: server, TRENCITOS_MOBILE_QA: "0" };
  env.ANDROID_HOME ||= path.join(os.homedir(), "Library/Android/sdk");
  env.JAVA_HOME ||= execFileSync("/usr/libexec/java_home", ["-v", "21"], { encoding: "utf8" }).trim();
  const run = (command, args, cwd = ROOT) => {
    const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw Error(`${path.basename(command)} terminó con error (${result.status}).`);
  };
  run(process.execPath, ["scripts/mobile.js", "sync", "android", "--beta"]);
  const signing = path.join(ROOT, ".private/android-signing"), keystore = path.join(signing, "trencitos-release.p12"), password = path.join(signing, "password");
  fs.mkdirSync(signing, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(keystore)) {
    if (fs.existsSync(password)) throw Error("Hay una preparación de firma incompleta; revísala antes de crear otra clave.");
    fs.writeFileSync(password, crypto.randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
    run(path.join(env.JAVA_HOME, "bin/keytool"), ["-genkeypair", "-keystore", keystore, "-storetype", "PKCS12", "-storepass:file", password, "-keypass:file", password,
      "-alias", "trencitos", "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000", "-dname", "CN=Trencitos Beta"]);
    fs.chmodSync(keystore, 0o600);
  }
  if (!fs.existsSync(password)) throw Error("Falta la contraseña de la clave existente. Recupera el respaldo; no generes otra clave.");
  run("./gradlew", ["--no-daemon", "assembleRelease"], path.join(ROOT, "android"));
  const out = path.join(ROOT, "dist"), version = require("../package.json").version;
  fs.mkdirSync(out, { recursive: true });
  const apk = path.join(out, `trencitos-${version}.apk`), aligned = path.join(out, ".aligned.apk");
  const buildTools = path.join(env.ANDROID_HOME, "build-tools/36.0.0");
  run(path.join(buildTools, "zipalign"), ["-f", "-p", "4", "android/app/build/outputs/apk/release/app-release-unsigned.apk", aligned]);
  // PKCS12 uses the store password for this key. Passing the same file twice
  // makes apksigner consume a second line which does not exist.
  run(path.join(buildTools, "apksigner"), ["sign", "--ks", keystore, "--ks-key-alias", "trencitos", "--ks-pass", "file:" + password, "--out", apk, aligned]);
  run(path.join(buildTools, "apksigner"), ["verify", "--verbose", "--print-certs", apk]);
  fs.unlinkSync(aligned);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(apk)).digest("hex");
  fs.writeFileSync(apk + ".sha256", `${sha256}  ${path.basename(apk)}\n`);
  console.log(`APK firmado: ${apk}\nConserva una copia privada de .private/android-signing para poder publicar actualizaciones.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
