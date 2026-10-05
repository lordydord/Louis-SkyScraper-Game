import * as THREE from 'three';
import { KIND, STYLE_INDEX } from './materials.js';
import { GeoBuilder, square, circle, chamferSquare, rotateRing, yShape } from './geometry.js';
import { lerp, clamp } from '../util/math.js';
import { FLOOR_H } from '../config.js';

// Geometry for everything that fills a city: office blocks, houses, parks, trees,
// cars, people, and Moon/Mars base modules. All drawn with the building material.

export const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

const HOUSE_WALLS = [0xf3ead8, 0xe9e2d0, 0xf5f1e8, 0xdfe6ea, 0xefd9c0, 0xd9e4d0];
const ROOFS = [0xa6493d, 0x6e7378, 0x8a5a3c, 0x4f5966, 0xb5654a];

// An office/apartment block standing on (x, z).
export function officeBlock(b, rng, x, z, w, d, h, styleName) {
  const style = STYLE_INDEX[styleName] ?? STYLE_INDEX.filler;
  h = Math.max(FLOOR_H * 3, Math.round(h / FLOOR_H) * FLOOR_H);
  b.set({ kind: KIND.FACADE, style, color: [1, 1, 1] });
  const cellW = styleName === 'stone' ? 3 : styleName === 'round' ? 2.6 : 3;
  let ring;
  if (styleName === 'round') ring = circle(Math.min(w, d) / 2, 24);
  else if (styleName === 'twist') ring = rotateRing(chamferSquare(Math.min(w, d)), rng() * 3);
  else if (styleName === 'burj') ring = yShape(Math.min(w, d) * 1.1);
  else
    ring = [
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
      [-w / 2, -d / 2],
    ];
  const rows = Math.min(8, Math.ceil(h / 40));
  const ys = [];
  for (let r = 0; r <= rows; r++) ys.push((h * r) / rows);
  if (styleName === 'twist') {
    const rings = ys.map((y) => rotateRing(ring, (y / 120) * 0.9));
    b.loft(rings, ys, { cellW, cx: x, cz: z });
    b.set({ kind: KIND.ROOF });
    b.cap(rings[rings.length - 1], h, 1, x, z);
  } else {
    b.loft(
      ys.map(() => ring),
      ys,
      { cellW, cx: x, cz: z, smooth: styleName === 'round' },
    );
    b.set({ kind: KIND.ROOF });
    b.cap(ring, h, 1, x, z);
  }
  // Rooftop machinery, and sometimes a setback tier on top.
  if (styleName === 'stone' && h > 60 && rng() < 0.6) {
    const w2 = w * 0.7;
    const d2 = d * 0.7;
    const h2 = Math.round((h * (0.12 + rng() * 0.15)) / FLOOR_H) * FLOOR_H;
    b.set({ kind: KIND.FACADE, style });
    b.loft(
      [
        [
          [w2 / 2, -d2 / 2],
          [w2 / 2, d2 / 2],
          [-w2 / 2, d2 / 2],
          [-w2 / 2, -d2 / 2],
        ],
        [
          [w2 / 2, -d2 / 2],
          [w2 / 2, d2 / 2],
          [-w2 / 2, d2 / 2],
          [-w2 / 2, -d2 / 2],
        ],
      ],
      [h, h + h2],
      { cellW, cx: x, cz: z },
    );
    b.set({ kind: KIND.ROOF });
    b.box(x, h + h2, z, w2, 0.01, d2);
    h += h2;
  }
  b.set({ kind: KIND.WALL });
  if (styleName !== 'burj' && styleName !== 'round') b.box(x + w * 0.15, h, z - d * 0.1, w * 0.25, 3, d * 0.25);
  if (h > 120 && rng() < 0.5) {
    b.set({ kind: KIND.BEACON });
    b.box(x, h, z, 1, 1, 1);
  }
  return h;
}

