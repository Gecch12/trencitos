"use strict";

// Local development only. Use the mobile:* scripts to choose the target.
module.exports = require("./scripts/mobile-config").mobileConfig(process.env.TRENCITOS_PLATFORM);
