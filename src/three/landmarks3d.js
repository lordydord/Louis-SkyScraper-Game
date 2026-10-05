import * as THREE from 'three';
import { KIND, STYLE_INDEX } from './materials.js';
import { GeoBuilder, square, circle, chamferSquare, yShape, rotateRing, scaleRing } from './geometry.js';
import { lerp, mulberry32 } from '../util/math.js';

// Simplified models of famous buildings, at their real heights (metres).
// They are used two ways: as see-through "ghosts" beside Louie's tower to compare
// heights, and as solid landmarks in the Dubai and New York cities.

const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const ST = STYLE_INDEX;

function prism(b, ring, y0, y1, { kind = KIND.FACADE, style = ST.glass, cellW = 3, x = 0, z = 0, roof = true, rows = 1 } = {}) {
  b.set({ kind, style });
  const ys = [];
  for (let r = 0; r <= rows; r++) ys.push(lerp(y0, y1, r / rows));
  b.loft(
    ys.map(() => ring),
    ys,
    { cellW, cx: x, cz: z, smooth: ring.length > 16 },
  );
  if (roof) {
    b.set({ kind: KIND.ROOF });
    b.cap(ring, y1, 1, x, z);
  }
}

function frustum(b, ring0, ring1, y0, y1, { kind = KIND.FACADE, style = ST.glass, cellW = 3, x = 0, z = 0, roof = true, rows = 4 } = {}) {
  b.set({ kind, style });
  const ys = [];
  const rings = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    ys.push(lerp(y0, y1, t));
    rings.push(ring0.map((p, i) => [lerp(p[0], ring1[i][0], t), lerp(p[1], ring1[i][1], t)]));
  }
  b.loft(rings, ys, { cellW, cx: x, cz: z, smooth: ring0.length > 16 });
  if (roof) {
    b.set({ kind: KIND.ROOF });
    b.cap(rings[rings.length - 1], y1, 1, x, z);
  }
}

function needle(b, x, y0, h, r0, z = 0) {
  b.set({ kind: KIND.METAL });
  b.cylinder(x, y0, z, r0, 0.08, h, 10, false);
}

function rect(wx, wz) {
  return [
    [wx / 2, -wz / 2],
    [wx / 2, wz / 2],
    [-wx / 2, wz / 2],
    [-wx / 2, -wz / 2],
  ];
}

// Outline helpers that keep the same number of points so they can morph.
function roundedTriangle(r, n = 36) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + 0.12 * Math.cos(3 * a));
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

function threePetal(r, n = 36) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.72 + 0.28 * Math.pow(Math.abs(Math.cos((3 * a) / 2)), 1.5));
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

function star8(r, inner = 0.8) {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    out.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return out;
}

function mountain(b, height, radius, seed, { snow = true, color = 0x8a8178, snowLine = 0.62 } = {}) {
  const rng = mulberry32(seed);
  const rings = [];
  const ys = [];
  const n = 40;
  const rows = 14;
  const jitter = [];
  for (let i = 0; i < n; i++) jitter.push(0.75 + rng() * 0.5);
  const base = rgb(color);
  const white = rgb(0xf4f6f8);
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    const rr = radius * Math.pow(1 - t, 1.35) + 1;
    ys.push(height * t);
    rings.push(
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const j = lerp(jitter[i], 1, t * 0.5);
        return [Math.cos(a) * rr * j, Math.sin(a) * rr * j];
      }),
    );
  }
  for (let r = 0; r < rows; r++) {
    const t = r / rows;
    b.set({ kind: KIND.PAINT, color: snow && t >= snowLine ? white : base });
    b.loft([rings[r], rings[r + 1]], [ys[r], ys[r + 1]], { cellW: 1e9 });
  }
}