// A little house with a pitched roof.
export function house(b, rng, x, z, rot) {
  const w = 9 + rng() * 4;
  const d = 8 + rng() * 3;
  const h = 5 + rng() * 2;
  const wall = rgb(HOUSE_WALLS[Math.floor(rng() * HOUSE_WALLS.length)]);
  const roof = rgb(ROOFS[Math.floor(rng() * ROOFS.length)]);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const P = (px, py, pz) => [x + px * c - pz * s, py, z + px * s + pz * c];
  b.set({ kind: KIND.PAINT, color: wall });
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateY(-rot);
  g.translate(x, h / 2, z);
  b.addGeometry(g);
  g.dispose();
  // Windows that glow at night.
  b.set({ kind: KIND.GLOW, color: rgb(0xffcf8a) });
  for (const side of [-1, 1]) {
    for (const wx of [-w * 0.25, w * 0.25]) {
      const p0 = P(wx - 0.8, h * 0.45, side * (d / 2 + 0.05));
      const p1 = P(wx + 0.8, h * 0.45, side * (d / 2 + 0.05));
      const p2 = P(wx + 0.8, h * 0.75, side * (d / 2 + 0.05));
      const p3 = P(wx - 0.8, h * 0.75, side * (d / 2 + 0.05));
      if (side > 0) b.quad(p0, p1, p2, p3);
      else b.quad(p1, p0, p3, p2);
    }
  }
  b.set({ kind: KIND.PAINT, color: roof });
  const rh = d * 0.45;
  const o = 0.6;
  const A = P(-w / 2 - o, h, -d / 2 - o);
  const B = P(w / 2 + o, h, -d / 2 - o);
  const C = P(w / 2 + o, h + rh, 0);
  const D = P(-w / 2 - o, h + rh, 0);
  const E = P(-w / 2 - o, h, d / 2 + o);
  const F = P(w / 2 + o, h, d / 2 + o);
  b.quad(A, D, C, B);
  b.quad(E, F, C, D);
  // Gable ends.
  const G = P(-w / 2, h, -d / 2);
  const H = P(-w / 2, h, d / 2);
  const I = P(-w / 2, h + rh * 0.9, 0);
  const J = P(w / 2, h, -d / 2);
  const K = P(w / 2, h, d / 2);
  const L = P(w / 2, h + rh * 0.9, 0);
  b.set({ kind: KIND.PAINT, color: wall });
  const t1 = [b.vert(...G, -c, 0, -s), b.vert(...H, -c, 0, -s), b.vert(...I, -c, 0, -s)];
  b.tri(t1[0], t1[1], t1[2]);
  b.tri(t1[0], t1[2], t1[1]);
  const t2 = [b.vert(...J, c, 0, s), b.vert(...K, c, 0, s), b.vert(...L, c, 0, s)];
  b.tri(t2[0], t2[1], t2[2]);
  b.tri(t2[0], t2[2], t2[1]);
}

// Flat ground pieces: pavements, lawns, plazas, ponds.
export function lot(b, x, z, w, d, color, y = 0.25) {
  b.set({ kind: KIND.PAINT, color: rgb(color) });
  b.box(x, 0, z, w, y, d);
}

export function pond(b, x, z, r) {
  b.set({ kind: KIND.WATER });
  b.cylinder(x, 0.1, z, r, r, 0.3, 28);
  b.set({ kind: KIND.PAINT, color: rgb(0xd9cfb5) });
  b.cylinder(x, 0.05, z, r + 2.5, r + 2.5, 0.3, 28);
}

// Construction fence around a building site.
export function fence(b, x, z, size) {
  const h = 2.4;
  const half = size / 2;
  b.set({ kind: KIND.PAINT, color: rgb(0x8a6d4a) });
  b.box(x, 0, z, size, 0.3, size);
  const posts = 10;
  for (let i = 0; i <= posts; i++) {
    const t = -half + (i / posts) * size;
    for (const [px, pz] of [
      [t, -half],
      [t, half],
      [-half, t],
      [half, t],
    ]) {
      b.set({ kind: KIND.PAINT, color: rgb(0xf08a24) });
      b.box(x + px, 0, z + pz, 0.5, h, 0.5);
    }
  }
  for (const [sx, sz, len, rotX] of [
    [0, -half, size, true],
    [0, half, size, true],
    [-half, 0, size, false],
    [half, 0, size, false],
  ]) {
    b.set({ kind: KIND.PAINT, color: rgb(0xf4f4f4) });
    b.box(x + sx, h * 0.55, z + sz, rotX ? len : 0.3, 0.5, rotX ? 0.3 : len);
    b.set({ kind: KIND.PAINT, color: rgb(0xf08a24) });
    b.box(x + sx, h * 0.85, z + sz, rotX ? len : 0.3, 0.4, rotX ? 0.3 : len);
  }
}

