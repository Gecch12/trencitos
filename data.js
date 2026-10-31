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
// Keep the original five first: existing seats and saved games retain their colors.
const PLAYER_PALETTE = [
  { color: "#d45748", name: "Rojo" },
  { color: "#458ad4", name: "Azul" },
  { color: "#4b9d76", name: "Verde" },
  { color: "#ddaf40", name: "Amarillo" },
  { color: "#9a75ba", name: "Morado" },
  { color: "#88583d", name: "Marrón" },
  { color: "#b88929", name: "Dorado", finish: "gold" },
  { color: "#242831", name: "Negro" },
  { color: "#7c8796", name: "Gris" },
  { color: "#c43d92", name: "Magenta" },
  { color: "#1baaa6", name: "Turquesa" },
];
const PLAYER_COLORS = PLAYER_PALETTE.map(({ color }) => color);
const CITIES = {
  EDI: [240, 94, "Edinburgh"],
  LON: [245, 188, "London"],
  DIE: [306, 226, "Dieppe"],
  BRE: [228, 303, "Brest"],
  PAR: [362, 319, "Paris"],
  PAM: [277, 468, "Pamplona"],
  MAD: [215, 540, "Madrid"],
  LIS: [125, 585, "Lisboa"],
  CAD: [195, 654, "Cádiz"],
  BAR: [366, 517, "Barcelona"],
  AMS: [406, 201, "Amsterdam"],
  BRU: [393, 260, "Bruxelles"],
  ESS: [484, 224, "Essen"],
  FRA: [485, 308, "Frankfurt"],
  MUN: [572, 361, "München"],
  ZUR: [495, 398, "Zürich"],
  MAR: [431, 468, "Marseille"],
  VEN: [609, 435, "Venezia"],
  ROM: [616, 540, "Roma"],
  BRI: [692, 592, "Brindisi"],
  PAL: [655, 685, "Palermo"],
  STO: [722, 82, "Stockholm"],
  COP: [607, 136, "København"],
  BER: [635, 236, "Berlin"],
  VIE: [688, 363, "Wien"],
  BUD: [756, 423, "Budapest"],
  ZAG: [699, 474, "Zagrab"],
  SAR: [771, 533, "Sarajevo"],
  SOF: [905, 580, "Sofia"],
  ATH: [868, 675, "Athína"],
  RIG: [883, 176, "Riga"],
  DAN: [753, 209, "Danzig"],
  WIL: [859, 260, "Wilno"],
  WAR: [758, 303, "Warszawa"],
  BUC: [917, 484, "Bucuresti"],
  CON: [1036, 592, "Constantinople"],
  ANG: [1137, 499, "Angora"],
  SMY: [1046, 693, "Smyrna"],
  PET: [1026, 82, "Petrograd"],
  MOS: [1150, 198, "Moskva"],
  SMO: [1000, 304, "Smolensk"],
  KIE: [1012, 393, "Kyiv"],
  KHA: [1169, 372, "Kharkov"],
  ROS: [1218, 459, "Rostov"],
  SEV: [1108, 558, "Sevastopol"],
  SOC: [1235, 576, "Sochi"],
  ERZ: [1226, 682, "Erzurum"],
};
// Each row: source target length color [T=tunnel] [F1/F2=ferry locomotive requirement]
// Parallel rows represent distinct double routes, including when both are gray.
const ROUTE_RAW = `
EDI LON 4 orange|EDI LON 4 black|LON AMS 2 gray F2|LON DIE 2 gray F1|LON DIE 2 gray F1|
DIE BRE 2 orange|DIE BRU 2 green|DIE PAR 1 purple|BRE PAR 3 black|BRE PAM 4 purple|
PAR BRU 2 yellow|PAR BRU 2 red|PAR FRA 3 white|PAR FRA 3 orange|PAR ZUR 3 gray T|PAR MAR 4 gray|PAR PAM 4 blue|PAR PAM 4 green|
PAM MAR 4 red|PAM BAR 2 gray T|PAM MAD 3 black T|PAM MAD 3 white T|MAD LIS 3 purple|LIS CAD 2 blue|CAD MAD 3 orange|MAD BAR 2 yellow|BAR MAR 4 gray|
AMS ESS 3 yellow|AMS FRA 2 white|AMS BRU 1 black|BRU FRA 2 blue|ESS COP 3 gray F1|ESS COP 3 gray F1|ESS BER 2 blue|ESS FRA 2 green|FRA BER 3 black|FRA BER 3 red|FRA MUN 2 purple|
MUN VIE 3 orange|MUN VEN 2 blue T|MUN ZUR 2 yellow T|ZUR VEN 2 green T|ZUR MAR 2 purple T|MAR ROM 4 gray T|VEN ZAG 2 gray|VEN ROM 2 black|ROM BRI 2 white|ROM PAL 4 gray F1|BRI ATH 4 gray F1|BRI PAL 3 gray F1|PAL SMY 6 gray F2|
STO PET 8 gray T|STO COP 3 yellow|STO COP 3 white|BER DAN 4 gray|BER WAR 4 purple|BER WAR 4 yellow|BER VIE 3 green|VIE WAR 4 blue|VIE BUD 1 red|VIE BUD 1 white|VIE ZAG 2 green|
BUD KIE 6 gray T|BUD BUC 4 gray T|BUD SAR 3 purple|BUD ZAG 2 orange|ZAG SAR 3 red|SAR SOF 2 gray T|SAR ATH 4 green|SOF BUC 2 gray T|SOF CON 3 blue|SOF ATH 3 purple|ATH SMY 2 gray F1|
RIG PET 4 gray|RIG WIL 4 green|RIG DAN 3 black|DAN WAR 2 gray|WIL PET 4 blue|WIL SMO 3 yellow|WIL KIE 2 gray|WIL WAR 3 red|WAR KIE 4 gray|BUC KIE 4 gray|BUC SEV 4 white|BUC CON 3 yellow|CON SEV 4 gray F2|CON ANG 2 gray T|CON SMY 2 gray T|ANG ERZ 3 black|ANG SMY 3 orange T|
PET MOS 4 white|MOS KHA 4 gray|MOS SMO 2 orange|SMO KIE 3 red|KIE KHA 4 gray|KHA ROS 2 green|ROS SOC 2 gray|ROS SEV 4 gray|SEV SOC 2 gray F1|SEV ERZ 4 gray F2|SOC ERZ 3 red T
`;
const ROUTES = ROUTE_RAW.trim()
  .split("|")
  .map((entry, id) => {
    let [a, b, n, color, ...flags] = entry.trim().split(/\s+/);
    return {
      id,
      a,
      b,
      n: +n,
      color,
      tunnel: flags.includes("T"),
      ferry: +(flags.find((f) => /^F[12]$/.test(f)) || "F0").slice(1),
    };
  });
