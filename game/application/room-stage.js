"use strict";

// Preparation, checkpoint request and publication have separate ports. Remote
// queueViews/queueDirectory must enqueue detached messages in the dispatch outbox.
// A true result means staged; only the outer queue can confirm a remote commit.
function createRoomStager({ repository, engine, history, checkpoint, now, storagePaused,
  watchRoom, reconcileRoom, queueViews, scheduleRoom, queueDirectory }) {
  return function stageRoom(room, automatic = false) {
    watchRoom(room);
    if (repository.get(room.code) !== room) return;
    if (!automatic) room.updated = now();
    if (!room.practice && !storagePaused()) reconcileRoom(room);
    if (repository.get(room.code) !== room) return;
    if (room.game) engine.normalize(room.game, now());
    room.savedAt = now();
    if (!storagePaused()) {
      history.capture(room);
      checkpoint.persist(room);
    }
    // A local failure has already restored committed data and marked storage
    // paused. Publish that recovery view, never the failed candidate state.
    queueViews(room);
    scheduleRoom(room);
    queueDirectory();
    return !storagePaused();
  };
}

module.exports = { createRoomStager };
