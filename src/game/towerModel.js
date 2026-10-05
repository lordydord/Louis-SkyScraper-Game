// Pure tower data helpers (no three.js), so they can be unit tested in Node.
//
// A tower is plain JSON:
// {
//   id, city, plot: [ix, iz], twin: false,
//   parts: [{ t: 'glass', w: 52, h: 40 }, ..., { t: 'spire', w: 0, h: 80 }],
//   deco: { wall, glass, light: { c, p }, extras: { beacons: true, ... } },
//   done, coins, created, finished
// }
// Floor sections have a width `w` (metres across) and height `h` (a whole number of
// floors). Toppers have no width of their own: they sit on the section below.

import { FLOOR_H, SIZES, MIN_W, MAX_HEIGHT } from '../config.js';
import { PIECES } from '../data/pieces.js';

const DEFAULT_W = SIZES[2];
const MIN_FLOORS = 2;

export function newTower({ id, city, plot }) {
  return {
    id,
    city,
    plot,
    twin: false,
    parts: [],
    deco: defaultDeco(),
    done: false,
    coins: 0,
    created: Date.now(),
    finished: 0,
  };
}

export function defaultDeco() {
  return { wall: 0, glass: 0, light: { c: 9, p: 'off' }, extras: { beacons: true } };
}

export const isTop = (part) => PIECES[part.t].cat === 'top';

export function towerHeight(tower) {
  let h = 0;
  for (const p of tower.parts) h += p.h;
  return h;
}

export function partTopWidth(part) {
  const def = PIECES[part.t];
  return def.geo === 'taper' ? part.w * def.topScale : part.w;
}

// Each part with the height it starts at (z0), ends at (z1), its bottom width (w)
// and top width (topW). Toppers report the width of the roof they sit on.
export function layout(tower) {
  let z = 0;
  let below = null;
  return tower.parts.map((part, i) => {
    const def = PIECES[part.t];
    const top = def.cat === 'top';
    const w = top ? (below ? partTopWidth(below) : DEFAULT_W) : part.w;
    const item = { i, part, def, top, z0: z, z1: z + part.h, w, topW: top ? 0 : partTopWidth(part) };
    z += part.h;
    if (!top) below = part;
    return item;
  });
}

export function lastSection(tower) {
  for (let i = tower.parts.length - 1; i >= 0; i--) if (!isTop(tower.parts[i])) return tower.parts[i];
  return null;
}

export function topperIndex(tower) {
  const i = tower.parts.length - 1;
  return i >= 0 && isTop(tower.parts[i]) ? i : -1;
}

export function hasBridge(tower) {
  return tower.parts.some((p) => p.t === 'bridge');
}

function topperHeight(id, w) {
  switch (id) {
    case 'spire':
      return Math.round(Math.max(30, w * 1.6));
    case 'antenna':
      return Math.round(Math.max(40, w * 1.2));
    case 'pyramid':
      return Math.max(8, Math.round(w * 0.6));
    case 'dome':
      return Math.max(8, Math.round(w * 0.55));
    case 'crown':
      return Math.max(20, Math.round(w * 1.9));
    default:
      return 20;
  }
}

// Recalculate anything derived from other parts: toppers with a fixed shape follow
// the width of the roof they sit on, and the whole tower stays under MAX_HEIGHT.
export function normalize(tower) {
  const parts = tower.parts.map((p) => ({ ...p }));
  // Keep at most one topper, and keep it on the top.
  const tops = parts.filter((p) => isTop(p));
  const sections = parts.filter((p) => !isTop(p));
  const ordered = tops.length ? [...sections, tops[tops.length - 1]] : sections;
  const t = { ...tower, parts: ordered };
  const lay = layout(t);
  for (const item of lay) {
    if (item.top && !item.def.stretch) item.part.h = topperHeight(item.part.t, item.w);
  }
  // Trim from the top if the tower got too tall.
  let excess = towerHeight(t) - MAX_HEIGHT;
  for (let i = ordered.length - 1; i >= 0 && excess > 0; i--) {
    const p = ordered[i];
    const def = PIECES[p.t];
    const min = isTop(p) ? 5 : MIN_FLOORS * FLOOR_H;
    if (def.fixed || (isTop(p) && !def.stretch)) continue;
    const cut = Math.min(excess, p.h - min);
    if (cut > 0) {
      p.h = isTop(p) ? p.h - cut : Math.max(min, Math.floor((p.h - cut) / FLOOR_H) * FLOOR_H);
      excess = towerHeight(t) - MAX_HEIGHT;
    }
  }
  return t;
}