const TICKET_RAW = `
VEN CON 10|LON VIE 10|ANG KHA 10|ESS KIE 10|RIG BUC 10|STO VIE 10|ATH WIL 11|AMS WIL 12|BER MOS 12|FRA SMO 13|
ROM SMY 8|MAD ZUR 8|PAR VIE 8|BRE VEN 8|PAL CON 8|MAD DIE 8|BER BUC 8|BAR BRU 8|BER ROM 9|BRU DAN 9|
PAR ZAG 7|AMS PAM 7|LON BER 7|BRE MAR 7|EDI PAR 7|MAR ESS 8|SMO ROS 8|BAR MUN 8|SAR SEV 8|KIE SOC 8|
ATH ANG 5|SOF SMY 5|FRA COP 5|BUD SOF 5|ROS ERZ 5|WAR SMO 6|ZUR BRI 6|ZAG BRI 6|KIE PET 6|ZUR BUD 6|
PAL MOS 20 L|BRE PET 20 L|LIS DAN 20 L|EDI ATH 21 L|CAD STO 21 L|COP ERZ 21 L
`;
const TICKETS = TICKET_RAW.trim()
  .split("|")
  .map((entry, id) => {
    let [a, b, p, l] = entry.trim().split(/\s+/);
    return { id, a, b, p: +p, long: l === "L" };
  });
if (typeof module !== "undefined")
  module.exports = { COLORS, PLAYER_COLORS, PLAYER_PALETTE, CITIES, ROUTES, TICKETS };
