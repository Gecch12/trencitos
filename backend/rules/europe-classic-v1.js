"use strict";
const { COLORS, PLAYER_COLORS } = require("../../shared/data");

// The supported policies' existing values, grouped under an exact reference.
// This is a built-in ruleset, not a loader for arbitrary rule JSON or new mechanics.
const colors = [...COLORS], routePoints = {1:1,2:2,3:4,4:7,6:15,8:21};
const rules = {
  schemaVersion: 1, id: "europe-classic", version: "1",
  colors, routePoints, capabilities: {tunnels:true,ferries:true},
  claim: {colors,routePoints,doubleRoutesMinPlayers:4},
  tunnel: {colors,cardMs:700,resultMs:3000},
  setup: {minPlayers:2,maxPlayers:5,maxNameLength:24,playerColors:[...PLAYER_COLORS],
    trainCards:[...colors.map(color=>({color,count:12})),{color:"wild",count:14}],
    initialHand:4,initialLongTickets:1,initialShortTickets:3,trains:45,stations:3},
  trainCards: {marketSize:5,refreshWildCount:3,drawsPerTurn:2},
  destinations: {initialMinimum:2,offerMinimum:1,offerCount:3},
  stations: {colors,stationCosts:[1,2,3]},
  scoring: {routePoints,unusedStationPoints:4,expressPoints:10,tieBreakers:["score","completed","stations","express"]},
  turn: {initialMs:60000,turnMs:60000,finalTrainThreshold:2},
  offerMs:60000,
};
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
module.exports = freeze(rules);
