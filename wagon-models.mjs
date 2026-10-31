// Public presentation only. Model, owner paint and finish are independent.
export const WAGON_STYLES = Object.freeze([
  { color: '#d45748', model: 'passenger', label: 'Pasajeros' },
  { color: '#458ad4', model: 'tanker', label: 'Cisterna' },
  { color: '#4b9d76', model: 'alfalfa', label: 'Alfalfa' },
  { color: '#ddaf40', model: 'grain', label: 'Grano' },
  { color: '#9a75ba', model: 'goods', label: 'Mercancías' },
  { color: '#88583d', model: 'timber', label: 'Troncos' },
  { color: '#b88929', model: 'luxury', label: 'Coche de oro', finish: 'gold' },
  { color: '#242831', model: 'coal', label: 'Carbón' },
  { color: '#7c8796', model: 'stone', label: 'Piedra' },
  { color: '#c43d92', model: 'mail', label: 'Correo' },
  { color: '#1baaa6', model: 'steel', label: 'Bobinas' },
].map(style => Object.freeze({ finish: 'paint', ...style })));

export function wagonStyle(color, customization = {}) {
  const canonical = color?.toLowerCase() === '#f4d83d' ? '#ddaf40' : color?.toLowerCase();
  const base = WAGON_STYLES.find(s => s.color === canonical) || WAGON_STYLES[0];
  const model = WAGON_STYLES.some(s => s.model === customization.model) ? customization.model : base.model;
  const finish = ['paint', 'gold'].includes(customization.finish) ? customization.finish : base.finish;
  return { model, finish, color: color || base.color };
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
      box([0, 0, 5.5], [18.2, 7.4, 5.6]);
      add('roof', [0, 0, 8.1], [18.8, 7.8, 1.5], 'trim');
      for (const y of [-3.82, 3.82]) {
        box([0, y, 5.5], [5.3, .25, 4.6], 'trim');
        box([1.6, y * 1.04, 5.3], [.3, .22, 1.4], '#e6dabe', 'metal');
        for (const x of [-7, -4.5, 4.5, 7]) box([x, y, 5.5], [.35, .2, 4.6], 'trim');
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
    case 'stone':
      openBed(3.3);
      for (let i = 0; i < 9; i++) {
        const x = (i % 3 - 1) * 5.2, y = (Math.floor(i / 3) - 1) * 2.1;
        add('rock', [x + (i % 2) * .5, y, 6.1 + (i % 3) * .3], [4.7, 3.4, 2.8 + (i % 2)],
          model === 'coal' ? ['#29343a', '#39454b', '#475158'][i % 3] : ['#a9b7b6', '#d2d2be', '#899a9e'][i % 3], 'cargo');
      }
      break;
    case 'steel':
      box([0, 0, 3.2], [19, 7.8, 1]);
      for (const x of [-5.8, 0, 5.8]) {
        box([x, 0, 4], [4.3, 6.3, 1.2]);
        add('coil', [x, 0, 6.8], [4.3, 5.6, 5.6], '#a7b8bb', 'metal');
      }
      endWalls(1.5);
      break;
    case 'mail':
      round([0, 0, 5.4], [18.2, 7.4, 5.2]);
      add('roof', [0, 0, 7.9], [19, 7.8, 1.6], 'trim');
      windows([-6, 6]);
      for (const y of [-3.76, 3.76]) {
        box([0, y, 5.2], [6, .18, 4.3], 'trim');
        box([0, y * 1.03, 5.6], [3.7, .15, 1.9], '#f0e1c8');
        box([0, y * 1.05, 4.5], [.25, .2, 1.5], '#263b40', 'metal');
      }
      break;
    case 'luxury':
    case 'passenger':
    default:
      round([0, 0, 5.1], [18.3, 7.4, 4.7]);
      add('roof', [0, 0, 7.4], [19.2, 7.8, 2.1]);
      windows([-6.2, -3.1, 0, 3.1, 6.2]);
      for (const y of [-3.76, 3.76]) {
        box([0, y, 3.7], [17.4, .18, .45], 'trim');
        box([0, y, 6.7], [17.4, .18, .3], 'trim');
      }
      if (model === 'luxury') {
        for (const x of [-7.9, 7.9]) box([x, 0, 7.5], [.35, 7.8, .3], 'trim');
        round([0, 0, 9.15], [9.8, 3.9, .85], 'trim');
      }
      break;
  }
  return parts;
}
