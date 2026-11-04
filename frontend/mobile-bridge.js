"use strict";

// Capacitor injects the bridge in the native WebView. Browsers remain unchanged.
globalThis.TrencitosMobile = {
  async attach({ resume, back }) {
    const capacitor = globalThis.Capacitor;
    if (!capacitor?.isNativePlatform()) return;
    // Native plugin proxies are injected before this unbundled web client loads.
    const app = capacitor.Plugins.App;
    await app.addListener("appStateChange", ({ isActive }) => {
      if (isActive) resume();
    });
    if (capacitor.getPlatform() === "android") {
      await app.addListener("backButton", () => {
        if (!back()) app.minimizeApp().catch(console.error);
      });
    }
  },
};
