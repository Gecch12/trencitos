"use strict";

// Packaged Capacitor clients have a local origin. They use guest credentials,
// never browser account cookies, and receive access only to the guest API.
const ORIGINS = new Set(["capacitor://localhost", "https://localhost"]);
const TOKEN = /^[a-f0-9]{64}$/;
const PROTOCOL = "trencitos.v1";
function isNativeRequest(req) { return ORIGINS.has(req.headers.origin); }
function nativeToken(req) {
  if (!isNativeRequest(req)) return null;
  const protocols = (req.headers["sec-websocket-protocol"] || "").split(",").map(value => value.trim());
  const value = req.headers.upgrade?.toLowerCase() === "websocket"
    ? (protocols.includes(PROTOCOL) ? protocols.find(value => value.startsWith("guest."))?.slice(6) : null)
    : req.headers["x-trencitos-guest"];
  return TOKEN.test(value || "") ? value : null;
}
function handleNativeHttp(req, res, url) {
  if (!isNativeRequest(req)) return false;
  const allowed = url.pathname === "/api/account" || url.pathname === "/healthz" || /^\/api\/history(?:\/|$)/.test(url.pathname);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const fail = status => { res.writeHead(status); res.end(JSON.stringify({ message: "Solicitud móvil no permitida." })); return true; };
  if (!allowed) return fail(403);
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  if (req.method === "OPTIONS") {
    const headers = (req.headers["access-control-request-headers"] || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
    if (req.headers["access-control-request-method"] !== "GET" || headers.some(value => !["x-trencitos-guest", "accept"].includes(value))) return fail(403);
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Access-Control-Allow-Headers", "X-Trencitos-Guest, Accept");
    res.writeHead(204); res.end(); return true;
  }
  if (req.method !== "GET" || !nativeToken(req)) return fail(401);
  // Ignore even a deliberately supplied browser cookie at this boundary.
  req.headers.cookie = "";
  if (url.pathname === "/api/account") {
    res.end(JSON.stringify({ enabled: false, profile: null, mobile: true })); return true;
  }
  return false;
}
module.exports = { isNativeRequest, nativeToken, handleNativeHttp, PROTOCOL };
