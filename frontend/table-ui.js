"use strict";
// Presentation only. Values and permitted information come from the match view.
const TableUI = (() => {
  function publicScore(game, seat) {
    return game.result?.find(row => row.seat === seat)?.score ?? game.players[seat].score;
  }
  function rulesSummary(rules) {
    return {
      routes: Object.entries(rules.routePoints).map(([length, points]) => ({ length: Number(length), points })).sort((a, b) => a.length - b.length),
      threshold: rules.finalTrainThreshold ?? null,
      longest: rules.scoring?.expressPoints ?? null,
      station: rules.scoring?.unusedStationPoints ?? null,
    };
  }
  function cameraArea(viewport, { top, bottom, left = 8, right = 8, panel, forCamera = false }) {
    // Temporary panels never change the camera. Context menus use exposed space.
    const floor = !forCamera && panel ? Math.min(bottom, panel.top) : bottom;
    return { x: left, y: top, width: Math.max(1, viewport.width - left - right), height: Math.max(1, floor - top) };
  }
  function newHistoryRows(previous, next) {
    if (!previous) return 0;
    const known = new Set(previous);
    return next.filter(id => !known.has(id)).length;
  }
  return { publicScore, rulesSummary, cameraArea, newHistoryRows };
})();
if (typeof module !== "undefined") module.exports = TableUI;
