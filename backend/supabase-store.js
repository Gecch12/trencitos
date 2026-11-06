"use strict";
const { randomUUID } = require("node:crypto");
const { serializableRoom, validateRooms } = require("./room-store");

// Server-only Data API client. Negotiate per-room transactions when available;
// retain the legacy checkpoint protocol for a compatible rolling transition.
function createSupabaseStore({ url, secret, fetchImpl = fetch, timeout = 5000, span = (_name, work) => work() }) {
  let base;
  try { base = new URL(url); } catch { throw new Error("SUPABASE_URL inválida."); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/")
    throw new Error("SUPABASE_URL debe ser el origen HTTPS del proyecto.");
  if (!secret || !secret.startsWith("sb_secret_"))
    throw new Error("Configura SUPABASE_SECRET_KEY con una clave secreta sb_secret_, solo en el servidor.");
  const writer = randomUUID();
  let version = null, fenced = false, roomDeltaSupported = false, perRoom = false;
  const roomVersions = new Map(), roomCodes = new Set(), fencedRooms = new Set();
  function failure(code) {
    const error = new Error(code === "STORE_CONFLICT" ? "Otra instancia tomó el control del almacenamiento. Reconecta al nuevo servidor."
      : "No se pudo confirmar el guardado remoto. Reinicia el servidor para recuperar el último estado confirmado.");
    error.code = code;
    return error;
  }
  async function rpc(name, body, requestTimeout = timeout) {
    // Reuse the exact commit ID after a lost response: SQL makes retries
    // idempotent. Never print provider bodies, request headers or credentials.
    const checkpoint = name.startsWith('ferrovia_save_checkpoint') || name === 'trencitos_save_rooms';
    const requestBody = checkpoint ? span('checkpointJSON', () => JSON.stringify(body)) : JSON.stringify(body);
    const request = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(new URL(`/rest/v1/rpc/${name}`, base), {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(requestTimeout),
          headers: { apikey: secret, "Content-Type": "application/json" },
          body: requestBody,
        });
        if (!response.ok) {
          const details = await response.json().catch(() => ({}));
          if (details.message === "GUEST_ALREADY_CLAIMED") throw Object.assign(Error("Este historial ya pertenece a otra cuenta."),{status:409,code:"GUEST_ALREADY_CLAIMED"});
          if (details.message === "FERROVIA_WRITER_CONFLICT") throw failure("STORE_CONFLICT");
          if (details.message === "FERROVIA_ROOM_CONFLICT") throw failure("STORE_ROOM_CONFLICT");
          if (response.status < 500) throw failure("STORE_UNAVAILABLE");
          throw new Error("Remote storage unavailable");
        }
        return await response.json();
      } catch (error) {
        if (error.code || attempt === 1) throw error.code ? error : failure("STORE_UNCERTAIN");
      }
    }
    };
    return checkpoint ? span('checkpointRPC', request) : request();
  }
  async function saveCheckpoint({ rooms: data, archive, roomDelta }) {
    if (fenced || version === null) throw failure("STORE_CONFLICT");
    if (perRoom) {
      const changed = roomDelta?.changed || data;
      const live = new Set(data.map(room => room.code));
      const removed = roomDelta?.removed || [...roomCodes].filter(code => !live.has(code));
      const changes = [...changed.map(room => ({code:room.code,version:roomVersions.get(room.code)||0,room})),
        ...removed.map(code => ({code,version:roomVersions.get(code)||0,room:null}))];
      if (changes.some(change => fencedRooms.has(change.code))) throw failure('STORE_ROOM_CONFLICT');
      const commit = randomUUID();
      try {
        const result = await rpc('trencitos_save_rooms', {p_writer:writer,p_commit:commit,p_changes:changes,p_archive:archive||[]});
        if (result?.commit !== commit || !result.versions || Object.keys(result.versions).length !== changes.length ||
          changes.some(change => result.versions[change.code] !== change.version + 1)) throw failure('STORE_UNCERTAIN');
        for (const change of changes) {
          roomVersions.set(change.code, result.versions[change.code]);
          if (change.room) roomCodes.add(change.code); else roomCodes.delete(change.code);
        }
      } catch (error) {
        if (error.code === 'STORE_CONFLICT') fenced = true;
        for (const change of changes) fencedRooms.add(change.code);
        throw error;
      }
      return;
    }
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
  async function* iterateFrames(id,steps){
    if(!Number.isSafeInteger(steps)||steps<1)throw failure("STORE_UNAVAILABLE");
    for(let from=0;from<steps;from+=16){
      const count=Math.min(16,steps-from),page=await rpc("trencitos_read_frames",{p_match:id,p_from:from,p_count:count},Math.max(timeout,15000));
      if(!Array.isArray(page)||page.length!==count||page.some((frame,i)=>frame.seq!==from+i))throw failure("STORE_UNAVAILABLE");
      for(const frame of page)yield frame;
    }
  }
  return {
    get perRoom() { return perRoom; },
    async readRoom(code) {
      if(!perRoom||fenced)throw failure('STORE_CONFLICT');
      let result;
      try { result=await rpc('trencitos_read_room',{p_writer:writer,p_code:code}); }
      catch(error){if(error.code==='STORE_CONFLICT')fenced=true;throw error;}
      if(!result||!Number.isSafeInteger(result.version)||result.version<0||
        (result.room!==null&&(!result.room||result.room.code!==code)))throw failure('STORE_UNAVAILABLE');
      validateRooms(result.room?[result.room]:[]);
      return result;
    },
    acceptRecovery(code,result) {
      roomVersions.set(code,result.version);fencedRooms.delete(code);
      if(result.room)roomCodes.add(code);else roomCodes.delete(code);
    },
    statisticsSnapshot(filters) {return rpc("trencitos_statistics_snapshot",{p_filters:filters});},
    closeMissing(ids) { return rpc("trencitos_close_missing", {p_writer:writer,p_live:ids}); },
    readArchive(identity,id) { return rpc("trencitos_read_archive_summary", {p_guest:identity.guestId||null,p_account:identity.accountId||null,p_match:id||null}); },
    iterateFrames,
    async readFrames(id,steps){const frames=[];for await(const frame of iterateFrames(id,steps))frames.push(frame);return frames;},
    claimGuest(guestId,accountId) { return rpc("trencitos_claim_guest", {p_guest:guestId,p_account:accountId}); },
    async load() {
      const checkpoint = await rpc("ferrovia_claim_checkpoint", { p_writer: writer });
      if (checkpoint?.schema_version !== 1 || !Number.isSafeInteger(checkpoint.version) || checkpoint.version < 0)
        throw new Error("Versión de almacenamiento remoto no compatible; no se sobrescribió nada.");
      validateRooms(checkpoint.rooms);
      version = checkpoint.version;
      roomDeltaSupported = checkpoint.capabilities?.roomDelta === 1;
      if (checkpoint.capabilities?.roomTransactions === 1) {
        const claimed = await rpc('trencitos_claim_rooms', {p_writer:writer});
        if (!claimed?.versions || Object.values(claimed.versions).some(v => !Number.isSafeInteger(v) || v < 0))
          throw failure('STORE_UNAVAILABLE');
        for (const [code, revision] of Object.entries(claimed.versions)) roomVersions.set(code, revision);
        for (const room of checkpoint.rooms) {
          if (!roomVersions.has(room.code)) throw failure('STORE_UNAVAILABLE');
          roomCodes.add(room.code);
        }
        perRoom = true;
      }
      return checkpoint.rooms;
    },
    saveCheckpoint,
    async save(rooms, archive) {
      if (fenced || version === null) throw failure("STORE_CONFLICT");
      return saveCheckpoint({ rooms: [...rooms.values()].map(serializableRoom), archive });
    },
  };
}
module.exports = { createSupabaseStore };