const BUILDERS = {
  liberty(b) {
    b.set({ kind: KIND.PAINT, color: rgb(0xb9ae9a) });
    b.loft([star8(46, 0.72), star8(46, 0.72)], [0, 12], { cellW: 1e9 });
    b.cap(star8(46, 0.72), 12, 1);
    frustum(b, square(20), square(16), 12, 47, { kind: KIND.WALL, style: ST.stone, roof: true });
    const green = rgb(0x6fa892);
    b.set({ kind: KIND.PAINT, color: green });
    b.cylinder(0, 47, 0, 6.5, 3.2, 28, 14);
    b.sphere(0, 77, 0, 3.4, 12, 8);
    for (let i = 0; i < 7; i++) {
      const a = -0.6 + (i / 6) * 1.2 + Math.PI / 2;
      b.beam([0, 79, 0], [Math.cos(a) * 3.2, 82.5, Math.sin(a) * 3.2 + 1.5], 0.6);
    }
    b.beam([2.6, 72, 0], [4.2, 88, 0], 1.9);
    b.set({ kind: KIND.GOLD });
    b.cylinder(4.3, 88, 0, 1.8, 1.4, 1.4, 10);
    b.set({ kind: KIND.GLOW, color: rgb(0xffb43a) });
    b.cylinder(4.3, 89.4, 0, 1.3, 0.1, 3.6, 8, false);
    return { w: 92 };
  },

  bigben(b) {
    prism(b, square(12), 0, 61, { kind: KIND.FACADE, style: ST.stone, cellW: 2.4, roof: false });
    prism(b, square(13.5), 61, 73, { kind: KIND.WALL, style: ST.stone, roof: false });
    b.set({ kind: KIND.GLOW, color: rgb(0xfff4d6) });
    for (let f = 0; f < 4; f++) {
      const a = (f * Math.PI) / 2;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const g = new THREE.CircleGeometry(4.6, 24);
      g.lookAt(new THREE.Vector3(nx, 0, nz));
      g.translate(nx * 6.8, 67, nz * 6.8);
      b.addGeometry(g);
      g.dispose();
    }
    prism(b, square(11), 73, 80, { kind: KIND.WALL, style: ST.stone, roof: false });
    b.set({ kind: KIND.PAINT, color: rgb(0x3c4450) });
    b.loft([square(11.5), square(0.3)], [80, 94], { cellW: 1e9 });
    b.set({ kind: KIND.GOLD });
    b.cylinder(0, 94, 0, 0.3, 0.05, 2, 6);
    return { w: 14 };
  },

  pyramid(b) {
    b.set({ kind: KIND.PAINT, color: rgb(0xd9bf8c) });
    b.loft([square(230), square(2)], [0, 139], { cellW: 1e9 });
    return { w: 230 };
  },

  shard(b) {
    frustum(b, square(58), square(10), 0, 288, { style: ST.glass, rows: 8, roof: false });
    b.set({ kind: KIND.GLASS });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.3;
      const x = Math.cos(a) * 3;
      const z = Math.sin(a) * 3;
      b.loft([rotateRing(rect(5, 1.5), a), rotateRing(rect(0.4, 0.2), a)], [280, 310 - i * 3], { cx: x, cz: z, cellW: 1e9 });
    }
    return { w: 58 };
  },

  chrysler(b) {
    prism(b, square(62), 0, 60, { style: ST.stone, rows: 2 });
    prism(b, square(48), 60, 120, { style: ST.stone, rows: 2 });
    prism(b, square(38), 120, 238, { style: ST.stone, rows: 4 });
    // Stepped crown with triangle windows and a needle.
    for (let k = 0; k < 5; k++) {
      const w = 34 - k * 5.4;
      const y = 238 + k * 9;
      b.set({ kind: KIND.METAL });
      b.box(0, y, 0, w, 9, w);
      b.set({ kind: KIND.GLOW, color: rgb(0xffe0a0) });
      for (let f = 0; f < 4; f++) {
        const a = (f * Math.PI) / 2;
        const nx = Math.cos(a);
        const nz = Math.sin(a);
        for (let q = -1; q <= 1; q++) {
          const tx = -nz * q * w * 0.25;
          const tz = nx * q * w * 0.25;
          const px = nx * (w / 2 + 0.1) + tx;
          const pz = nz * (w / 2 + 0.1) + tz;
          const ia = b.vert(px - nz * 2, y + 1, pz + nx * 2, nx, 0, nz);
          const ib = b.vert(px + nz * 2, y + 1, pz - nx * 2, nx, 0, nz);
          const ic = b.vert(px, y + 7.5, pz, nx, 0, nz);
          b.tri(ia, ib, ic);
          b.tri(ia, ic, ib);
        }
      }
    }
    needle(b, 0, 283, 36, 1.6);
    return { w: 62 };
  },

  eiffel(b) {
    const brown = rgb(0x6e5a44);
    b.set({ kind: KIND.PAINT, color: brown });
    const legs = [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [sx, sz] of legs) {
      b.beam([sx * 52, 0, sz * 52], [sx * 30, 57, sz * 30], 15);
      b.beam([sx * 30, 57, sz * 30], [sx * 14, 115, sz * 14], 10);
    }
    b.box(0, 55, 0, 76, 5, 76);
    b.box(0, 113, 0, 40, 4, 40);
    frustum(b, square(26), square(6), 115, 276, { kind: KIND.PAINT, rows: 3, roof: true });
    b.set({ kind: KIND.PAINT, color: brown });
    b.box(0, 270, 0, 12, 7, 12);
    b.set({ kind: KIND.METAL });
    b.cylinder(0, 277, 0, 1.2, 0.3, 53, 8);
    // Arches between the legs.
    b.set({ kind: KIND.PAINT, color: brown });
    for (const [ax, az] of [
      [1, 0],
      [0, 1],
    ]) {
      for (const s of [1, -1]) {
        const cx = ax ? s * 40 : 0;
        const cz = az ? s * 40 : 0;
        b.box(cx, 38, cz, az ? 70 : 4, 4, ax ? 70 : 4);
      }
    }
    return { w: 125 };
  },

  empire(b) {
    prism(b, rect(130, 60), 0, 25, { style: ST.stone, rows: 1 });
    prism(b, rect(96, 54), 25, 85, { style: ST.stone, rows: 2 });
    prism(b, rect(58, 42), 85, 300, { style: ST.stone, rows: 6 });
    prism(b, rect(46, 34), 300, 335, { style: ST.stone });
    prism(b, rect(34, 26), 335, 360, { style: ST.stone });
    prism(b, rect(22, 18), 360, 381, { style: ST.stone });
    b.set({ kind: KIND.METAL });
    b.cylinder(0, 381, 0, 7, 4, 30, 16);
    b.cylinder(0, 411, 0, 2.2, 0.5, 32, 8);
    return { w: 130 };
  },

  petronas(b) {
    for (const x of [-44, 44]) {
      const tiers = [
        [0, 170, 24],
        [170, 270, 22],
        [270, 330, 19],
        [330, 360, 16],
        [360, 380, 12],
        [380, 395, 8],
      ];
      for (const [y0, y1, r] of tiers) prism(b, star8(r, 0.86), y0, y1, { style: ST.round, x, rows: 3, cellW: 2.6 });
      b.set({ kind: KIND.METAL });
      b.cylinder(x, 395, 0, 4, 0.3, 57, 10);
    }
    b.set({ kind: KIND.GLASS });
    b.box(0, 170, 0, 64, 9, 7);
    b.set({ kind: KIND.METAL });
    b.beam([-26, 120, 0], [-6, 170, 0], 1.6);
    b.beam([26, 120, 0], [6, 170, 0], 1.6);
    return { w: 140 };
  },

  taipei(b) {
    prism(b, square(52), 0, 90, { style: ST.twist, rows: 3 });
    for (let k = 0; k < 8; k++) {
      const y0 = 90 + k * 34;
      frustum(b, square(42), square(52), y0, y0 + 34, { style: ST.twist, rows: 1, roof: true });
    }
    prism(b, square(36), 362, 390, { style: ST.twist });
    prism(b, square(24), 390, 448, { style: ST.twist, rows: 2 });
    b.set({ kind: KIND.METAL });
    b.cylinder(0, 448, 0, 3, 0.3, 60, 10);
    return { w: 60 };
  },

  onewtc(b) {
    prism(b, square(61), 0, 56, { style: ST.glass, rows: 2 });
    b.set({ kind: KIND.FACADE, style: ST.glass });
    // The square base morphs into a square turned 45 degrees, making 8 triangular
    // facets: base edge-midpoints rise to the top corners and vice versa.
    const h = 30.5;
    const r = 30.4;
    const ring0 = [[h, 0], [h, h], [0, h], [-h, h], [-h, 0], [-h, -h], [0, -h], [h, -h]];
    const ring1 = [[r, 0], [r / 2, r / 2], [0, r], [-r / 2, r / 2], [-r, 0], [-r / 2, -r / 2], [0, -r], [r / 2, -r / 2]];
    const rows = 8;
    const ys = [];
    const rings = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      ys.push(lerp(56, 417, t));
      rings.push(ring0.map((p, i) => [lerp(p[0], ring1[i][0], t), lerp(p[1], ring1[i][1], t)]));
    }
    b.loft(rings, ys, { cellW: 3 });
    b.set({ kind: KIND.ROOF });
    b.cap(rings[rows], 417, 1);
    needle(b, 0, 417, 124, 2.2);
    return { w: 61 };
  },

  shanghai(b) {
    b.set({ kind: KIND.FACADE, style: ST.twist });
    const rows = 16;
    const ys = [];
    const rings = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      ys.push(lerp(0, 580, t));
      rings.push(rotateRing(roundedTriangle(lerp(37, 22, t)), (t * 2 * Math.PI) / 3));
    }
    b.loft(rings, ys, { cellW: 3, smooth: true });
    b.set({ kind: KIND.METAL });
    b.loft([rings[rows], scaleRing(rings[rows], 0.7)], [580, 632], { smooth: true, cellW: 1e9 });
    b.cap(scaleRing(rings[rows], 0.7), 632, 1);
    return { w: 80 };
  },

  skytree(b) {
    const white = rgb(0xe8eef2);
    b.set({ kind: KIND.PAINT, color: white });
    const rows = 10;
    const ys = [];
    const rings = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      ys.push(lerp(0, 495, t));
      const tri = roundedTriangle(lerp(38, 9, t), 24).map(([x, z], i) => {
        const a = (i / 24) * Math.PI * 2;
        const rr = lerp(38, 9, t);
        // Blend from triangle (base) to circle (top).
        return [lerp(x, Math.cos(a) * rr, t), lerp(z, Math.sin(a) * rr, t)];
      });
      rings.push(tri);
    }
    b.loft(rings, ys, { cellW: 1e9, smooth: true });
    prism(b, circle(20, 24), 340, 355, { kind: KIND.GLASS });
    prism(b, circle(15, 24), 445, 452, { kind: KIND.GLASS });
    b.set({ kind: KIND.PAINT, color: white });
    b.cylinder(0, 495, 0, 4, 1, 139, 10);
    return { w: 80 };
  },

  merdeka(b) {
    b.set({ kind: KIND.FACADE, style: ST.burj });
    const rows = 10;
    const ys = [];
    const rings = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      ys.push(lerp(0, 520, t));
      const ring = star8(lerp(36, 14, Math.pow(t, 1.3)), 0.86);
      rings.push(rotateRing(ring, r % 2 ? Math.PI / 8 : 0));
    }
    b.loft(rings, ys, { cellW: 2.4 });
    b.set({ kind: KIND.ROOF });
    b.cap(rings[rows], 520, 1);
    b.set({ kind: KIND.METAL });
    b.cylinder(0, 520, 0, 6, 0.3, 159, 10);
    return { w: 72 };
  },

  burj(b) {
    // Y-shaped tiers stepping in as they rise, like the real thing.
    let y = 0;
    let w = 84;
    const tiers = [
      [0, 46],
      [46, 120],
      [120, 196],
      [196, 268],
      [268, 336],
      [336, 400],
      [400, 456],
      [456, 506],
      [506, 548],
      [548, 584],
    ];
    for (const [y0, y1] of tiers) {
      const ring = yShape(w);
      prism(b, ring, y0, y1, { style: ST.burj, cellW: 2.2, rows: 2 });
      b.set({ kind: KIND.METAL });
      for (const a of [90, 210, 330]) {
        const r = (a * Math.PI) / 180;
        b.box(Math.cos(r) * (w / 2 + 0.6), y0, Math.sin(r) * (w / 2 + 0.6), 1.2, y1 - y0, 1.2);
      }
      y = y1;
      w *= 0.84;
    }
    prism(b, circle(9, 16), y, 610, { kind: KIND.GLASS });
    needle(b, 0, 610, 218, 5);
    return { w: 84 };
  },

  jeddah(b) {
    b.set({ kind: KIND.FACADE, style: ST.burj });
    const rows = 12;
    const ys = [];
    const rings = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      ys.push(lerp(0, 860, t));
      rings.push(threePetal(lerp(60, 14, Math.pow(t, 1.1))));
    }
    b.loft(rings, ys, { cellW: 2.4, smooth: true });
    b.set({ kind: KIND.ROOF });
    b.cap(rings[rows], 860, 1);
    needle(b, 0, 860, 140, 6);
    return { w: 120 };
  },

  burjalarab(b) {
    // A sail: D-shaped floors that get thinner towards the top, with a mast behind.
    const rows = 10;
    const ys = [];
    const rings = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      ys.push(lerp(0, 270, t));
      const depth = lerp(56, 6, Math.pow(t, 1.6));
      const half = lerp(26, 4, Math.pow(t, 1.2));
      const ring = [];
      for (let i = 0; i <= 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI;
        ring.push([Math.cos(a) * depth, Math.sin(a) * half]);
      }
      rings.push(ring);
    }
    b.set({ kind: KIND.PAINT, color: rgb(0xf6f6f2) });
    b.loft(rings, ys, { cellW: 1e9, smooth: true });
    b.set({ kind: KIND.WALL, style: ST.glass });
    b.cap(rings[rows], 270, 1);
    b.set({ kind: KIND.METAL });
    b.beam([-6, 0, -24], [-2, 321, 0], 3);
    b.beam([-6, 0, 24], [-2, 321, 0], 3);
    b.set({ kind: KIND.PAINT, color: rgb(0x3b3f46) });
    b.cylinder(-30, 210, 0, 13, 13, 1.5, 24);
    b.set({ kind: KIND.METAL });
    b.beam([-6, 170, 0], [-28, 210, 0], 2);
    return { w: 90 };
  },

  everest(b) {
    mountain(b, 8849, 13000, 11);
    return { w: 26000 };
  },

  huygens(b) {
    mountain(b, 5500, 20000, 5, { snow: false, color: 0x8d8d90 });
    return { w: 40000 };
  },

  olympus(b) {
    mountain(b, 21900, 140000, 3, { snow: false, color: 0xa0553a });
    return { w: 280000 };
  },
};

// Builds the geometry for a landmark (cached). Returns { geometry, w } or null.
const cache = new Map();
export function landmarkGeometry(key) {
  if (cache.has(key)) return cache.get(key);
  const fn = BUILDERS[key];
  if (!fn) return null;
  const b = new GeoBuilder();
  b.set({ section: -1 });
  const meta = fn(b);
  const out = { geometry: b.build(), w: meta.w };
  cache.set(key, out);
  return out;
}

export function hasModel(key) {
  return !!BUILDERS[key];
}

// See-through "hologram" material for comparisons.
export function createGhostMaterial(color = 0x9fe6ff) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uCut: { value: 1e9 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uCut;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float a = (0.16 + 0.55 * rim) * uOpacity;
        // Above uCut (for buildings still under construction) it's fainter.
        if (vY > uCut) a *= 0.35;
        gl_FragColor = vec4(uColor * (0.7 + rim), a);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
