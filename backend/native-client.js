"use strict";

// Packaged clients use an explicit guest identity and optional sealed native
// session. Browser cookies are never accepted across this boundary.
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
  const account=/^\/api\/account(?:\/(?:profile|room-profile|logout|rooms|link|recover|social|unlink|native\/(?:start|exchange)))?$/.test(url.pathname);
  const allowed = account || url.pathname === "/api/stats" || url.pathname === "/healthz" || /^\/api\/history(?:\/|$)/.test(url.pathname);
  const methods=url.pathname==='/api/account/social'?['GET','POST']:account&&!['/api/account','/api/account/rooms','/api/account/room-profile'].includes(url.pathname)?['POST']:['GET'];
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Origin");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const fail = status => { res.writeHead(status); res.end(JSON.stringify({ message: "Solicitud móvil no permitida." })); return true; };
  if (!allowed) return fail(403);
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Access-Control-Expose-Headers", "X-Trencitos-Session");
  if (req.method === "OPTIONS") {
    const headers = (req.headers["access-control-request-headers"] || "").toLowerCase().split(",").map(value => value.trim()).filter(Boolean);
    if (!methods.includes(req.headers["access-control-request-method"]) || headers.some(value => !["x-trencitos-guest", "x-trencitos-session", "content-type", "accept"].includes(value))) return fail(403);
    res.setHeader("Access-Control-Allow-Methods", methods.join(', '));
    res.setHeader("Access-Control-Allow-Headers", "X-Trencitos-Guest, X-Trencitos-Session, Content-Type, Accept");
    res.writeHead(204); res.end(); return true;
  }
  if (!methods.includes(req.method) || !nativeToken(req)) return fail(401);
  // Ignore even a deliberately supplied browser cookie at this boundary.
  req.headers.cookie = "";
  return false;
}
module.exports = { isNativeRequest, nativeToken, handleNativeHttp, PROTOCOL };
