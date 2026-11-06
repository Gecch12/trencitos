"use strict";

// repository is the live room collection (get/values), not a per-card store.
// A checkpoint commits all rooms and history together. With deferCommit, persist
// only marks the serialized job dirty; its outer queue calls commit before delivery.
function createCheckpointHandler({ repository, committer, now, deferCommit,
  onLocalCommit, onLocalFailure, transaction = () => null }) {
  const fallback = { dirtyCodes:new Set(), allDirty:false };
  const current = () => { const tx=transaction();if(!tx)return fallback;return tx.checkpoint ||= {dirtyCodes:new Set(),allDirty:false}; };
  function stampRooms() {
    const key=transaction()?.key;
    for (const room of repository.values()) if(key==null||room.code===key)room.savedAt = now();
  }
  function commit() {
    const state=current();
    const batch = committer.prepare(repository, state.allDirty ? null : state.dirtyCodes, transaction()?.key??null);
    const result=committer.commit(batch);
    state.dirtyCodes=new Set();state.allDirty=false;
    return result;
  }
  function persist(room) {
    const state=current();
    if(room)state.dirtyCodes.add(room.code);else state.allDirty=true;
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
