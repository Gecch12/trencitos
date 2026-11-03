'use strict';
const {frameHash}=require('../backend/match-archive');
function verifyAudit(data){
 if(data?.match?.schemaVersion!==1||!Array.isArray(data.frames)||!data.frames.length)throw Error('Formato de auditoría no compatible.');
 let previous=null;
 for(const [seq,frame]of data.frames.entries()){
  const {hash,...body}=frame;
  if(frame.seq!==seq||frame.previousHash!==previous||hash!==frameHash(body))throw Error(`La cadena no coincide en el paso ${seq+1}.`);
  previous=hash;
 }
 if(data.match.digest!==previous||data.match.steps!==data.frames.length)throw Error('El cierre no coincide con los pasos registrados.');
 return {id:data.match.id,status:data.match.status,steps:data.frames.length,integrity:true};
}
if(require.main===module){
 try{if(!process.argv[2])throw Error('Uso: node scripts/verify-match-audit.js archivo.json');console.log(JSON.stringify(verifyAudit(JSON.parse(require('node:fs').readFileSync(process.argv[2],'utf8')))));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={verifyAudit};
