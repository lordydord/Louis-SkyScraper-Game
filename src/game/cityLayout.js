// What each place looks like before Louie builds anything: blocks taken by
// landmarks, water and parks, and how tall the surrounding buildings are.
// Coordinates are city blocks (see BLOCK in config.js); +z is south, -z is north.

export const LAYOUTS = {
  newcity: {
    landmarks: [],
    parks: [],
    water: [],
    fill: null, // grows around Louie's towers
  },
  dubai: {
    landmarks: [
      { key: 'burj', block: [0, 0] },
      { key: 'burjalarab', block: [3, -6], island: 70 },
    ],
    parks: [{ block: [0, 1], lake: true }],
    // The sea (Persian Gulf) to the north.
    water: [{ x0: -60, x1: 60, z0: -60, z1: -4.5 }],
    fill: { radius: 4, minH: 30, maxH: 300, styles: ['glass', 'glass', 'glass', 'glass', 'filler', 'filler', 'round', 'twist'], palms: true },
  },
  newyork: {
    landmarks: [
      { key: 'empire', block: [0, 0] },
      { key: 'chrysler', block: [2, -1] },
      { key: 'onewtc', block: [-1, 5] },
      { key: 'liberty', block: [-6, 9], island: 120 },
    ],
    parks: [
      { block: [-1, -5] },
      { block: [0, -5], lake: true },
      { block: [1, -5] },
      { block: [-1, -6] },
      { block: [0, -6] },
      { block: [1, -6] },
    ],
    // Hudson River to the west, East River to the east, the harbour to the south.
    water: [
      { x0: -60, x1: -3.5, z0: -60, z1: 60 },
      { x0: 4.5, x1: 60, z0: -60, z1: 60 },
      { x0: -60, x1: 60, z0: 6.5, z1: 60 },
    ],
    fill: { radius: 6, minH: 30, maxH: 230, styles: ['stone', 'stone', 'glass', 'filler'], pencil: true },
  },
  // A small base around the landing site that grows as Louie builds.
  moon: {
    landmarks: [],
    parks: [],
    water: [],
    fill: { radius: 1.5 },
    base: true,
  },
  mars: {
    landmarks: [],
    parks: [],
    water: [],
    fill: { radius: 1.5 },
    base: true,
  },
};

export function inWater(layout, bx, bz) {
  return layout.water.some((w) => bx >= w.x0 && bx <= w.x1 && bz >= w.z0 && bz <= w.z1);
}

// Blocks Louie can't build on.
export function reservedBlocks(placeId) {
  const L = LAYOUTS[placeId];
  const out = [];
  for (const l of L.landmarks) out.push(l.block);
  for (const p of L.parks) out.push(p.block);
  // Water blocks near the middle (the spiral never goes far).
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) if (inWater(L, x, z)) out.push([x, z]);
  return out;
}
