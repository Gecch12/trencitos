"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const Table = require('../frontend/table-ui');

test('public circles exclude both private ticket points and the separately displayed provisional bonus', () => {
  const game = {players:[{score:17},{score:21}], scoreProgress:{own:{score:53},players:[{visible:27,bonus:10},{visible:21,bonus:0}]}};
  assert.equal(Table.publicScore(game,0),17);
  assert.equal(Table.publicScore({...game,scoreProgress:{...game.scoreProgress,own:null}},0),17);
  game.result=[{seat:0,score:104},{seat:1,score:92}];
  assert.equal(Table.publicScore(game,0),104);
  assert.equal(Table.publicScore(game,1),92);
});
test('rule help uses the match definition, sorts route lengths, and does not invent missing legacy values', () => {
  const rules={routePoints:{8:21,1:1,4:7},finalTrainThreshold:3,scoring:{expressPoints:12,unusedStationPoints:5}};
  assert.deepEqual(Table.rulesSummary(rules),{routes:[{length:1,points:1},{length:4,points:7},{length:8,points:21}],threshold:3,longest:12,station:5});
  assert.equal(Table.rulesSummary({routePoints:{2:2}}).threshold,null);
});
test('temporary panels leave camera space identical and only constrain exposed interaction space', () => {
  for(const width of [320,390,768,1440]) {
    const view={width,height:844},base={top:140,bottom:692,left:8,right:8,forCamera:true};
    const closed=Table.cameraArea(view,base),opened=Table.cameraArea(view,{...base,panel:{top:410}});
    assert.deepEqual(opened,closed);
    assert.equal(opened.width,width-16);
    assert.equal(Table.cameraArea(view,{...base,forCamera:false,panel:{top:410}}).height,270);
  }
});
test('unread history excludes initial load, retained rows and updates within an existing turn', () => {
  assert.equal(Table.newHistoryRows(null,['a']),0);
  assert.equal(Table.newHistoryRows(['a','b'],['b','c','d']),2);
  assert.equal(Table.newHistoryRows(['a'],['a']),0);
});
