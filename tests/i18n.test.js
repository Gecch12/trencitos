'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const I18n=require('../shared/i18n'),dictionary=require('../shared/translations');
test.afterEach(()=>I18n.select('es'));
test('Spanish is the default, English works, and runtime names are never translated',()=>{
 assert.equal(I18n.language,'es');assert.equal(I18n.t('Rooms'),'Partidas');assert.equal(I18n.t('Overview'),'Resumen');
 const message=I18n.message`${'Rooms'} robó una carta de tren.`;
 assert.equal(I18n.format(message),'Rooms robó una carta de tren.');
 I18n.select('en');assert.equal(I18n.format(message),'Rooms drew a train card.');
 assert.equal(I18n.t('Cartas'),'Cards');
 assert.equal(I18n.t`Turno de ${'Jugador'}`,"Jugador's turn");
 assert.equal(I18n.t`<button title="Editar perfil">${'Jugar'}</button>`,'<button title="Edit profile">Jugar</button>');
 assert.equal(I18n.select('fr'),false);assert.equal(I18n.language,'en');
});
test('HTML fragments remap interpolations without altering identifiers or values',()=>{
 I18n.select('en');
 assert.equal(I18n.t`<p>${'A'}</p><button id="play">Cancelar</button><span>Turno de ${'Más'}</span>`,'<p>A</p><button id="play">Cancel</button><span>Más\'s turn</span>');
 for(const [key,value]of Object.entries(dictionary)){
  const placeholders=s=>[...s.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort();
  for(const token of placeholders(value))assert.ok(placeholders(key).includes(token),key+' '+token);
 }
});
test('language survives a new browser document and storage failure keeps the default',()=>{
 let saved='en';
 const context=()=>({Translations:dictionary,localStorage:{getItem:()=>saved,setItem:(_,v)=>saved=v},document:{createTreeWalker:()=>({nextNode:()=>false}),querySelectorAll:()=>[],documentElement:{}},NodeFilter:{SHOW_TEXT:4}});
 const first=vm.createContext(context());vm.runInContext(fs.readFileSync(require.resolve('../shared/i18n'),'utf8'),first);assert.equal(first.document.documentElement.lang,'en');
 vm.runInContext("I18n.select('es')",first);const second=vm.createContext(context());vm.runInContext(fs.readFileSync(require.resolve('../shared/i18n'),'utf8'),second);assert.equal(second.document.documentElement.lang,'es');
});
