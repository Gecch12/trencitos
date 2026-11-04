"use strict";
// Export the project's existing SVG identity for installable web/native apps.
const fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const svg = fs.readFileSync(path.join(ROOT, "frontend/assets/favicon.svg"), "utf8");
    async function icon(file, size, padding = .12) {
      const data = await page.evaluate(async ({ svg, size, padding }) => {
        const image = new Image(); image.src = "data:image/svg+xml;base64," + btoa(svg); await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d"); ctx.fillStyle = "#173b50"; ctx.fillRect(0, 0, size, size);
        ctx.drawImage(image, size * padding, size * padding, size * (1 - 2 * padding), size * (1 - 2 * padding));
        return canvas.toDataURL("image/png").split(",")[1];
      }, { svg, size, padding });
      fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, file), Buffer.from(data, "base64"));
    }
    for (const size of [180, 192, 512]) await icon(`frontend/assets/icons/app-${size}.png`, size);
    await icon("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024);
    for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
      for (const name of ["ic_launcher", "ic_launcher_round"]) await icon(`android/app/src/main/res/mipmap-${density}/${name}.png`, size);
      await icon(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, size * 108 / 48, .22);
    }
    console.log("Iconos exportados desde assets/favicon.svg.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
