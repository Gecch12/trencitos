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
  let version = null, fenced = false, roomDeltaSupported = false;
  function failure(code) {
    const error = new Error(code === "STORE_CONFLICT" ? "Otra instancia tomó el control del almacenamiento. Reconecta al nuevo servidor."
      : "No se pudo confirmar el guardado remoto. Reinicia el servidor para recuperar el último estado confirmado.");
    error.code = code;
    return error;
  }
  async function rpc(name, body, requestTimeout = timeout) {
    // Reuse the exact commit ID after a lost response: SQL makes retries
    // idempotent. Never print provider bodies, request headers or credentials.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(requestTimeout),
          headers: { apikey: secret, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const details = await response.json().catch(() => ({}));
          if (details.message === "GUEST_ALREADY_CLAIMED") throw Object.assign(Error("Este historial ya pertenece a otra cuenta."),{status:409,code:"GUEST_ALREADY_CLAIMED"});
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
  async function saveCheckpoint({ rooms: data, archive, roomDelta }) {
    if (fenced || version === null) throw failure("STORE_CONFLICT");
    const commit = randomUUID();
    try {
      const incremental = roomDeltaSupported && roomDelta;
      const result = await rpc(incremental ? "ferrovia_save_checkpoint_delta" : archive ? "ferrovia_save_checkpoint_v2" : "ferrovia_save_checkpoint", {
        p_writer: writer, p_version: version, p_commit: commit,
        ...(incremental ? {p_changed:roomDelta.changed,p_removed:roomDelta.removed,p_saved_at:roomDelta.savedAt,p_archive:archive||[]} : {p_rooms:data,...(archive?{p_archive:archive}:{})}),
      });
      if (result?.commit !== commit || result.version !== version + 1) throw failure("STORE_UNCERTAIN");
      version = result.version;
    } catch (error) {
      // A timeout may mean SQL committed but its response was lost. Do not
      // overwrite it with a rolled-back in-memory snapshot on "retry save".
      fenced = true;
      throw error;
    }
  }
  return {
    closeMissing(ids) { return rpc("trencitos_close_missing", {p_writer:writer,p_live:ids}); },
    readArchive(identity,id) { return rpc("trencitos_read_archive_summary", {p_guest:identity.guestId||null,p_account:identity.accountId||null,p_match:id||null}); },
    async readFrames(id, steps) {
      if (!Number.isSafeInteger(steps) || steps < 1) throw failure("STORE_UNAVAILABLE");
      const frames = [];
      // A complete game can exceed 10 MB. Bound each transfer and authorize
      // before loading it; reading never acquires the checkpoint writer lease.
      for (let from = 0; from < steps; from += 48) {
        const pages = await Promise.all([0, 16, 32].filter(offset => from + offset < steps).map(offset => {
          const start = from + offset, count = Math.min(16, steps - start);
          return rpc("trencitos_read_frames", {p_match:id,p_from:start,p_count:count},Math.max(timeout,15000)).then(page => {
            if (!Array.isArray(page) || page.length !== count || page.some((frame,i) => frame.seq !== start+i)) throw failure("STORE_UNAVAILABLE");
            return page;
          });
        }));
        frames.push(...pages.flat());
      }
      return frames;
    },
    claimGuest(guestId,accountId) { return rpc("trencitos_claim_guest", {p_guest:guestId,p_account:accountId}); },
    async load() {
      const checkpoint = await rpc("ferrovia_claim_checkpoint", { p_writer: writer });
      if (checkpoint?.schema_version !== 1 || !Number.isSafeInteger(checkpoint.version) || checkpoint.version < 0)
        throw new Error("Versión de almacenamiento remoto no compatible; no se sobrescribió nada.");
      validateRooms(checkpoint.rooms);
      version = checkpoint.version;
      roomDeltaSupported = checkpoint.capabilities?.roomDelta === 1;
      return checkpoint.rooms;
    },
    saveCheckpoint,
    async save(rooms, archive) {
      if (fenced || version === null) throw failure("STORE_CONFLICT");
      return saveCheckpoint({ rooms: [...rooms.values()].filter(r => !r.practice).map(serializableRoom), archive });
    },
  };
}
module.exports = { createSupabaseStore };
