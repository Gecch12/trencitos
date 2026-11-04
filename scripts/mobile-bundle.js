"use strict";
const fs = require("node:fs"), path = require("node:path");
const { ASSETS } = require("../backend/public-assets");
const { betaServer } = require("./mobile-config");
const ROOT = path.resolve(__dirname, "..");
function bundleMobile({ server = betaServer(), output = path.join(ROOT, "mobile/bundle") } = {}) {
  const version = require("../package.json").version;
  const assets = { ...ASSETS };
  for (const file of fs.readdirSync(path.join(ROOT, "frontend/assets/cards"))) {
    if (/^[a-z]+\.svg$/.test(file)) assets["/assets/cards/" + file] = ["frontend/assets/cards/" + file];
  }
  for (const name of ["ticket", "favicon"]) assets[`/assets/${name}.svg`] = [`frontend/assets/${name}.svg`];
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  for (const [url, [source]] of Object.entries(assets)) {
    const target = path.join(output, url === "/" ? "index.html" : url.slice(1));
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(ROOT, source), target);
  }
  fs.writeFileSync(path.join(output, "mobile-runtime.js"), `"use strict";\nglobalThis.TRENCITOS_BUILD = Object.freeze(${JSON.stringify({ server, version })});\n`);
  const ws = server.replace(/^http/, "ws");
  const csp = `default-src 'self'; connect-src 'self' ${server} ${ws} blob:; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'`;
  const html = fs.readFileSync(path.join(output, "index.html"), "utf8").replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
  fs.writeFileSync(path.join(output, "index.html"), html);
  console.log(`Interfaz ${version} incluida en el paquete; servidor ${server}.`);
  return { output, server, version };
}
if (require.main === module) bundleMobile();
module.exports = { bundleMobile };
