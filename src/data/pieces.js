// Everything Louie can build with. `price` is in coins (0 = free from the start).
//
// Floor sections ('section') are measured in floors and can be stretched.
// Toppers ('top') always sit on the very top of the tower.

export const PIECES = {
  glass: { cat: 'section', geo: 'box', style: 'glass', floors: 10, price: 0 },
  stone: { cat: 'section', geo: 'box', style: 'stone', floors: 10, price: 0, ledge: true },
  round: { cat: 'section', geo: 'round', style: 'round', floors: 10, price: 0 },
  taper: { cat: 'section', geo: 'taper', style: 'glass', floors: 12, price: 50, topScale: 0.72 },
  twist: { cat: 'section', geo: 'twist', style: 'twist', floors: 15, price: 120, twistPerFloor: 1.25 },
  burj: { cat: 'section', geo: 'y', style: 'burj', floors: 14, price: 150, step: 0.84 },
  damper: { cat: 'section', geo: 'damper', style: 'glass', floors: 6, price: 200, fixed: true },
  bridge: { cat: 'section', geo: 'bridge', style: 'glass', floors: 3, price: 100, fixed: true },

  spire: { cat: 'top', geo: 'spire', price: 0, stretch: true },
  antenna: { cat: 'top', geo: 'antenna', price: 50, stretch: true },
  pyramid: { cat: 'top', geo: 'pyramid', price: 60 },
  dome: { cat: 'top', geo: 'dome', price: 80 },
  crown: { cat: 'top', geo: 'crown', price: 200 },
};

// Order shown in the inventory bar.
export const INVENTORY = [
  'glass',
  'stone',
  'round',
  'spire',
  'taper',
  'burj',
  'twist',
  'crown',
  'dome',
  'pyramid',
  'antenna',
  'damper',
  'bridge',
];

// Look of each building style before Louie repaints it. Colours are sRGB hex.
// cell = [window column width, floor height] in metres; win = window size as a
// fraction of the cell.
export const STYLES = {
  glass: { wall: 0xd7dde3, glass: 0x5f8fb0, cell: [3, 4], win: [0.84, 0.74] },
  stone: { wall: 0xd8cbb4, glass: 0x2f3f52, cell: [3, 4], win: [0.46, 0.58] },
  round: { wall: 0xe4e8ec, glass: 0x7ba7c4, cell: [2.6, 4], win: [0.88, 0.8] },
  twist: { wall: 0xcfd8de, glass: 0x4f9aa3, cell: [3, 4], win: [0.86, 0.8] },
  burj: { wall: 0xc9d1d9, glass: 0x8aa6bc, cell: [2.2, 4], win: [0.62, 0.82] },
};

// Paint colours for decorating (index 0 = keep the style's own colour).
export const WALL_COLOURS = [null, 0xf4f4f0, 0x2b2d33, 0xd9b24a, 0xc8463d, 0x3f6fd8, 0x3fa65a, 0xe58fb8, 0x8a5cd6];
export const GLASS_COLOURS = [null, 0x3b7fd9, 0x2bb3b0, 0xc9a646, 0xb9c4cc, 0xd96aa0, 0x4fae5b, 0x7b55c9, 0x1d2430];

// Light show colours. The last one is a rainbow.
export const LIGHT_COLOURS = [0xffffff, 0xff4d4d, 0xff9b3d, 0xffe14d, 0x52e06a, 0x45d6ff, 0x4d7bff, 0xb05cff, 0xff6fcf, -1];

// Light show patterns. Every pattern is slow and smooth: nothing flashes.
export const LIGHT_PATTERNS = ['off', 'solid', 'wave', 'sparkle', 'stripes', 'breathe', 'heart', 'star'];
export const LIGHT_PRICES = { off: 0, solid: 0, wave: 60, sparkle: 60, stripes: 40, breathe: 40, heart: 120, star: 120 };

// Rooftop extras.
export const EXTRAS = {
  beacons: { price: 0 },
  flag: { price: 30 },
  garden: { price: 60 },
  helipad: { price: 80 },
  pool: { price: 100 },
  spotlights: { price: 120 },
};
export const EXTRAS_ORDER = ['beacons', 'flag', 'garden', 'helipad', 'pool', 'spotlights'];