// ---- instanced things ----

export function treeGeometry() {
  const b = new GeoBuilder();
  b.set({ kind: KIND.PAINT, color: rgb(0x6d4c33), section: -1 });
  b.cylinder(0, 0, 0, 0.35, 0.28, 3.2, 6);
  b.set({ color: rgb(0xffffff) });
  const g = new THREE.IcosahedronGeometry(2.4, 0);
  g.scale(1, 1.15, 1);
  g.translate(0, 4.6, 0);
  b.addGeometry(g);
  g.dispose();
  return b.build();
}

export function palmGeometry() {
  const b = new GeoBuilder();
  b.set({ kind: KIND.PAINT, color: rgb(0x9c7a52), section: -1 });
  b.cylinder(0, 0, 0, 0.35, 0.25, 9, 6);
  b.set({ color: rgb(0xffffff) });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    b.beam([0, 9, 0], [Math.cos(a) * 4, 7.6, Math.sin(a) * 4], 0.9);
  }
  return b.build();
}

export function carGeometry(color) {
  const b = new GeoBuilder();
  b.set({ kind: KIND.PAINT, color: rgb(color), section: -1 });
  b.box(0, 0.35, 0, 4.4, 0.9, 1.9);
  b.set({ kind: KIND.PAINT, color: rgb(0x2a323c) });
  b.box(-0.2, 1.25, 0, 2.3, 0.75, 1.7);
  b.set({ kind: KIND.GLOW, color: rgb(0xfff2c8) });
  b.box(2.21, 0.6, 0.6, 0.05, 0.25, 0.35);
  b.box(2.21, 0.6, -0.6, 0.05, 0.25, 0.35);
  b.set({ kind: KIND.GLOW, color: rgb(0xff2a1a) });
  b.box(-2.21, 0.65, 0.65, 0.05, 0.2, 0.3);
  b.box(-2.21, 0.65, -0.65, 0.05, 0.2, 0.3);
  b.set({ kind: KIND.PAINT, color: rgb(0x1c1c1c) });
  for (const [x, z] of [
    [1.4, 0.95],
    [1.4, -0.95],
    [-1.4, 0.95],
    [-1.4, -0.95],
  ]) {
    b.box(x, 0, z, 0.7, 0.7, 0.25);
  }
  return b.build();
}

export function roverGeometry() {
  const b = new GeoBuilder();
  b.set({ kind: KIND.PAINT, color: rgb(0xf2f2f2), section: -1 });
  b.box(0, 0.9, 0, 4, 1.1, 2.4);
  b.set({ kind: KIND.PAINT, color: rgb(0x2c6fd6) });
  b.box(0.8, 2.0, 0, 1.4, 0.8, 2);
  b.set({ kind: KIND.METAL });
  b.box(-1, 2.0, 0, 0.15, 1.2, 0.15);
  b.set({ kind: KIND.PAINT, color: rgb(0x333333) });
  for (const [x, z] of [
    [1.4, 1.3],
    [1.4, -1.3],
    [-1.4, 1.3],
    [-1.4, -1.3],
    [0, 1.3],
    [0, -1.3],
  ]) {
    b.cylinder(x, 0, z, 0.5, 0.5, 0.35, 10);
  }
  b.set({ kind: KIND.GLOW, color: rgb(0xfff2c8) });
  b.box(2.01, 1.0, 0, 0.05, 0.25, 1.2);
  return b.build();
}

export function personGeometry({ astronaut = false } = {}) {
  const b = new GeoBuilder();
  b.set({ kind: KIND.PAINT, color: rgb(0xffffff), section: -1 });
  const body = new THREE.CapsuleGeometry(0.28, 0.75, 3, 8);
  body.translate(0, 1.0, 0);
  b.addGeometry(body);
  body.dispose();
  b.set({ color: astronaut ? rgb(0xffffff) : rgb(0xe8b98f) });
  b.sphere(0, 1.72, 0, astronaut ? 0.3 : 0.2, 8, 6);
  if (astronaut) {
    b.set({ kind: KIND.GLASS });
    b.sphere(0.12, 1.74, 0, 0.2, 8, 6);
  }
  b.set({ kind: KIND.PAINT, color: rgb(0x2b3340) });
  b.box(0.0, 0, 0.12, 0.2, 0.65, 0.18);
  b.box(0.0, 0, -0.12, 0.2, 0.65, 0.18);
  return b.build();
}

