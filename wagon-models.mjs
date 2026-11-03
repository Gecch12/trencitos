// Public presentation only. Model, owner paint and finish are independent.
export const WAGON_STYLES = Object.freeze([
  { color: '#d45748', model: 'passenger', label: 'Pasajeros' },
  { color: '#458ad4', model: 'tanker', label: 'Cisterna' },
  { color: '#4b9d76', model: 'alfalfa', label: 'Alfalfa' },
  { color: '#ddaf40', paint: '#e5a12c', model: 'grain', label: 'Grano' },
  { color: '#9a75ba', model: 'goods', label: 'Mercancías' },
  { color: '#88583d', model: 'timber', label: 'Troncos' },
  { color: '#b88929', paint: '#f2d33d', model: 'auto-carrier', label: 'Transporte de deportivos' },
  { color: '#242831', model: 'coal', label: 'Carbón' },
  { color: '#7c8796', model: 'stone', label: 'Piedra' },
  { color: '#c43d92', model: 'mail', label: 'Correo' },
  { color: '#1baaa6', model: 'steel', label: 'Bobinas' },
  { color: '#253b73', model: 'crane', label: 'Grúa ferroviaria' },
  { color: '#782f49', model: 'wine', label: 'Toneles de vino' },
  { color: '#78833c', model: 'tractors', label: 'Tractores' },
  { color: '#e4dcc2', model: 'cement', label: 'Silos de cemento' },
  { color: '#ed897c', model: 'fruit', label: 'Fruta' },
  { color: '#b9ace2', model: 'flowers', label: 'Flores' },
  { color: '#9ed7ed', model: 'boat', label: 'Lancha' },
  { color: '#71bba0', model: 'dwelling', label: 'Vivienda' },
  { color: '#6269c7', model: 'circus', label: 'Circo' },
].map(style => Object.freeze({ finish: 'paint', ...style })));

const CLASSIC_VARIANTS = Object.freeze([Object.freeze({ id: 'classic', label: 'Clásico' })]);
const WAGON_VARIANTS = Object.freeze({
  passenger: Object.freeze([
    ['classic', 'Clásico'], ['solo', 'Una persona'], ['duo', 'Dos personas'],
    ['trio', 'Tres personas'], ['lean', 'Apoyado'], ['wave', 'Saludando'],
  ].map(([id, label]) => Object.freeze({ id, label }))),
});
// Presentation catalog: families without variations show their single model.
export function wagonVariants(model) { return WAGON_VARIANTS[model] || CLASSIC_VARIANTS; }
export const PASSENGER_VARIANTS = Object.freeze(wagonVariants('passenger').map(({ id }) => id));
export const PASSENGER_CAST_COUNT = 32;
// Six carriage personalities share the owner's paint and the same physical shell.
// Window order runs along X; occupied windows always stay clear for the people.
const PASSENGER_CARRIAGES = {
  classic: { windows:['glass','pair','warm','pair','glass'], curtain:'#d8ad73', belt:'#ecd9ac', double:true, roof:'paint', vents:[-5,5] },
  solo: { windows:['left','ajar','person','glass','blind'], curtain:'#91ad9a', belt:'#ded7ba', double:false, roof:'shade', vents:[-4,4] },
  duo: { windows:['right','person','ajar','person','left'], curtain:'#8e5470', belt:'#f0d7b0', double:true, roof:'paint', vents:[-5.6,0,5.6] },
  trio: { windows:['person','pair','person','right','person'], curtain:'#e3b95b', belt:'#f1dfb3', double:false, roof:'paint', vents:[-4.6,0,4.6] },
  lean: { windows:['left','person','warm','person','ajar'], curtain:'#629b9c', belt:'#cadbd0', double:true, roof:'shade', vents:[-5.5,4] },
  wave: { windows:['ajar','person','right','person','pair'], curtain:'#809bb9', belt:'#efdfbf', double:false, roof:'paint', vents:[-3.4,3.4] },
};
const SKIN = ['#f4d5bd','#e2ad82','#c88a5c','#b77c55','#965d40','#805039','#694331','#513527'];
const HAIR = ['#25232b','#493027','#805038','#ad623d','#d4ac60','#ead69a','#9097a1','#e3e1d9'];
const CLOTHES = ['#4f9bb3','#e4b345','#906db1','#df7961','#538e70','#d881a2','#627dc1','#62b6a4','#f0d8b5','#a6505b','#6c758b','#a1b66b'];

