"use strict";

const messages = {
  ROUTE_UNAVAILABLE: "Esta ruta ya no está disponible.",
  INSUFFICIENT_TRAINS: "Te faltan vagones.",
  INVALID_PAYMENT_COLOR: "Color inválido.",
  INSUFFICIENT_PAYMENT: "No tienes cartas para esa ruta.",
  TUNNEL_DECISION_REQUIRED: "Resuelve el túnel antes de continuar.",
  INSUFFICIENT_TUNNEL_PAYMENT: "No tienes suficientes cartas para pagar el túnel.",
};

function legacyError({ code }) {
  if (!Object.hasOwn(messages, code)) throw new Error(`Unknown domain error: ${code}`);
  return new Error(messages[code]);
}

module.exports = { legacyError };
