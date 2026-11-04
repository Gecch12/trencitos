"use strict";
const CACHE = "trencitos-offline-v1";
const OFFLINE = ["/offline.html", "/offline.css", "/offline.js", "/assets/icons/app-192.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(OFFLINE)));
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("trencitos-offline-") && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  // Never cache accounts, history, OAuth, room credentials or game responses.
  if (OFFLINE.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then(cached => cached || fetch(event.request)));
  } else if (event.request.mode === "navigate" && ["/", "/rooms", "/play", "/more", "/profile", "/replay"].includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
  }
});