function visualHash(key) {
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

// Each route gets independent shuffled bags. Prefixes stay unchanged for any length.
// Stateless visual randomness: never written to the game, network or replay.
export function wagonRouteAppearances(model, routeKey, length) {
  if (!Number.isSafeInteger(length) || length < 0) throw new RangeError('Invalid wagon count');
  if (model !== 'passenger') return Array.from({length},()=>({variant:'classic',cast:0}));
  const appearances = [];
  let previous = null;
  for (let cycle=0;appearances.length<length;cycle++) {
    let seed = visualHash(`${routeKey}:bag:${cycle}`);
    const random = max => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let n = Math.imul(seed ^ seed >>> 15, seed | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return Math.floor(((n ^ n >>> 14) >>> 0) / 4294967296 * max);
    };
    const bag = [...PASSENGER_VARIANTS];
    for (let i=bag.length-1;i>0;i--) { const j=random(i+1); [bag[i],bag[j]]=[bag[j],bag[i]]; }
    if (bag[0]===previous) { const j=1+random(bag.length-1); [bag[0],bag[j]]=[bag[j],bag[0]]; }
    for (const variant of bag) {
      const index = appearances.length;
      if (index===length) break;
      appearances.push({variant,cast:visualHash(`${routeKey}:cast:${index}`)%PASSENGER_CAST_COUNT});
    }
    previous = bag.at(-1);
  }
  return appearances;
}

export function wagonAppearance(model, key = 'preview') {
  return wagonRouteAppearances(model,key,1)[0];
}

export function wagonStyle(color, customization = {}) {
  const canonical = color?.toLowerCase() === '#f4d83d' ? '#ddaf40' : color?.toLowerCase();
  const base = WAGON_STYLES.find(s => s.color === canonical || s.paint === canonical) || WAGON_STYLES[0];
  const model = WAGON_STYLES.some(s => s.model === customization.model) ? customization.model : base.model;
  const finish = ['paint', 'gold'].includes(customization.finish) ? customization.finish : base.finish;
  return { model, finish, color: base.paint || color || base.color };
}

// Model-space quaternion taking the vertical axis to a limb/body direction.
function uprightRotation([x, y, z]) {
  const length = Math.hypot(x, y, z);
  if (z / length < -.999999) return [1, 0, 0, 0];
  const q = [-y / length, x / length, 0, 1 + z / length], norm = Math.hypot(...q);
  return q.map(n => n / norm);
}

function rotatePoint([x, y, z], [qx, qy, qz, qw]) {
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + qy * tz - qz * ty, y + qw * ty + qz * tx - qx * tz, z + qw * tz + qx * ty - qy * tx];
}

