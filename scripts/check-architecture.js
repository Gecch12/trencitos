"use strict";
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const bridges=new Set(['game/compat/legacy-scoring.js','game/compat/replay-definition.js']);
const shared=new Set(['shared/replay-state.js','shared/game-timing.js']);
const layer=file=>file.split('/').slice(0,2).join('/');
function allowed(from,to){
 if(layer(from)==='game/domain')return layer(to)==='game/domain';
 if(layer(from)==='game/queries')return ['game/queries','game/domain'].includes(layer(to))||bridges.has(to)||shared.has(to);
 if(layer(from)==='game/application')return ['game/application','game/queries','game/domain'].includes(layer(to))||bridges.has(to)||shared.has(to);
 if(bridges.has(from)||shared.has(from))return layer(to)==='game/domain'||bridges.has(to)||shared.has(to);
 return false;
}
function inspect(file,source){
 const errors=[];
 // Existing protected modules use static CommonJS. Preserve quoted strings
 // while removing comments; reject unsupported dynamic dependencies explicitly.
 const code=source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,(match,string)=>string||'');
 const calls=[...code.matchAll(/\brequire\s*\(([^)]*)\)/g)];
 for(const call of calls){
  const literal=call[1].trim().match(/^(['"])([^'"]+)\1$/);
  if(!literal||!literal[2].startsWith('.')){errors.push(`${file}: dependencia no estática/local: ${call[0]}`);continue;}
  let target=path.posix.normalize(path.posix.join(path.posix.dirname(file),literal[2]));if(!path.posix.extname(target))target+='.js';
  if(!allowed(file,target))errors.push(`${file} → ${target}: dirección de dependencia prohibida`);
 }
 if(/\bimport\s*(?:\(|[{'*\w])/.test(code))errors.push(`${file}: amplía el comprobador antes de introducir imports ESM`);
 const ambient=/\b(?:Date\.now|Math\.random|fetch|setTimeout|setInterval)\s*\(|\b(?:process|document|window)\s*\./;
 if(ambient.test(code))errors.push(`${file}: dependencia ambiental; inyecta tiempo, azar o puertos`);
 return errors;
}
function files(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(`${dir}/${entry.name}`):entry.name.endsWith('.js')?[`${dir}/${entry.name}`]:[]);}
function check(){
 const protectedFiles=[...files('game/domain'),...files('game/application'),...files('game/queries'),...bridges,...shared];
 return {files:protectedFiles.length,errors:protectedFiles.flatMap(file=>inspect(file,fs.readFileSync(path.join(root,file),'utf8')))};
}
if(require.main===module){const result=check();if(result.errors.length){console.error(result.errors.join('\n'));process.exitCode=1;}else console.log(`OK: límites de ${result.files} módulos. La pureza de consultas y la durabilidad se verifican además con tests.`);}
module.exports={allowed,inspect,check};
