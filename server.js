"use strict";
// Keep the existing Node/Render entry point while the implementation lives in backend/.
const app = require("./backend/server");
if (require.main === module) app.start();
module.exports = app;