// ---- Moon / Mars base modules ----

export function baseModule(b, rng, x, z, world) {
  const r = rng();
  const white = rgb(0xf1f1ee);
  const accent = rgb(world === 'mars' ? 0xd9682b : 0x2c6fd6);
  if (r < 0.32) {
    // Dome habitat with glowing windows.
    const rad = 10 + rng() * 10;
    b.set({ kind: KIND.PAINT, color: white });
    b.sphere(x, 0, z, rad, 20, 8, { half: true });
    b.set({ kind: KIND.GLOW, color: rgb(0xffe2a6) });
    b.cylinder(x, rad * 0.25, z, rad * 0.98, rad * 0.9, rad * 0.12, 20);
    b.set({ kind: KIND.PAINT, color: accent });
    b.cylinder(x, 0, z, rad * 1.02, rad * 1.02, 1.2, 20);
  } else if (r < 0.55) {
    // Long module lying down, with a little airlock.
    const len = 18 + rng() * 14;
    const rad = 3 + rng() * 1.5;
    const g = new THREE.CylinderGeometry(rad, rad, len, 14);
    g.rotateZ(Math.PI / 2);
    g.translate(x, rad + 0.6, z);
    b.set({ kind: KIND.PAINT, color: white });
    b.addGeometry(g);
    g.dispose();
    b.set({ kind: KIND.PAINT, color: accent });
    b.box(x + len / 2, 0.6, z, 2, rad * 1.6, rad * 1.6);
    b.set({ kind: KIND.GLOW, color: rgb(0xbfe3ff) });
    b.box(x, rad + 0.6, z + rad - 0.1, len * 0.6, 0.6, 0.3);
  } else if (r < 0.78) {
    // Solar panel farm.
    b.set({ kind: KIND.PAINT, color: rgb(0x1d3566) });
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        b.box(x - 15 + i * 10, 2.2, z - 5 + j * 10, 8, 0.3, 6);
      }
    }
    b.set({ kind: KIND.METAL });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.box(x - 15 + i * 10, 0, z - 5 + j * 10, 0.4, 2.2, 0.4);
  } else if (r < 0.9) {
    // Radio dish.
    b.set({ kind: KIND.METAL });
    b.cylinder(x, 0, z, 0.8, 0.6, 8, 8);
    const g = new THREE.SphereGeometry(7, 18, 6, 0, Math.PI * 2, 0, Math.PI / 3.2);
    g.rotateX(Math.PI * 0.75);
    g.translate(x, 9, z);
    b.set({ kind: KIND.PAINT, color: white });
    b.addGeometry(g);
    g.dispose();
  } else {
    // Rocket on a launch pad!
    b.set({ kind: KIND.PAINT, color: rgb(0x55585e) });
    b.cylinder(x, 0, z, 14, 14, 1, 24);
    b.set({ kind: KIND.PAINT, color: rgb(0xffd23f) });
    b.cylinder(x, 1, z, 12, 12, 0.1, 24);
    b.set({ kind: KIND.PAINT, color: white });
    b.cylinder(x, 1, z, 3, 3, 34, 16);
    b.set({ kind: KIND.PAINT, color: rgb(0xd8352b) });
    b.cylinder(x, 35, z, 3, 0.1, 9, 16);
    b.cylinder(x, 1, z, 3.05, 3.05, 4, 16);
    b.set({ kind: KIND.GLOW, color: rgb(0x9fd8ff) });
    b.cylinder(x, 26, z, 3.05, 3.05, 1.2, 16);
    b.set({ kind: KIND.METAL });
    b.box(x + 6, 1, z, 1.5, 40, 1.5);
  }
}

export function crater(b, x, z, r, color) {
  const rim = rgb(color);
  const dark = rim.map((v) => v * 0.78);
  b.set({ kind: KIND.PAINT, color: rim });
  const n = 28;
  const outer = circle(r * 1.25, n);
  const top = circle(r, n);
  b.loft([outer, top], [0, r * 0.08], { smooth: true, cx: x, cz: z, cellW: 1e9 });
  b.set({ color: dark });
  b.loft([top, circle(r * 0.75, n)], [r * 0.08, 0.15], { smooth: true, cx: x, cz: z, cellW: 1e9 });
  b.cap(circle(r * 0.75, n), 0.15, 1, x, z);
}
