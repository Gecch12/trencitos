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
  return {
    prepare(repository) {
      return { rooms: roomRecords(repository), archive: structuredClone(archive.pending) };
    },
    async commit(batch) {
      await store.saveCheckpoint(batch);
      archive.commit();
    },
  };
}

module.exports = { createFileCheckpointCommitter, createRemoteCheckpointCommitter };
