// Shared deterministic appearance; no game state or Three.js dependencies.
const SKIN = ['#f4d5bd','#e2ad82','#c88a5c','#b77c55','#965d40','#805039','#694331','#513527'];
const HAIR = ['#25232b','#493027','#805038','#ad623d','#d4ac60','#ead69a','#9097a1','#e3e1d9'];
const CLOTHES = ['#4f9bb3','#e4b345','#906db1','#df7961','#538e70','#d881a2','#627dc1','#62b6a4','#f0d8b5','#a6505b','#6c758b','#a1b66b'];

export function visualHash(key) {
  let hash = 2166136261;
  for (const char of String(key)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16;
  return hash >>> 0;
}

// Independent choices: a skin tone is never tied to one outfit, hairstyle or pose.
export function passengerPerson(cast, side, index) {
  const pick = (label, values) => values[visualHash(`${cast}:${side}:${index}:${label}`) % values.length];
  return {
    skin: pick('skin',SKIN), hair: pick('hair',HAIR), clothes: pick('clothes',CLOTHES),
    hairstyle: pick('hairstyle',['short','bob','curly','bun']),
    outfit: pick('outfit',['stripes','collar','vest','lapels']),
    accent: pick('accent',['#f4e4cb','#394c65','#edbd63']),
  };
}
