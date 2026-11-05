"use strict";

// repository is the live room collection (get/values), not a per-card store.
// A checkpoint commits all rooms and history together. With deferCommit, persist
// only marks the serialized job dirty; its outer queue calls commit before delivery.
function createCheckpointHandler({ repository, committer, now, deferCommit,
  onLocalCommit, onLocalFailure }) {
  let dirtyCodes = new Set(), allDirty = false;
  function stampRooms() {
    for (const room of repository.values()) room.savedAt = now();
  }
  function commit() {
    const batch = committer.prepare(repository, allDirty ? null : dirtyCodes);
    const result=committer.commit(batch);
    dirtyCodes=new Set();allDirty=false;
    return result;
  }
  function persist(room) {
    if(room)dirtyCodes.add(room.code);else allDirty=true;
    if (deferCommit) {
      stampRooms();
      deferCommit();
      return true;
    }
    try {
      stampRooms();
      commit(); // The local committer is synchronous, including history acceptance.
      onLocalCommit();
      return true;
    } catch (error) {
      onLocalFailure(error);
      return false;
    }
  }
  return { persist, commit };
}

module.exports = { createCheckpointHandler };
