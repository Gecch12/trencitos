"use strict";
// Network and destinations transcribed from third-party research datasets, cross-checked
// against the original 2015 Europe rulebook; illustrations and coordinates are original.
const COLORS = [
  "red",
  "blue",
  "green",
  "yellow",
  "black",
  "white",
  "orange",
  "purple",
];
// Keep the original five first and color keys stable in saves/protocol.
// Optional paint changes presentation without changing reservations/ownership.
const PLAYER_PALETTE = [
  { color: "#d45748", name: "Rojo" },
  { color: "#458ad4", name: "Azul" },
  { color: "#4b9d76", name: "Verde" },
  { color: "#ddaf40", paint: "#e5a12c", name: "Ámbar" },
  { color: "#9a75ba", name: "Morado" },
  { color: "#88583d", name: "Marrón" },
  { color: "#b88929", paint: "#f2d33d", name: "Amarillo" },
  { color: "#242831", name: "Negro" },
  { color: "#7c8796", name: "Gris" },
  { color: "#c43d92", name: "Magenta" },
  { color: "#1baaa6", name: "Turquesa" },
  { color: "#253b73", name: "Azul noche" },
  { color: "#782f49", name: "Borgoña" },
  { color: "#78833c", name: "Verde oliva" },
  { color: "#e4dcc2", name: "Marfil" },
  { color: "#ed897c", name: "Coral" },
  { color: "#b9ace2", name: "Lavanda" },
  { color: "#9ed7ed", name: "Azul hielo" },
  { color: "#71bba0", name: "Jade" },
  { color: "#6269c7", name: "Índigo" },
  { color: "#ffffff", name: "Blanco" },
];
const PLAYER_COLORS = PLAYER_PALETTE.map(({ color }) => color);
// Compatibility facade: topology comes from the immutable map definition;
// numeric IDs and legacy display coordinates come from its frozen bridge.
const { CITIES, ROUTES, TICKETS } = (() => {
  const commonJS = typeof module !== "undefined" && module.exports;
  const map = commonJS ? require("./maps/europe-v1") : EuropeMapV1;
  const legacy = commonJS ? require("./maps/europe-legacy-v1") : EuropeLegacyV1;
  return legacy.adapt(map);
})();
if (typeof module !== "undefined")
  module.exports = { COLORS, PLAYER_COLORS, PLAYER_PALETTE, CITIES, ROUTES, TICKETS };
