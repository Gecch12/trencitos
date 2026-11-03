"use strict";
const { createHash } = require("node:crypto");

// Hash the complete JSON action, independently of object key order. Arrays keep
// their order; transport revision/ID and untrusted context are not part of it.
// Keep this encoding stable for persisted receipts, or add a versioned reader.
function fingerprintAction(action) {
  const canonical = JSON.stringify({ action }, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  return "sha256-json-v1:" + createHash("sha256").update(canonical).digest("hex");
}

module.exports = { fingerprintAction };
