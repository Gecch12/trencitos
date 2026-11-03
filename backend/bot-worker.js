"use strict";
const {parentPort}=require('node:worker_threads');
const {chooseBotAction,chooseReplacementAction}=require('./bots');
parentPort.on('message',({id,game,seats,replacement})=>{
 const start=performance.now();
 try{const choose=replacement?chooseReplacementAction:chooseBotAction;parentPort.postMessage({id,actions:seats.map(seat=>[seat,choose(game,seat)]),milliseconds:performance.now()-start});}
 catch{parentPort.postMessage({id,error:true});}
});
