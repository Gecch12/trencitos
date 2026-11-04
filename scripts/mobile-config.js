"use strict";

const DEFAULT_PORT = 3180;
const BETA_SERVER = "https://trencitos-swamp.onrender.com";

function betaServer(value = process.env.TRENCITOS_BETA_SERVER || BETA_SERVER, qa = process.env.TRENCITOS_MOBILE_QA === "1") {
  const url = new URL(value);
  const local = qa && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("La beta requiere un origen HTTPS público, sin credenciales ni ruta.");
  }
  if (!qa && (["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname) || url.hostname.endsWith(".local"))) throw new Error("La beta compartible no puede apuntar a la Mac.");
  return url.origin;
}

function mobilePort(value = process.env.TRENCITOS_MOBILE_PORT) {
  const port = value === undefined ? DEFAULT_PORT : Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("TRENCITOS_MOBILE_PORT debe ser un puerto entre 1024 y 65535.");
  }
  return port;
}

function mobileConfig(platform, portValue, mode = process.env.TRENCITOS_MOBILE_MODE) {
  const config = {
    appId: "com.trencitos.dev",
    appName: "Trencitos Dev",
    webDir: "mobile/web",
    android: { webContentsDebuggingEnabled: true },
    ios: { webContentsDebuggingEnabled: true },
  };
  if (mode === "beta") {
    const qa = process.env.TRENCITOS_MOBILE_QA === "1";
    return { ...config, appId: "com.trencitos.beta", appName: "Trencitos", webDir: "mobile/bundle", loggingBehavior: "debug",
      android: { webContentsDebuggingEnabled: qa, allowMixedContent: qa }, ios: { webContentsDebuggingEnabled: qa },
      server: { hostname: "localhost", androidScheme: "https", iosScheme: "capacitor", cleartext: qa } };
  }
  if (mode && mode !== "dev") throw new Error("Modo móvil inválido.");
  // Without an explicit development target the bundle only shows setup help.
  // A remote server URL must never silently become a production build setting.
  if (platform === undefined) return config;
  if (!["ios", "android"].includes(platform)) throw new Error("Plataforma móvil inválida.");
  const host = platform === "android" ? "10.0.2.2" : "localhost";
  config.server = {
    url: `http://${host}:${mobilePort(portValue)}`,
    cleartext: true,
    errorPath: "offline.html",
  };
  return config;
}

module.exports = { mobilePort, mobileConfig, betaServer, BETA_SERVER };
