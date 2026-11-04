"use strict";

globalThis.TrencitosConnection = (() => {
  const packaged = !!globalThis.TRENCITOS_BUILD?.server;
  const origin = packaged ? new URL(globalThis.TRENCITOS_BUILD.server).origin : location.origin;
  let guest;
  function credential() {
    if (!guest) {
      const key = "trencitos-native-guest:" + origin;
      guest = localStorage.getItem(key);
      if (!/^[a-f0-9]{64}$/.test(guest || "")) {
        guest = [...crypto.getRandomValues(new Uint8Array(32))].map(value => value.toString(16).padStart(2, "0")).join("");
        localStorage.setItem(key, guest);
      }
    }
    return guest;
  }
  function request(path, options = {}) {
    if (!packaged) return fetch(path, options);
    if (!/^\/api\/(?:account|history)(?:[/?]|$)/.test(path)) throw Error("Ruta móvil no permitida.");
    const url = new URL(path, origin);
    if (url.origin !== origin) throw Error("Servidor móvil inválido.");
    const headers = new Headers(options.headers);
    headers.set("X-Trencitos-Guest", credential());
    return fetch(url, { ...options, credentials: "omit", cache: "no-store", headers });
  }
  function socket() {
    const url = new URL("/socket", origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return packaged ? new WebSocket(url, ["trencitos.v1", "guest." + credential()]) : new WebSocket(url);
  }
  return { packaged, request, socket, publicUrl: path => new URL(path, origin).href };
})();
