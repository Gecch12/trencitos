"use strict";
const { serializableRoom, saveCheckpoint } = require("../../backend/room-store");

// Detach the durable room DTOs from mutable runtime objects before committing.
// Practice and multiplayer rooms share the same durable checkpoint as history.
const roomRecords = repository => structuredClone([...repository.values()].map(serializableRoom));

function createFileCheckpointCommitter({ file, archive }) {
  return {
    prepare(repository) {
      // Committed replay frames are immutable and shared, not cloned or serialized
      // again. The file store appends only the new tail before replacing its manifest.
      return { rooms: roomRecords(repository), archive: archive.prepare() };
    },
    commit(batch) {
      saveCheckpoint(file, batch);
      archive.commit(batch.archive);
    },
  };
}

function createRemoteCheckpointCommitter({ store, archive, blocked=()=>false }) {
  let committed=new Map(),initialized=false;
  return {
    prepare(repository, dirtyCodes=null, scope=null) {
      const rooms=[],changed=[];
      for(const room of repository.values()) {
        if(scope!==null && room.code!==scope)continue;
        const prior=committed.get(room.code);
        if(blocked(room)){if(prior)rooms.push(prior);continue;}
        const record=!prior||!dirtyCodes||dirtyCodes.has(room.code)?structuredClone(serializableRoom(room)):{...prior,savedAt:room.savedAt};
        rooms.push(record);if(!prior||!dirtyCodes||dirtyCodes.has(room.code))changed.push(record);
      }
      const live=new Set(rooms.map(r=>r.code));
      return {rooms,archive:structuredClone(archive.pending.filter(entry=>scope===null||entry.match.code===scope)),...(initialized?{roomDelta:{changed,removed:[...committed.keys()].filter(code=>(scope===null||code===scope)&&!live.has(code)),savedAt:Math.max(0,...rooms.map(r=>r.savedAt||0))}}:{})};
    },
    async commit(batch) {
      await store.saveCheckpoint(batch);
      if(batch.roomDelta){for(const room of batch.roomDelta.changed)committed.set(room.code,room);for(const code of batch.roomDelta.removed)committed.delete(code);}
      else committed=new Map(batch.rooms.map(room=>[room.code,room]));
      initialized=true;
      archive.commit(undefined,batch.archive);
    },
  };
}

module.exports = { createFileCheckpointCommitter, createRemoteCheckpointCommitter };
