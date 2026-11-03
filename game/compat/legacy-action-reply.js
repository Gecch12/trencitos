"use strict";

const errors = {
  MATCH_NOT_STARTED: { message: "La partida aún no empieza." },
  INVALID_COMMAND_ID: { message: "Identificador de acción inválido." },
  STORAGE_PAUSED: { message: "No se pudo guardar.", code: "STORAGE_FAILED" },
  AUTOPILOT_ACTIVE: { message: "El bot controla tu puesto. Pulsa Recuperar control." },
  STALE_ACTION: { message: "La mesa cambió. Revisa la jugada e inténtalo otra vez.", code: "STALE_ACTION" },
  ACTION_NOT_SAVED: { message: "La acción no se guardó y no fue aplicada. Partida pausada.", code: "STORAGE_FAILED" },
};

function actionReply(result) {
  if (result.status === "accepted" || result.status === "duplicate") return { type: "ack", id: result.commandId };
  if (result.status !== "rejected") throw new Error(`Unknown action status: ${result.status}`);
  const error = result.error.code === "GAME_ACTION_REJECTED"
    ? { message: result.error.legacyMessage } : errors[result.error.code];
  if (!error) throw new Error(`Unknown action error: ${result.error.code}`);
  return { type: "error", ...error };
}

module.exports = { actionReply };
