"use strict";
const { randomUUID } = require("node:crypto");
const { serializableRoom, validateRooms } = require("./room-store");

// Server-only Data API client. A single atomic checkpoint is deliberately
// sufficient for a private server with a handful of simultaneous rooms.
function createSupabaseStore({ url, secret, fetchImpl = fetch, timeout = 5000 }) {
  let base;
  try { base = new URL(url); } catch { throw new Error("SUPABASE_URL inválida."); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/")
    throw new Error("SUPABASE_URL debe ser el origen HTTPS del proyecto.");
  if (!secret || !secret.startsWith("sb_secret_"))
    throw new Error("Configura SUPABASE_SECRET_KEY con una clave secreta sb_secret_, solo en el servidor.");
  const writer = randomUUID();
  let version = null, fenced = false;
  function failure(code) {
    const error = new Error(code === "STORE_CONFLICT" ? "Otra instancia tomó el control del almacenamiento. Reconecta al nuevo servidor."
      : "No se pudo confirmar el guardado remoto. Reinicia el servidor para recuperar el último estado confirmado.");
    error.code = code;
    return error;
  }
  async function rpc(name, body) {
    // Reuse the exact commit ID after a lost response: SQL makes retries
    // idempotent. Never print provider bodies, request headers or credentials.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
          headers: { apikey: secret, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const details = await response.json().catch(() => ({}));
          if (details.message === "FERROVIA_WRITER_CONFLICT") throw failure("STORE_CONFLICT");
          if (response.status < 500) throw failure("STORE_UNAVAILABLE");
          throw new Error("Remote storage unavailable");
        }
        return await response.json();
      } catch (error) {
        if (error.code || attempt === 1) throw error.code ? error : failure("STORE_UNCERTAIN");
      }
    }
  }
  return {
    async load() {
      const checkpoint = await rpc("ferrovia_claim_checkpoint", { p_writer: writer });
      if (checkpoint?.schema_version !== 1 || !Number.isSafeInteger(checkpoint.version) || checkpoint.version < 0)
        throw new Error("Versión de almacenamiento remoto no compatible; no se sobrescribió nada.");
      validateRooms(checkpoint.rooms);
      version = checkpoint.version;
      return checkpoint.rooms;
    },
    async save(rooms) {
      if (fenced || version === null) throw failure("STORE_CONFLICT");
      const data = [...rooms.values()].filter(r => !r.practice).map(serializableRoom);
      const commit = randomUUID();
      try {
        const result = await rpc("ferrovia_save_checkpoint", {
          p_writer: writer, p_version: version, p_commit: commit, p_rooms: data,
        });
        if (result?.commit !== commit || result.version !== version + 1) throw failure("STORE_UNCERTAIN");
        version = result.version;
      } catch (error) {
        // A timeout may mean SQL committed but its response was lost. Do not
        // overwrite it with a rolled-back in-memory snapshot on "retry save".
        fenced = true;
        throw error;
      }
    },
  };
}
module.exports = { createSupabaseStore };
