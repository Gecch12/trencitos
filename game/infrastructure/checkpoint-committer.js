"use strict";
const { serializableRoom, saveCheckpoint } = require("../../backend/room-store");

// Detach the durable room DTOs from mutable runtime objects before committing.
// Practice rooms are temporary, but their history participates in the checkpoint.
const roomRecords = repository => structuredClone([...repository.values()].filter(room => !room.practice).map(serializableRoom));

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

function createRemoteCheckpointCommitter({ store, archive }) {
  let committed=new Map(),initialized=false;
  return {
    prepare(repository, dirtyCodes=null) {
      const rooms=[],changed=[];
      for(const room of repository.values()) {
        if(room.practice)continue;
        const prior=committed.get(room.code);
        const record=!prior||!dirtyCodes||dirtyCodes.has(room.code)?structuredClone(serializableRoom(room)):{...prior,savedAt:room.savedAt};
        rooms.push(record);if(!prior||!dirtyCodes||dirtyCodes.has(room.code))changed.push(record);
      }
      const live=new Set(rooms.map(r=>r.code));
      return {rooms,archive:structuredClone(archive.pending),...(initialized?{roomDelta:{changed,removed:[...committed.keys()].filter(code=>!live.has(code)),savedAt:Math.max(0,...rooms.map(r=>r.savedAt||0))}}:{})};
    },
    async commit(batch) {
      await store.saveCheckpoint(batch);
      committed=new Map(batch.rooms.map(room=>[room.code,room]));initialized=true;
      archive.commit();
    },
  };
}

module.exports = { createFileCheckpointCommitter, createRemoteCheckpointCommitter };
