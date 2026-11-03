"use strict";
const I18n = (() => {
  const dictionary = typeof module !== 'undefined' && module.exports ? require('./translations') : Translations;
  const spanish = {Rooms:'Partidas',Play:'Jugar',More:'Más',Profile:'Perfil',Game:'Juego',Community:'Comunidad',Company:'Empresa','Patch Notes':'Notas de actualización',Language:'Idioma',Rules:'Reglas',FAQ:'Preguntas frecuentes',Creators:'Creadores',Tournaments:'Torneos','Join Discord':'Unirse a Discord',About:'Acerca de',Careers:'Trabaja con nosotros',Privacy:'Privacidad',Account:'Cuenta',Friends:'Amigos',History:'Historial',Overview:'Resumen','Open Rooms':'Partidas abiertas',Spectate:'Observar','Create Room':'Crear partida','Join Room':'Unirse a una partida','Follow us':'Síguenos','Edit Profile':'Editar perfil','Visible en Open Rooms. La partida se podrá observar.':'Visible en Partidas abiertas. La partida se podrá observar.'};
  let language = 'es';
  try { if (typeof document !== 'undefined' && globalThis.localStorage?.getItem('rr-language') === 'en') language = 'en'; } catch {}
  // Normalize pre-rename message templates only; interpolated player data stays opaque.
  const normalize = value => String(value).replace(/\blocomotoras?\b/gi, word => (word[0] === 'L' ? 'C' : 'c') + (word.toLowerCase().endsWith('s') ? 'omodines' : 'omodín')).replace(/\b(una|la|las) (comodín|comodines)\b/gi, (_, article, noun) => {
    const word = {una:'un',la:'el',las:'los'}[article.toLowerCase()];
    return (article[0] === article[0].toUpperCase() ? word[0].toUpperCase()+word.slice(1) : word) + ' ' + noun;
  }).replace(/\s+/g, ' ').trim();
  const interpolate = (text, values) => text.replace(/\{(\d+)\}/g, (whole, i) => i < values.length ? String(values[i] ?? '') : whole);
  function message(strings, ...values) { return { key: strings.reduce((s, part, i) => s + (i ? `{${i-1}}` : '') + part, ''), values }; }
  function phrase(source) {
    const ids = [], key = normalize(source).replace(/\{\d+\}/g, token => {
      if (!ids.includes(token)) ids.push(token);
      return `{${ids.indexOf(token)}}`;
    });
    let result = language === 'en' ? dictionary[key] ?? key : spanish[key] ?? key;
    result = result.replace(/\{(\d+)\}/g, (token, i) => ids[i] ?? token);
    return source.replace(source.trim(), result);
  }
  // Translate only literal markup before interpolating. Player names, codes,
  // card identities and all other runtime values remain opaque.
  function markup(source) {
    return source.replace(/(?:^|>)([^<>]+)(?=<|$)|\b(aria-label|title|placeholder|alt)=(["'])(.*?)\3/g,
      (whole, text, attr, quote, value) => text !== undefined ? whole.replace(text, phrase(text)) : `${attr}=${quote}${phrase(value)}${quote}`);
  }
  function t(source, ...values) {
    if (Array.isArray(source?.raw)) { const m=message(source,...values); return format(m); }
    if (source == null) return '';
    return /<[a-z/!]/i.test(source) ? markup(String(source)) : phrase(String(source));
  }
  function format(m) { return interpolate(t(m.key), m.values || []); }
  function localize(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    for(const node of nodes) if(!node.parentElement?.closest('script,style')) node.nodeValue=t(node.nodeValue);
    for(const el of root.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) for(const attr of ['aria-label','title','placeholder','alt']) if(el.hasAttribute(attr)) el.setAttribute(attr,t(el.getAttribute(attr)));
    document.documentElement.lang=language;
  }
  function select(value) {
    if(!['es','en'].includes(value)) return false;
    language=value; try { if(typeof document !== 'undefined') globalThis.localStorage?.setItem('rr-language',value); } catch {}
    return true;
  }
  return {t,format,message,localize,select,get language(){return language},has: key=>Object.hasOwn(dictionary,normalize(key))};
})();
globalThis.TrencitosI18n = I18n;
if (typeof module !== 'undefined' && module.exports) module.exports = I18n;

if (typeof document !== 'undefined') I18n.localize(document);
