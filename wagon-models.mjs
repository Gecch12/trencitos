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
].map(style => Object.freeze({ finish: 'paint', ...style })));

export function wagonStyle(color, customization = {}) {
  const canonical = color?.toLowerCase() === '#f4d83d' ? '#ddaf40' : color?.toLowerCase();
  const base = WAGON_STYLES.find(s => s.color === canonical || s.paint === canonical) || WAGON_STYLES[0];
  const model = WAGON_STYLES.some(s => s.model === customization.model) ? customization.model : base.model;
  const finish = ['paint', 'gold'].includes(customization.finish) ? customization.finish : base.finish;
  return { model, finish, color: base.paint || color || base.color };
}

// Normalized primitives; coordinates are longitudinal X, width Y, height Z.
// Paint is resolved by the renderer, so changing a model never changes ownership.
export function wagonParts(model) {
  const parts = [];
  const add = (shape, xyz, size, color = 'paint', material = 'paint') => parts.push({ shape, xyz, size, color, material });
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
    default:
      round([0, 0, 5.1], [18.3, 7.4, 4.7]);
      add('roof', [0, 0, 7.4], [19.2, 7.8, 2.1]);
      windows([-6.2, -3.1, 0, 3.1, 6.2]);
      for (const y of [-3.76, 3.76]) {
        box([0, y, 3.7], [17.4, .18, .45], 'trim');
        box([0, y, 6.7], [17.4, .18, .3], 'trim');
      }
      break;
  }
  return parts;
}
