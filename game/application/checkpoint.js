"use strict";

// repository is the live room collection (get/values), not a per-card store.
// A checkpoint commits all rooms and history together. With deferCommit, persist
// only marks the serialized job dirty; its outer queue calls commit before delivery.
function createCheckpointHandler({ repository, committer, now, deferCommit,
  onLocalCommit, onLocalFailure }) {
  function stampRooms() {
    for (const room of repository.values()) if (!room.practice) room.savedAt = now();
  }
  function commit() {
    const batch = committer.prepare(repository);
    return committer.commit(batch);
  }
  function persist() {
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
