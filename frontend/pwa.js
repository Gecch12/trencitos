"use strict";

// Native bundles already contain their interface and do not install web workers.
if (!globalThis.Capacitor?.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {}));
}
