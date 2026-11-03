"use strict";

const messages = {
  TRAIN_CARD_UNAVAILABLE: "Carta inexistente.",
  NO_TRAIN_CARDS: "No hay cartas disponibles.",
  VISIBLE_WILD_AFTER_FIRST_DRAW: "No se permite tomar un comodín visible como segunda carta.",
  ROUTE_UNAVAILABLE: "Esta ruta ya no está disponible.",
  INSUFFICIENT_TRAINS: "Te faltan vagones.",
  INVALID_PAYMENT_COLOR: "Color inválido.",
  INSUFFICIENT_PAYMENT: "No tienes cartas para esa ruta.",
  TUNNEL_DECISION_REQUIRED: "Resuelve el túnel antes de continuar.",
  INSUFFICIENT_TUNNEL_PAYMENT: "No tienes suficientes cartas para pagar el túnel.",
  INVALID_PLAYER_COUNT: "Se requieren 2–5 jugadores.",
  INVALID_FIRST_PLAYER: "Primer jugador inválido.",
  INITIAL_ALREADY_CHOSEN: "Ya confirmaste tus billetes iniciales.",
  INVALID_TICKET_SELECTION: "Selección de billetes inválida.",
  TICKET_OFFER_PENDING: "Confirma primero tus billetes pendientes.",
  NO_DESTINATION_TICKETS: "No quedan billetes de destino.",
  TICKET_OFFER_EXPIRED: "Esta selección de billetes ya no está pendiente.",
  STATION_UNAVAILABLE: "No puedes construir una estación ahí.",
  INSUFFICIENT_STATION_PAYMENT: "Cartas insuficientes para la estación.",
};

function legacyError({ code }) {
  if (!Object.hasOwn(messages, code)) throw new Error(`Unknown domain error: ${code}`);
  return new Error(messages[code]);
}

module.exports = { legacyError };
