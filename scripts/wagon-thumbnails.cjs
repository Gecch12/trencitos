// Regenerate the lightweight profile catalog with the actual board renderer.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const { servePublicAsset } = require('../backend/public-assets');

(async () => {
  const output = path.resolve(__dirname, '../frontend/assets/wagons');
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end('<!doctype html><html><head><link rel="icon" href="data:,"><style>body{margin:0}#stage{width:240px;height:144px}canvas{display:block}</style></head><body><div id="stage"></div></body></html>');
    }
    servePublicAsset(new URL(req.url, 'http://localhost').pathname, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 240, height: 144 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const styles = await page.evaluate(async () => {
      const { createWagonPreview } = await import('/wagon-preview.js');
      const { WAGON_STYLES } = await import('/wagon-models.mjs');
      window.preview = createWagonPreview({ container: document.querySelector('#stage'), onFailure: () => { throw Error('WebGL context lost'); } });
      return WAGON_STYLES;
    });
    for (const style of styles) {
      await page.evaluate(async color => {
        window.preview.update(color, 'profile-thumbnail');
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, style.color);
      await page.locator('canvas').screenshot({ path: path.join(output, `${style.model}.png`), omitBackground: true });
    }
    await page.evaluate(() => window.preview.dispose());
    console.log(`Generated ${styles.length} wagon thumbnails in ${output}`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
