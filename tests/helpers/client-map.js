"use strict";
const { createEngine } = require("../../backend/engine"), { createMapCatalog } = require("../../game/maps/catalog");
// Presentation fixture only: not registered in the live map catalog or selector.
const reference = {id:"client-fixture",version:"1"};
const map = {schemaVersion:1,...reference,
  cities:[{id:"A",name:"Alpha"},{id:"B",name:"Beta"},{id:"C",name:"Gamma"}],
  corridors:[{id:"AB",cityIds:["A","B"]},{id:"BC",cityIds:["B","C"]},{id:"CA",cityIds:["C","A"]}],
  routes:[{id:'rail"[odd]',corridorId:"AB",a:"A",b:"B",length:2,color:"red",tunnel:false,ferry:0},
    {id:"__proto__",corridorId:"AB",a:"A",b:"B",length:2,color:"blue",tunnel:false,ferry:0},
    {id:"0",corridorId:"BC",a:"B",b:"C",length:3,color:"gray",tunnel:true,ferry:1},
    {id:"last",corridorId:"CA",a:"C",b:"A",length:1,color:"green",tunnel:false,ferry:0}],
  tickets:Array.from({length:16},(_,i)=>({id:i===0?'ticket"[odd]':i===1?'__proto__':String(i),a:"A",b:i%2?"B":"C",points:3+i,kind:i<4?"long":"short"}))};
const layout = {mapRef:reference,bounds:{x:0,y:0,width:540,height:400},
  tile:{width:22,height:8.5,gap:3.5,cityMargin:9,parallel:13},
  cities:{A:[80,80],B:[460,80],C:[270,330]},bends:{},labels:{},
  land:["M40 40H500V360H40Z"],details:[],seaLabels:[]};
const engine = createEngine({maps:createMapCatalog([map])});
module.exports = {map,layout,engine,reference};