// Normalized primitives; coordinates are longitudinal X, width Y, height Z.
// Paint is resolved by the renderer, so changing a model never changes ownership.
export function wagonParts(model, { variant = 'classic', cast = 0 } = {}) {
  const parts = [];
  const add = (shape, xyz, size, color = 'paint', material = 'paint', rotation) => parts.push({ shape, xyz, size, color, material, ...(rotation && { rotation }) });
  const box = (xyz, size, color, material) => add('box', xyz, size, color, material);
  const round = (xyz, size, color, material) => add('round', xyz, size, color, material);
  const endWalls = (height = 3) => {
    for (const x of [-8.7, 8.7]) box([x, 0, 3.1 + height / 2], [1, 7.6, height]);
  };
  const openBed = (height = 3) => {
    box([0, 0, 3.2], [19, 7.8, 1]); endWalls(height);
    for (const y of [-3.6, 3.6]) {
      box([0, y, 3.1 + height / 2], [18.5, .7, height]);
      for (const x of [-6, 0, 6]) box([x, y * 1.04, 3.1 + height / 2], [.6, .35, height], 'trim');
    }
  };
  const windows = (xs, z = 5.4) => {
    for (const y of [-3.73, 3.73]) for (const x of xs) {
      round([x, y, z], [1.8, .16, 1.8], '#162f3b', 'glass');
    }
  };
  // Same footprint, axles and couplers for every family.
  box([0, 0, 2.1], [20, 8.2, 1.5], '#263b40', 'metal');
  for (const x of [-10.1, 10.1]) box([x, 0, 1.8], [1.1, 2, 1], '#263b40', 'metal');
  for (const x of [-6.5, 6.5]) for (const y of [-4, 4]) {
    add('wheel', [x, y, 1.4], [2.8, 1.1, 2.8], '#24323a', 'metal');
    add('wheel', [x, y * 1.13, 1.4], [1.25, .18, 1.25], '#84918e', 'metal');
  }
  switch (model) {
    case 'dwelling': {
      box([0,0,3.05],[19.5,7.8,.55],'#94704b','cargo');
      box([-1.6,0,5.5],[14.6,6.8,4.7]);
      add('roof',[-1.6,0,7.85],[15.6,7.7,1.75],'#36545b','metal');
      // Painted timber boards, cream window casings and warm curtained glass.
      for (const side of [-1,1]) {
        for (const z of [3.9,4.6,5.3,6,6.7,7.4]) box([-1.6,side*3.42,z],[14.5,.07,.07],'trim');
        for (const x of [-5,1.7]) {
          box([x,side*3.5,5.85],[2.6,.12,2.35],'#26424a','glass');
          add('window-frame',[x,side*3.6,5.85],[2.85,.22,2.6],'#f4e5bd','cargo');
          box([x-.65,side*3.68,6.05],[.55,.12,1.8],'#e3b976','cargo');
          box([x+.65,side*3.68,6.05],[.55,.12,1.8],'#e3b976','cargo');
        }
        box([1.7,side*3.83,4.35],[3,.65,.6],'#aa6e49','cargo');
        for (const x of [.8,1.7,2.6]) add('mound',[x,side*3.83,4.8],[.8,.65,.65],x===1.7?'#edb44d':'#587b4a','cargo');
        box([7.1,side*3.5,4.5],[2.8,.3,.3],'#f4e5bd','cargo');
        for (const x of [6,8.2]) box([x,side*3.5,3.95],[.3,.3,1.4],'#f4e5bd','cargo');
      }
      box([5.75,0,5.05],[.16,2.5,3.5],'#e9d5a4','cargo');
      box([5.86,0,5.7],[.1,1.6,1.6],'#35555a','glass');
      round([5.97,-.85,4.8],[.15,.25,.25],'#bb913e','metal');
      box([8.85,0,2.75],[1.5,3.2,.5],'#94704b','cargo');
      box([9.6,0,2.2],[1.4,3.2,.5],'#94704b','cargo');
      box([-5.8,.9,8.85],[1,1,2.1],'#6c5851','metal');
      box([-5.8,.9,9.95],[1.5,1.5,.35],'#384549','metal');
      break;
    }
    case 'circus': {
      round([0,0,5.15],[18.3,7.4,4.8]);
      add('roof',[0,0,7.55],[19.2,8,1.95]);
      for (const x of [-7.2,-3.6,0,3.6,7.2]) add('roof',[x,0,7.58],[1.5,8.05,1.95],'#f6dfad','cargo');
      for (const side of [-1,1]) {
        box([0,side*3.76,5.35],[11.8,.18,2.75],'#ad424c','cargo');
        for (const z of [3.6,7.2]) box([0,side*3.82,z],[17.8,.22,.4],'#e9bc5a','metal');
        for (const x of [-8.3,-6.3,6.3,8.3]) box([x,side*3.82,5.4],[.3,.22,3.3],'#f6dfad','cargo');
        for (const x of [-3.8,0,3.8]) add('star',[x,side*3.96,5.45],[2.1,.18,2.1],'#f5cd69','cargo');
        for (const x of [-7.3,7.3]) {
          round([x,side*3.8,5.7],[1.35,.18,1.75],'#263b53','glass');
          box([x,side*3.96,4.65],[1.6,.25,.2],'#e9bc5a','metal');
        }
      }
      for (const x of [-9.2,9.2]) box([x,0,4.85],[.15,2.6,3.1],'#ad424c','cargo');
      break;
    }
    case 'crane': {
      const superstructure = parts.length;
      box([0, 0, 3.2], [19.5, 7.8, .7]);
      // A raised telescopic jib leaves clear air around a suspended hook.
      // The blue machinery/cab identifies its owner; yellow marks working parts.
      add('disc', [-4.7, 0, 3.95], [6.3, 6.3, .8], '#8b9693', 'metal');
      round([-5.2, 0, 4.85], [6.8, 6.5, 1.4]);
      box([-7.6, -.25, 5.95], [2.7, 6, 2.4], 'trim');
      box([-7.6, -.25, 7.25], [2.7, 6, .35], '#b7bdc1', 'metal');
      for (const z of [5.35, 5.85, 6.35]) box([-9, -.25, z], [.15, 4.9, .15], '#24323a', 'metal');
      box([-4.8, 2.1, 6.65], [3.4, 2.8, 3.3]);
      box([-4.8, 3.53, 7], [2.8, .12, 1.9], '#96c4d7', 'glass');
      box([-3.06, 2.1, 7], [.12, 2.35, 1.9], '#96c4d7', 'glass');
      box([-4.8, 3.62, 7], [.18, .12, 2], '#24323a', 'metal');
      box([-4.8, 2.1, 8.4], [3.8, 3.1, .3], 'trim');
      add('disc', [-5.6, 2.1, 8.8], [.6, .6, .5], '#edb43b', 'glass');
      box([-2.9, -.65, 5.3], [2.1, 3.4, 2.5]);
      add('wheel', [-2.9, 1.1, 5.8], [1.15, .2, 1.15], '#bcc6c7', 'metal');
      add('boom', [.3, -.65, 7.05], [8.2, 1.9, 4.2], '#e1ac36');
      add('boom', [5.1, -.65, 8.72], [5.5, 1.25, 2.3], '#b4c3c9', 'metal');
      add('boom', [-.1, .55, 6.3], [5.4, .55, 2.7], '#283b42', 'metal');
      add('boom', [1.7, .55, 7.2], [3.3, .3, 1.6], '#cbd2cb', 'metal');
      add('wheel', [7.75, -.65, 9.35], [1.2, 1.5, 1.2], '#dca832');
      for (const x of [7.48, 8.02]) box([x, -.65, 7.8], [.14, .16, 2.8], '#26343a', 'metal');
      round([7.75, -.65, 6.3], [2.1, 1.4, 1.5], '#efbb3c');
      for (const x of [7.2, 7.75, 8.3]) box([x, .08, 6.3], [.3, .1, 1.15], '#293b40', 'metal');
      add('hook', [7.75, -.65, 4.8], [1.8, .7, 1.8], '#273940', 'metal');
      for (const x of [-7.6, 6.6]) {
        box([x, 0, 3.7], [1.3, 8.4, .6], '#b9bcb0', 'metal');
        for (const y of [-3.7, 3.7]) {
          box([x, y, 3.6], [.65, .65, 1.55], '#e6b541');
          box([x, y, 2.85], [1.5, 1.2, .3], '#34484b', 'metal');
        }
      }
      // Face the jib towards -X: its rise and hanging hook remain distinct in
      // the shared showroom camera, instead of flattening into the cab roof.
      for (const part of parts.slice(superstructure)) part.xyz[0] *= -1;
      break;
    }
    case 'wine':
      box([0, 0, 3.2], [19.4, 7.8, .8]);
      for (const x of [-4.6, 4.6]) {
        add('cradle', [x, 0, 4.1], [7.9, 7.4, 1.1], 'paint');
        add('barrel', [x, 0, 6.4], [8.1, 6.5, 6.5], '#a9703c', 'cargo');
        add('barrel-staves', [x, 0, 6.4], [8.1, 6.52, 6.52], '#6e452a', 'cargo');
        for (const dx of [-3.1, 0, 3.1]) add('barrel-hoop', [x + dx, 0, 6.4], [.38, dx ? 5.95 : 6.7, dx ? 5.95 : 6.7], '#444b4b', 'metal');
        for (const dx of [-4.08, 4.08]) {
          add('tank', [x + dx, 0, 6.4], [.12, 4.9, 4.9], '#c09259', 'cargo');
          box([x + dx, 0, 6.4], [.17, .17, 4.5], '#7e5835', 'cargo');
        }
        add('disc', [x, 0, 9.7], [1, 1, .35], '#523927', 'cargo');
      }
      for (const y of [-3.9, 3.9]) box([0, y, 3.9], [18.8, .3, .8]);
      break;
    case 'tractors':
      box([0, 0, 3.2], [19.5, 7.8, .7]);
      for (const y of [-2.3, 2.3]) box([0, y, 3.7], [18.5, 1.35, .3], '#a9ab8a', 'metal');
      for (const x of [-4.65, 4.65]) {
        box([x, 0, 4.5], [7.6, 2.2, .8], '#3e4940', 'metal');
        round([x + 1.1, 0, 5.8], [4.3, 2.6, 2.6]);
        box([x + 3.3, 0, 5.8], [.18, 2.3, 1.7], '#354141', 'metal');
        for (const y of [-.7, 0, .7]) box([x + 3.42, y, 5.8], [.1, .14, 1.3], '#b7bfad', 'metal');
        box([x - 1.8, 0, 7], [2.5, 2.45, 2.5], '#263c46', 'glass');
        box([x - 1.8, 0, 8.4], [3.1, 3.4, .35], 'trim');
        for (const y of [-1.22, 1.22]) box([x - 1.8, y, 7.05], [.25, .15, 2.7], 'trim');
        for (const y of [-2.05, 2.05]) {
          add('tire', [x - 2.1, y, 5.2], [3.8, 1.15, 3.8], '#252e2c', 'cargo');
          add('wheel', [x - 2.1, y * 1.29, 5.2], [1.9, .12, 1.9], '#e1c578', 'metal');
          add('tire', [x + 2.5, y, 4.75], [2.7, .9, 2.7], '#252e2c', 'cargo');
          add('wheel', [x + 2.5, y * 1.23, 4.75], [1.35, .12, 1.35], '#e1c578', 'metal');
          box([x - 2.1, y, 7.2], [4, 1.3, .25], 'trim');
        }
        add('disc', [x + 1.2, -.9, 8], [.4, .4, 2.1], '#394746', 'metal');
        box([x + 3.15, 0, 7.05], [.3, 1.8, .3], '#f5e6b1', 'glass');
      }
      break;
    case 'cement':
      box([0, 0, 3.2], [19.5, 7.7, .7]);
      for (const x of [-5.7, 0, 5.7]) {
        add('silo-cone', [x, 0, 4.6], [5.4, 5.7, 2.1]);
        add('disc', [x, 0, 7.15], [5.4, 5.7, 3.3]);
        add('mound', [x, 0, 8.6], [5.4, 5.7, 1.7], 'trim');
        add('disc', [x, 0, 9.5], [1.6, 1.6, .35], '#6b7879', 'metal');
        for (const y of [-2.8, 2.8]) box([x, y, 4.5], [.6, .6, 2.6], '#8b9691', 'metal');
        add('disc', [x, 0, 3.7], [1, 1, 1], '#7e8e88', 'metal');
      }
      box([0, -3.5, 4], [17, .35, .4], '#657c7a', 'metal');
      box([0, 0, 9.7], [15, .75, .2], '#7e8c86', 'metal');
      for (const y of [-1, 1]) box([-8.5, y, 6.4], [.25, .25, 6.2], '#718580', 'metal');
      for (const z of [3.9, 5.1, 6.3, 7.5, 8.7]) box([-8.65, 0, z], [.28, 2.2, .23], '#718580', 'metal');
      break;
    case 'fruit':
      openBed(1.3);
      for (const x of [-5.8, 0, 5.8]) for (const y of [-1.8, 1.8]) {
        add('crate', [x, y, 5.1], [5.3, 3.2, 2.4], '#8a5937', 'cargo');
        for (const dy of [-1.62, 1.62]) for (const z of [4.4, 5.5]) box([x, y + dy, z], [5.3, .15, .65], '#d2a777', 'cargo');
        for (const [dx, dy] of [[-1.2,-.65],[1.2,-.65],[0,.65]]) {
          add('mound', [x + dx, y + dy, 6.3], [1.85, 1.55, 1.5], x === 0 ? '#bb3d36' : '#eda432', 'cargo');
        }
      }
      break;
    case 'flowers':
      box([0, 0, 3.2], [19.4, 7.8, .8]);
      for (const x of [-6.4, 0, 6.4]) {
        box([x, 0, 4], [5.7, 6.9, .8], '#786c56', 'cargo');
        for (const y of [-1.9, 1.9]) {
          add('pot', [x, y, 5], [2.4, 2.4, 2], '#b47d61', 'cargo');
          add('disc', [x, y, 6.3], [.3, .3, 2], '#527746', 'cargo');
          add('mound', [x, y, 6.25], [3.5, 2.7, 1.7], '#598351', 'cargo');
          add('flower', [x, y, 7.3], [4.3, 3.1, 1.7], x < 0 ? '#f0c85c' : x > 0 ? '#e3abd8' : '#ec8a9b', 'cargo');
          add('disc', [x, y, 8], [.9, .9, .25], '#a76a30', 'cargo');
        }
      }
      for (const y of [-3.7, 3.7]) {
        for (const x of [-9, 9]) box([x, y, 5.5], [.4, .4, 4.6]);
        box([0, y, 7.7], [18.4, .4, .35], 'trim');
        box([0, y, 4.3], [18.8, .4, 1.3]);
      }
      break;
    case 'boat':
      box([0, 0, 3.2], [19.5, 7.8, .8]);
      for (const x of [-5.6, 4.5]) add('cradle', [x, 0, 4.2], [2.4, 6.8, 1.7], '#8b795b', 'cargo');
      add('boat-hull', [0, 0, 5.6], [17.9, 6.6, 3], '#f1f0df');
      add('boat-deck', [0, 0, 7.12], [17.7, 6.4, .22], '#ba8551', 'cargo');
      for (const y of [-1.8, -.9, 0, .9, 1.8]) box([5.5, y, 7.27], [3.5, .08, .1], '#e4c99c', 'cargo');
      round([-2.2, 0, 7.28], [6.8, 4.5, .25], '#233e4e', 'glass');
      for (const y of [-1.05, 1.05]) {
        round([-3.2, y, 7.55], [2.2, 1.6, .45], '#e6dfc5');
        round([-4.2, y, 8.05], [.5, 1.7, 1.5], '#e6dfc5');
      }
      add('windshield', [1.6, 0, 8.1], [1.5, 4.7, 1.9], '#557f90', 'glass');
      for (const y of [-3.25, 3.25]) box([-2.5, y, 6.4], [11, .12, .35], 'paint');
      box([-9.15, 0, 5.7], [1, 1.5, 2.1], '#374850', 'metal');
      box([-8.35, 0, 7.3], [.6, 5.1, .18], '#ced6cb', 'metal');
      break;
    case 'tanker':
      for (const x of [-5.9, 5.9]) box([x, 0, 3.5], [2, 7.1, 2]);
      add('tank', [0, 0, 6.1], [17.8, 7.3, 7.3]);
      for (const x of [-5.7, 5.7]) add('tank', [x, 0, 6.1], [.65, 7.5, 7.5], 'trim');
      add('disc', [-.6, 0, 9.9], [2.9, 2.9, .8], 'trim');
      box([0, -3.9, 6], [1.9, .3, 4], '#b0c1c1', 'metal');
      break;
    case 'alfalfa':
      openBed(2.3);
      for (const x of [-5.7, 0, 5.7]) {
        round([x, 0, 6], [5.4, 6.4, 4.9], '#a7b755', 'cargo');
        box([x, 0, 8.5], [.55, 6.1, .18], '#d9d096', 'cargo');
        for (const y of [-3.22, 3.22]) box([x, y, 6.3], [.55, .2, 4.1], '#d9d096', 'cargo');
        for (const y of [-1.7, 1.7]) box([x, y, 8.49], [4.8, .14, .12], '#788943', 'cargo');
      }
      break;
    case 'grain':
      openBed(3.5);
      for (const x of [-5.7, 0, 5.7]) add('mound', [x, 0, 6.5], [6.4, 6.4, 2.6], '#efd78a', 'cargo');
      for (const x of [-5, 5]) box([x, 0, 3], [3, 5, 2]);
      break;
    case 'goods':
      // Two short intermodal containers: flat corrugated roofs, corner castings
      // and locking bars, clearly distinct from the rounded postal coach.
      box([0, 0, 3.1], [19.5, 8, .6]);
      for (const [x, height, color] of [[-4.65, 5.9, 'paint'], [4.65, 5.1, 'trim']]) {
        const z = 3.4 + height / 2;
        box([x, 0, z], [8.6, 7.2, height], color);
        for (const offset of [-3.3, -1.65, 0, 1.65, 3.3]) {
          for (const y of [-3.66, 3.66]) box([x + offset, y, z], [.32, .22, height - .6], color === 'paint' ? 'trim' : 'paint');
          box([x + offset, 0, 3.45 + height], [.26, 6.8, .16], color);
        }
        for (const dx of [-4.05, 4.05]) for (const y of [-3.4, 3.4]) {
          box([x + dx, y, 3.4 + height], [.55, .6, .4], '#ccd3cf', 'metal');
        }
        const end = x < 0 ? -9 : 9;
        for (const y of [-1.65, 1.65]) box([end, y, z], [.16, .18, height - .6], '#c7ceca', 'metal');
        box([end, 0, z], [.18, .12, height - .3], '#4b3e60', 'cargo');
      }
      break;
    case 'timber':
      box([0, 0, 3.2], [19, 7.8, 1]);
      for (const [y, z] of [[-1.8, 4.9], [1.8, 4.9], [0, 7.6]]) {
        add('tank', [0, y, z], [17.5, 3.3, 3.3], '#845c3a', 'cargo');
        for (const x of [-8.8, 8.8]) add('tank', [x, y, z], [.15, 2.8, 2.8], '#d7b67b', 'cargo');
      }
      for (const x of [-5.8, 5.8]) for (const y of [-3.7, 3.7]) box([x, y, 5.7], [.7, .7, 5.5]);
      break;
    case 'coal':
      // Deep tapered hopper, exposed rim and a dense, angular coal heap.
      add('hopper', [0, 0, 5], [18.4, 7.8, 4.4]);
      for (const y of [-3.8, 3.8]) {
        box([0, y, 7.25], [18.8, .35, .35], '#7f8b8b', 'metal');
      }
      for (const x of [-7, -3.5, 0, 3.5, 7]) add('hopper-rib', [x, 0, 5], [.45, 8.1, 4.4], 'trim');
      for (const x of [-9.1, 9.1]) box([x, 0, 7.25], [.35, 7.8, .35], '#7f8b8b', 'metal');
      add('mound', [0, 0, 7], [16.9, 6.7, 2.3], '#20292e', 'cargo');
      for (let i = 0; i < 21; i++) {
        const x = (i % 7 - 3) * 2.3, y = (Math.floor(i / 7) - 1) * 2.05;
        add('rock', [x + (i % 2) * .3, y, 7.25 + (i % 4) * .24], [2.5, 2.2, 1.7 + (i % 3) * .32],
          ['#20272d', '#333b43', '#434b53'][i % 3], 'cargo');
      }
      for (const x of [-4.5, 4.5]) box([x, 0, 2.9], [3, 4, 1.4], 'trim');
      break;
    case 'stone':
      // Low quarry flatbed: three massive cut stone blocks on timber bearers.
      openBed(1.1);
      for (const [x, height, color] of [[-5.9, 4.7, '#b9b6a7'], [0, 5.7, '#d8d0b8'], [5.9, 4.3, '#aaa99e']]) {
        for (const dx of [-1.5, 1.5]) box([x + dx, 0, 3.95], [.8, 6.7, .6], '#877353', 'cargo');
        add('quarry-block', [x, 0, 4.25 + height / 2], [5.3, 6.2, height], color, 'cargo');
        for (const y of [-3.105, 3.105]) for (const dz of [.3, .7]) {
          add('stone-vein', [x, y, 4.25 + height * dz], [4.4, .04, 2], '#929187', 'cargo');
        }
        // Broad straps follow the faces and secure each block to the bed.
        box([x, 0, 4.29 + height], [.45, 5.6, .12], '#545c5e', 'metal');
        for (const y of [-3.12, 3.12]) box([x, y, 4.1 + height / 2], [.45, .14, height + .2], '#545c5e', 'metal');
      }
      break;
    case 'steel':
      box([0, 0, 3.2], [19, 7.8, 1]);
      for (const x of [-5.8, 0, 5.8]) {
        add('cradle', [x, 0, 4.35], [5.6, 5.7, 1.5], 'trim');
        // The bore runs across the wagon. Flat annular ends show the layers
        // of sheet steel; a narrow band wraps the cylindrical outer surface.
        add('coil', [x, 0, 6.75], [5.1, 4.3, 5.1], '#c2ccce', 'steel');
        add('coil-rings', [x, 0, 6.75], [5.1, 4.32, 5.1], '#62777e', 'metal');
        add('coil-band', [x, 0, 6.75], [5.16, 4.3, 5.16], '#42565e', 'metal');
      }
      endWalls(1.5);
      break;
    case 'mail':
      round([0, 0, 5.5], [18.2, 7.4, 5.4]);
      add('roof', [0, 0, 8], [19, 7.8, 1.3], '#f0e6d0');
      windows([-6.4, 6.4], 6.25);
      for (const y of [-3.76, 3.76]) {
        box([0, y, 4.35], [17.8, .18, .6], '#f0e6d0');
        for (const x of [-3.2, 3.2]) {
          box([x, y, 6], [.18, .2, 3.8], 'trim');
          box([x * .86, y * 1.03, 5.2], [.18, .15, .85], '#eee4ce', 'metal');
        }
        box([0, y * 1.02, 6.25], [3.7, .16, 2], '#fff3d8');
        add('envelope-flap', [0, y * 1.05, 6.25], [3.5, .1, 1.8]);
        box([0, y, 3.25], [6.5, .6, .3], '#7a8990', 'metal');
      }
      for (const x of [-5.8, 5.8]) round([x, 0, 9.3], [2.2, 2.3, .65], '#7f9196', 'metal');
      // Postal emblem also reads in the board's overhead camera.
      box([0, 0, 9.34], [4.4, 3, .14]);
      box([0, 0, 9.44], [3.8, 2.5, .08], '#fff3d8');
      add('envelope-top', [0, 0, 9.51], [3.65, 2.35, .06]);
      break;
    case 'auto-carrier':
      // Two sports cars on an open carrier; dark glazing reads from above.
      round([0, 0, 3.1], [19.6, 8, .85]);
      for (const y of [-3.75, 3.75]) {
        box([0, y, 3.9], [19, .45, 1.1], 'trim');
        box([0, y, 3.3], [18.5, .5, .3], '#43351f', 'metal');
      }
      for (const x of [-9.3, 9.3]) box([x, 0, 3.6], [.55, 7.8, .4], 'trim');
      for (const x of [-4.65, 4.65]) {
        round([x, 0, 4.25], [8.4, 4.25, 1.05], '#17232c', 'metal');
        add('car-body', [x, 0, 5.25], [8.5, 4.4, 1.55]);
        add('canopy', [x - .55, 0, 6.65], [3.9, 3.4, 1.45], '#152d38', 'glass');
        round([x - .9, 0, 7.35], [1.5, 2.9, .14], 'trim');
        box([x + 2.7, 0, 5.92], [2, .28, .1], '#26343a', 'metal');
        box([x + 4.06, 0, 4.7], [.25, 3.9, .25], '#17232c', 'metal');
        box([x - 3.35, 0, 6.15], [.65, 4.6, .25], '#26343a', 'metal');
        for (const y of [-1.5, 1.5]) {
          box([x + 3.85, y, 5.55], [.3, .8, .28], '#f5f7e4', 'glass');
          box([x - 4, y, 5.3], [.18, .8, .24], '#9e302b', 'glass');
        }
        for (const axle of [-2.6, 2.55]) for (const y of [-2.12, 2.12]) {
          add('wheel', [x + axle, y, 4.65], [1.6, .55, 1.6], '#17232c', 'cargo');
          add('wheel', [x + axle, y * 1.12, 4.65], [1, .12, 1], 'trim');
        }
      }
      break;
    case 'passenger':
    default: {
      const carriage = PASSENGER_CARRIAGES[variant] || PASSENGER_CARRIAGES.classic;
      round([0, 0, 5.1], [18.3, 7.4, 4.7]);
      add('roof', [0, 0, 7.4], [19.2, 7.8, 2.1],carriage.roof);
      add('coach-roof-seams',[0,0,8.465],[13.12,7.84,2.13],'trim');
      for(const x of carriage.vents) add('coach-vent',[x,0,9.7],[1.65,1.3,.75],'#647374','metal');
      // End vestibules leave the five side windows and approved poses intact.
      add('coach-end-panels',[0,0,5.1],[18.5,2.45,3.7],'shade');
      add('coach-end-panels',[0,0,6.05],[18.68,1.5,1.55],'#56828c','glass');
      add('coach-door-frames',[0,0,5.1],[18.72,2.6,3.85],'#ead9b8','cargo');
      add('coach-handles',[0,0,5.1],[18.9,3.6,2.6],'#c8a66c','metal');
      add('coach-steps',[0,0,2.7],[21,3.5,.7],'#586b6b','metal');
      add('coach-window-frames',[0,0,5.65],[15.1,7.84,2.3],'#f0d9b2','cargo');
      add(carriage.double?'coach-belt-double':'coach-belt',[0,0,3.7],[17.4,7.7,carriage.double?.52:.35],carriage.belt,'cargo');
      const positions = {classic:[],solo:[0],duo:[-3.2,3.2],trio:[-6.4,0,6.4],lean:[-3.2,3.2],wave:[-3.2,3.2]}[variant] || [];
      for (const side of [-1,1]) {
        for (const [index,x] of [-6.4,-3.2,0,3.2,6.4].entries()) {
          const window = carriage.windows[index], open = window==='person'||window==='ajar';
          const warm = window==='warm'||window==='pair';
          box([x,side*3.74,5.65],[2.05,.12,2.05],open?'#152e35':warm?'#c7aa79':'#56828c',open?'cargo':'glass');
          if(window==='ajar') box([x,side*3.91,6.17],[1.86,.12,.95],'#80a4ab','glass');
          else if(['pair','left','right','blind'].includes(window)) {
            const direction = side<0 && window==='left'?'right':side<0 && window==='right'?'left':window;
            add(`coach-curtain-${direction}`,[x,side*3.94,5.65],[2.02,.14,1.98],carriage.curtain,'cargo');
          }
        }
        for (const [i,x] of positions.entries()) {
          const person = passengerPerson(cast,side,i);
          const half = i===0 && (variant==='wave' || variant==='lean');
          const tilt = (half ? (variant==='lean' ? 27 : 24) : 12) * Math.PI / 180;
          const sideways = half ? (variant==='lean' ? .16 : -.14) : (i%2 ? -.09 : .09);
          const rotation = uprightRotation([sideways,side*Math.sin(tilt),Math.cos(tilt)]);
          const waist = [x,side*(half ? 3.25 : 3.48),half ? 4.65 : 4.85], height = half ? 1.55 : .95;
          const point = offset => rotatePoint(offset,rotation).map((n,j)=>n+waist[j]);
          const body = point([0,0,height/2]), size = [1.55,.8,height];
          add('person-torso',body,size,person.clothes,'person',rotation);
          add(`shirt-${person.outfit}${side<0?'-back':''}`,body,size,person.accent,'person',rotation);
          // A true smooth sphere; no eyes, mouth, nose or other facial marks.
          // The waist stays inside the window; the head counters the torso's lean.
          const headRotation = uprightRotation([-sideways*.35,0,1]);
          const neck = point([0,0,height]);
          const head = half ? rotatePoint([0,0,.34],headRotation).map((n,j)=>n+neck[j]) : point([0,0,height+.34]);
          add('person-head',head,[1.45,1.45,1.45],person.skin,'person');
          const [hairZ,hairHeight] = {short:[.44,.68],bob:[.15,1.4],curly:[.43,.88],bun:[.38,1.2]}[person.hairstyle];
          const hair = rotatePoint([0,-side*.04,hairZ],headRotation).map((n,j)=>n+head[j]);
          add(`hair-${person.hairstyle}${side<0?'-back':''}`,hair,[1.55,1.5,hairHeight],person.hair,'person',headRotation);
          if (half) {
            const limb = (from,to,width,color) => {
              const direction=to.map((n,j)=>n-from[j]);
              add('person-limb',from.map((n,j)=>(n+to[j])/2),[width,width,Math.hypot(...direction)+width*.35],color,'person',uprightRotation(direction));
            };
            for (const arm of [-1,1]) {
              const waving = variant==='wave' && arm===1;
              const shoulder = point([arm*.58,0,height*.78]);
              const elbow = [x+arm*(waving?.98:.83),side*3.99,waving?5.83:4.96];
              const hand = [x+arm*(waving?1.28:.46),side*(waving?4.08:4.33),waving?6.65:4.86];
              limb(shoulder,elbow,.43,person.clothes);
              limb(elbow,hand,.29,person.skin);
              add('mound',hand,waving?[.38,.32,.43]:[.4,.32,.28],person.skin,'person');
            }
          }
        }
      }
      break;
    }
  }
  return parts;
}