// Add a piece. Sections go on top of the highest section (underneath any topper);
// a topper replaces the current topper. Returns { tower, index } or null if there
// is no room left below the height limit.
export function addPart(tower, id) {
  const def = PIECES[id];
  if (!def) return null;
  if (towerHeight(tower) >= MAX_HEIGHT - FLOOR_H * MIN_FLOORS && def.cat !== 'top') return null;
  const parts = tower.parts.map((p) => ({ ...p }));
  const below = lastSection(tower);
  const tIdx = topperIndex(tower);
  let index;
  if (def.cat === 'top') {
    if (tIdx >= 0) parts.splice(tIdx, 1);
    const w = below ? partTopWidth(below) : DEFAULT_W;
    parts.push({ t: id, w: 0, h: topperHeight(id, w) });
    index = parts.length - 1;
  } else {
    let w = below ? partTopWidth(below) : DEFAULT_W;
    if (def.step && below && PIECES[below.t].step) w *= def.step;
    w = Math.max(MIN_W, Math.round(w * 10) / 10);
    const part = { t: id, w, h: def.floors * FLOOR_H };
    if (tIdx >= 0) {
      parts.splice(tIdx, 0, part);
      index = tIdx;
    } else {
      parts.push(part);
      index = parts.length - 1;
    }
  }
  return { tower: normalize({ ...tower, parts }), index };
}

export function canStretch(part) {
  if (!part) return false;
  const def = PIECES[part.t];
  return def.cat === 'top' ? !!def.stretch : !def.fixed;
}

export function canResize(part) {
  return !!part && !isTop(part);
}

// Stretch a part by `deltaM` metres. Sections snap to whole floors.
export function stretchPart(tower, index, deltaM) {
  const part = tower.parts[index];
  if (!canStretch(part)) return tower;
  const parts = tower.parts.map((p) => ({ ...p }));
  const p = parts[index];
  const room = MAX_HEIGHT - towerHeight(tower);
  const d = Math.min(deltaM, room);
  if (isTop(p)) {
    p.h = Math.max(5, Math.round((p.h + d) * 10) / 10);
  } else {
    const floors = Math.max(MIN_FLOORS, Math.round((p.h + d) / FLOOR_H));
    p.h = floors * FLOOR_H;
  }
  return normalize({ ...tower, parts });
}

export function setPartWidth(tower, index, w) {
  const part = tower.parts[index];
  if (!canResize(part)) return tower;
  const parts = tower.parts.map((p) => ({ ...p }));
  parts[index].w = Math.max(MIN_W, w);
  return normalize({ ...tower, parts });
}

export function setTwin(tower, twin) {
  return { ...tower, twin: !!twin };
}

export function floorsOf(tower) {
  let n = 0;
  for (const p of tower.parts) if (!isTop(p)) n += Math.round(p.h / FLOOR_H);
  return n;
}

// Square spiral over city blocks: 0 -> [0,0], 1 -> [1,0], 2 -> [1,1], ...
export function spiralBlock(n) {
  if (n === 0) return [0, 0];
  let x = 0;
  let z = 0;
  let dx = 1;
  let dz = 0;
  let segLen = 1;
  let segPassed = 0;
  let turns = 0;
  for (let i = 0; i < n; i++) {
    x += dx;
    z += dz;
    segPassed++;
    if (segPassed === segLen) {
      segPassed = 0;
      [dx, dz] = [-dz, dx];
      turns++;
      if (turns % 2 === 0) segLen++;
    }
  }
  return [x, z];
}

// The n-th free plot of a city, skipping blocks reserved for landmarks or water.
export function freePlot(n, reserved = []) {
  const taken = new Set(reserved.map(([x, z]) => `${x},${z}`));
  let found = -1;
  for (let i = 0; i < 10000; i++) {
    const b = spiralBlock(i);
    if (taken.has(`${b[0]},${b[1]}`)) continue;
    found++;
    if (found === n) return b;
  }
  return [n, 0];
}
