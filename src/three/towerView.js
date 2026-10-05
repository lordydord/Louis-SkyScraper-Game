import * as THREE from 'three';
import { FLOOR_H } from '../config.js';
import { PIECES, STYLES, WALL_COLOURS, GLASS_COLOURS, LIGHT_COLOURS } from '../data/pieces.js';
import { layout, towerHeight, isTop } from '../game/towerModel.js';
import { computeWobble, swayAmplitude } from '../game/physics.js';
import { clamp, lerp, easeOutBounce, hashString } from '../util/math.js';
import {
  KIND,
  STYLE_INDEX,
  LIGHT_PATTERN_INDEX,
  makeTowerUniforms,
  createBuildingMaterial,
  createGlassMaterial,
  createBeamMaterial,
  createGuideMaterial,
} from './materials.js';
import { GeoBuilder, square, circle, chamferSquare, yShape, rotateRing } from './geometry.js';

const WHITE = [1, 1, 1];
const rgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

export function twinOffset(tower) {
  let maxW = 0;
  for (const p of tower.parts) if (!isTop(p)) maxW = Math.max(maxW, p.w);
  return maxW / 2 + Math.max(10, maxW * 0.24);
}

// Horizontal size of the tower (for framing the camera and spacing things out).
export function towerFootprint(tower) {
  let maxW = 0;
  for (const p of tower.parts) if (!isTop(p)) maxW = Math.max(maxW, p.w);
  return tower.twin ? twinOffset(tower) * 2 + maxW : maxW;
}

function rowsFor(h, perRow = 24, max = 24) {
  return clamp(Math.ceil(h / perRow), 1, max);
}

function heights(z0, z1, rows) {
  const ys = [];
  for (let r = 0; r <= rows; r++) ys.push(lerp(z0, z1, r / rows));
  return ys;
}

function roofRing(def, w) {
  switch (def.geo) {
    case 'round':
      return circle(w / 2, 36);
    case 'twist':
      return chamferSquare(w);
    case 'y':
      return yShape(w);
    default:
      return square(w);
  }
}

// ---------- sections ----------

function addSection(b, glass, it, cx, twistPhase, tower, offset) {
  const { part, def, z0, z1, w, topW, i } = it;
  const st = STYLE_INDEX[def.style] ?? 0;
  const cellW = (STYLES[def.style] || STYLES.glass).cell[0];
  b.set({ section: i, style: st, color: WHITE });
  const h = z1 - z0;

  if (def.geo === 'damper') {
    // A see-through room with a giant golden ball hanging inside (like Taipei 101).
    const ring = square(w);
    glass.set({ section: i });
    glass.loft([ring, ring], [z0, z1], { cx });
    b.set({ kind: KIND.WALL });
    b.box(cx, z0, 0, w, 1.2, w);
    b.box(cx, z1 - 1.2, 0, w, 1.2, w);
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      b.set({ kind: KIND.METAL });
      b.box(cx + sx * (w / 2 - 0.8), z0, sz * (w / 2 - 0.8), 1.6, h, 1.6);
    }
    const r = Math.min(w * 0.28, h * 0.32);
    const by = z0 + h * 0.42;
    b.set({ kind: KIND.GOLD });
    b.sphere(cx, by, 0, r, 20, 14);
    b.set({ kind: KIND.METAL });
    for (const a of [0, 2.1, 4.2]) {
      const px = Math.cos(a) * r * 0.6;
      const pz = Math.sin(a) * r * 0.6;
      b.beam([cx + px, by, pz], [cx + px * 1.4, z1 - 1.2, pz * 1.4], 0.4);
    }
    b.set({ kind: KIND.ROOF });
    b.cap(ring, z1, 1, cx);
    return;
  }

  let rings;
  let ys;
  let smooth = false;
  switch (def.geo) {
    case 'round': {
      ys = heights(z0, z1, rowsFor(h));
      const ring = circle(w / 2, 36);
      rings = ys.map(() => ring);
      smooth = true;
      break;
    }
    case 'taper': {
      ys = heights(z0, z1, rowsFor(h));
      rings = ys.map((y) => square(lerp(w, topW, (y - z0) / h)));
      break;
    }
    case 'twist': {
      ys = heights(z0, z1, rowsFor(h, 6, 180));
      const rate = ((def.twistPerFloor || 1.2) * Math.PI) / 180 / FLOOR_H;
      const base = chamferSquare(w);
      rings = ys.map((y) => rotateRing(base, twistPhase + (y - z0) * rate));
      break;
    }
    case 'y': {
      ys = heights(z0, z1, rowsFor(h));
      const ring = yShape(w);
      rings = ys.map(() => ring);
      break;
    }
    default: {
      ys = heights(z0, z1, rowsFor(h));
      const ring = square(w);
      rings = ys.map(() => ring);
    }
  }
  b.set({ kind: KIND.FACADE });
  b.loft(rings, ys, { smooth, cellW, cx });
  b.set({ kind: KIND.ROOF });
  b.cap(rings[rings.length - 1], z1, 1, cx);
  b.cap(rings[0], z0, -1, cx);

  if (def.ledge) {
    // Classic stone cornice at the top of the section, and a band at the base.
    b.set({ kind: KIND.WALL });
    b.box(cx, z1 - 1.6, 0, w + 2.4, 1.6, w + 2.4);
    if (h > 30) b.box(cx, z0, 0, w + 1.2, 2.4, w + 1.2);
  }
  if (def.geo === 'y') {
    // Silver fins up each wing tip.
    b.set({ kind: KIND.METAL });
    for (const a of [90, 210, 330]) {
      const r = (a * Math.PI) / 180;
      const L = w / 2 + 0.6;
      b.box(cx + Math.cos(r) * L, z0, Math.sin(r) * L, 1.4, h, 1.4);
    }
  }
  if (def.geo === 'bridge' && tower.twin && cx > 0) {
    // Sky bridge between the twins, with supporting legs (like the Petronas Towers).
    const inner = offset - w / 2;
    const bw = Math.min(10, w * 0.38);
    const yb = z0 + h * 0.25;
    const hb = h * 0.55;
    b.set({ kind: KIND.GLASS });
    b.box(0, yb, 0, inner * 2, hb, bw);
    b.set({ kind: KIND.METAL });
    b.box(0, yb - 0.6, 0, inner * 2 + 1, 0.8, bw + 1);
    b.box(0, yb + hb, 0, inner * 2 + 1, 0.8, bw + 1);
    const legDrop = Math.min(60, z0 * 0.4);
    if (legDrop > 8) {
      b.beam([-inner, yb - legDrop, 0], [-inner * 0.25, yb, 0], 1.6);
      b.beam([inner, yb - legDrop, 0], [inner * 0.25, yb, 0], 1.6);
    }
  }
}

// ---------- toppers ----------

function addTopper(b, it, cx, totalH) {
  const { part, def, z0, w, i } = it;
  const h = part.h;
  b.set({ section: i, style: 0, color: WHITE });
  switch (def.geo) {
    case 'spire': {
      const r0 = clamp(w * 0.085, 1.2, 9);
      b.set({ kind: KIND.METAL });
      b.cylinder(cx, z0, 0, r0 * 1.7, r0 * 1.35, Math.min(h * 0.05, 8) + 1.5, 16);
      b.cylinder(cx, z0, 0, r0, 0.1, h, 14, false);
      for (let k = 1; k <= 3; k++) {
        const y = z0 + h * k * 0.11;
        const r = r0 * (1 - k * 0.11) * 1.22;
        b.cylinder(cx, y, 0, r, r, Math.max(0.6, h * 0.008), 14);
      }
      break;
    }
    case 'antenna': {
      const base = Math.max(4, w * 0.22);
      b.set({ kind: KIND.WALL });
      b.box(cx, z0, 0, base, 3, base);
      const bands = 7;
      for (let k = 0; k < bands; k++) {
        b.set({ kind: KIND.PAINT, color: k % 2 ? rgb(0xf2f2f2) : rgb(0xd8352b) });
        const r = lerp(1.1, 0.45, k / bands);
        b.cylinder(cx, z0 + 3 + ((h - 3) * k) / bands, 0, r, lerp(1.1, 0.45, (k + 1) / bands), (h - 3) / bands, 8);
      }
      b.set({ kind: KIND.METAL, color: WHITE });
      for (let k = 1; k <= 2; k++) {
        const y = z0 + h * (0.3 + k * 0.2);
        b.box(cx, y, 0, base * 0.9, 0.5, 0.5);
        b.box(cx, y, 0, 0.5, 0.5, base * 0.9);
      }
      b.set({ kind: KIND.BEACON });
      b.sphere(cx, z0 + h, 0, 1.1, 8, 6);
      break;
    }
    case 'pyramid': {
      const ring = square(w);
      const tip = square(0.02);
      b.set({ kind: KIND.GLASS });
      b.loft([ring, tip], [z0, z0 + h], { cx });
      b.set({ kind: KIND.METAL });
      b.box(cx, z0, 0, w + 0.8, 0.8, w + 0.8);
      break;
    }
    case 'dome': {
      const drumH = Math.max(2, w * 0.08);
      b.set({ kind: KIND.WALL });
      b.cylinder(cx, z0, 0, w * 0.47, w * 0.47, drumH, 36);
      const r = w * 0.44;
      const g = new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const domeH = h - drumH - Math.max(2, w * 0.05);
      g.scale(1, Math.max(0.3, domeH / r), 1);
      g.translate(cx, z0 + drumH, 0);
      b.set({ kind: KIND.GLASS });
      b.addGeometry(g);
      g.dispose();
      b.set({ kind: KIND.GOLD });
      b.cylinder(cx, z0 + drumH + domeH * 0.97, 0, 0.9, 0.15, Math.max(2, w * 0.05) + domeH * 0.03, 8);
      break;
    }
    case 'crown': {
      // Art-deco crown like the Chrysler Building: shiny stepped tiers with
      // triangle windows that glow at night, then a needle.
      const tiers = 5;
      const crownH = h * 0.42;
      const th = crownH / tiers;
      for (let k = 0; k < tiers; k++) {
        const bw = w * (0.92 - 0.15 * k);
        const y = z0 + k * th;
        b.set({ kind: KIND.METAL });
        b.box(cx, y, 0, bw, th, bw);
        // Triangle windows on each face.
        b.set({ kind: KIND.GLOW, color: rgb(0xffd890) });
        const nWin = Math.max(2, 5 - k);
        for (let f = 0; f < 4; f++) {
          const ang = (f * Math.PI) / 2;
          const nx = Math.cos(ang);
          const nz = Math.sin(ang);
          const tx = -nz;
          const tz = nx;
          for (let q = 0; q < nWin; q++) {
            const s = (q - (nWin - 1) / 2) * ((bw * 0.8) / nWin);
            const px = cx + nx * (bw / 2 + 0.15) + tx * s;
            const pz = nz * (bw / 2 + 0.15) + tz * s;
            const half = (bw * 0.3) / nWin;
            const y0 = y + th * 0.18;
            const y1 = y + th * 0.85;
            const A = [px - tx * half, y0, pz - tz * half];
            const B = [px + tx * half, y0, pz + tz * half];
            const C = [px, y1, pz];
            const ia = b.vert(...A, nx, 0, nz);
            const ib = b.vert(...B, nx, 0, nz);
            const ic = b.vert(...C, nx, 0, nz);
            b.tri(ia, ic, ib);
            b.tri(ia, ib, ic);
          }
        }
      }
      b.set({ kind: KIND.METAL, color: WHITE });
      const r0 = Math.max(0.8, w * 0.05);
      b.cylinder(cx, z0 + crownH, 0, r0, 0.08, h - crownH, 10, false);
      break;
    }
    default:
      break;
  }
}

// ---------- rooftop extras ----------

function addExtras(b, beams, tower, lay, cx, totalH) {
  const ex = tower.deco.extras || {};
  const roof = [...lay].reverse().find((it) => !it.top);
  if (!roof) return;
  const w = roof.topW;
  const y = roof.z1;
  const topper = lay.find((it) => it.top);
  b.set({ section: -1, style: 0, color: WHITE });

  if (ex.beacons) {
    b.set({ kind: KIND.BEACON });
    const r = w * 0.42;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      b.box(cx + sx * r * 0.85, y, sz * r * 0.85, 1.2, 1.2, 1.2);
    }
    if (topper) b.sphere(cx, totalH + 0.6, 0, 0.9, 8, 6);
  }
  if (ex.pool) {
    const pw = w * 0.6;
    const pd = w * 0.22;
    const pz = -w * 0.3;
    b.set({ kind: KIND.PAINT, color: rgb(0xf4f1ea) });
    b.box(cx, y, pz, pw + 2, 1.0, pd + 2);
    b.set({ kind: KIND.WATER });
    b.box(cx, y + 0.02, pz, pw, 1.1, pd);
  }
  if (ex.garden) {
    const gz = w * 0.3;
    b.set({ kind: KIND.PAINT, color: rgb(0x4f9a46) });
    b.box(cx, y, gz, w * 0.7, 0.8, w * 0.22);
    const n = 5;
    for (let k = 0; k < n; k++) {
      const tx = cx + (k - (n - 1) / 2) * ((w * 0.6) / n);
      const tz = gz + (k % 2 ? 1 : -1) * w * 0.04;
      const s = clamp(w * 0.06, 1.6, 4);
      b.set({ kind: KIND.PAINT, color: rgb(0x7a5533) });
      b.cylinder(tx, y + 0.8, tz, s * 0.18, s * 0.14, s * 1.1, 6);
      b.set({ kind: KIND.PAINT, color: rgb(k % 2 ? 0x3f8f3a : 0x5bb04c) });
      b.sphere(tx, y + 0.8 + s * 1.5, tz, s * 0.75, 10, 7);
    }
  }
  if (ex.flag) {
    const fx = cx - w * 0.38;
    const ph = clamp(w * 0.4, 8, 22);
    b.set({ kind: KIND.METAL, color: WHITE });
    b.cylinder(fx, y, 0, 0.25, 0.2, ph, 6);
    const fw = ph * 0.55;
    const fh = ph * 0.36;
    const top = y + ph - 0.4;
    b.set({ kind: KIND.PAINT, color: rgb(0x2f6fe0) });
    b.quad([fx, top - fh, 0], [fx, top, 0], [fx - fw, top, 0.01], [fx - fw, top - fh, 0.01]);
    b.quad([fx - fw, top - fh, 0.01], [fx - fw, top, 0.01], [fx, top, 0], [fx, top - fh, 0]);
    // A yellow star-ish diamond in the middle, both sides.
    b.set({ kind: KIND.PAINT, color: rgb(0xffd23f) });
    const mx = fx - fw / 2;
    const my = top - fh / 2;
    const s = fh * 0.32;
    for (const dz of [0.06, -0.06]) {
      const ia = b.vert(mx, my - s, dz, 0, 0, Math.sign(dz));
      const ib = b.vert(mx + s * 0.8, my, dz, 0, 0, Math.sign(dz));
      const ic = b.vert(mx, my + s, dz, 0, 0, Math.sign(dz));
      const id = b.vert(mx - s * 0.8, my, dz, 0, 0, Math.sign(dz));
      b.tri(ia, ib, ic);
      b.tri(ia, ic, id);
      b.tri(ia, ic, ib);
      b.tri(ia, id, ic);
    }
  }
  if (ex.helipad) {
    // Helipad sticking out from the side, like the Burj Al Arab's.
    const r = clamp(w * 0.32, 8, 16);
    const hx = cx + w / 2 + r * 0.75;
    const hy = y - 4;
    b.set({ kind: KIND.PAINT, color: rgb(0x3b3f46) });
    b.cylinder(hx, hy, 0, r, r, 1.2, 28);
    b.set({ kind: KIND.PAINT, color: rgb(0xffd23f) });
    b.cylinder(hx, hy + 1.2, 0, r * 0.86, r * 0.86, 0.08, 28);
    b.set({ kind: KIND.PAINT, color: rgb(0x3b3f46) });
    b.cylinder(hx, hy + 1.22, 0, r * 0.78, r * 0.78, 0.08, 28);
    b.set({ kind: KIND.PAINT, color: rgb(0xffffff) });
    const s = r * 0.45;
    b.box(hx - s * 0.45, hy + 1.3, 0, s * 0.18, 0.1, s);
    b.box(hx + s * 0.45, hy + 1.3, 0, s * 0.18, 0.1, s);
    b.box(hx, hy + 1.3, 0, s * 0.9, 0.1, s * 0.16);
    b.set({ kind: KIND.METAL, color: WHITE });
    b.beam([cx + w / 2, hy - r * 1.2, 0], [hx, hy, 0], 1.2);
  }
  if (ex.spotlights) {
    const len = clamp(totalH * 0.6, 250, 3000);
    const lc = tower.deco.light && LIGHT_COLOURS[tower.deco.light.c] > 0 ? rgb(LIGHT_COLOURS[tower.deco.light.c]) : [0.9, 0.95, 1];
    beams.set({ section: -1, kind: KIND.GLOW, color: lc });
    const r = w * 0.42;
    for (const [sx, sz] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const bx = cx + sx * r;
      const bz = sz * r;
      const tx = bx + sx * len * 0.18;
      const tz = bz + sz * len * 0.18;
      const ty = y + len;
      // A thin flat beam (two crossed quads) fading upwards (uv.y = 0 -> 1).
      const wb = 1.5;
      const wt = len * 0.04;
      for (const [ax, az] of [
        [1, 0],
        [0, 1],
      ]) {
        const i0 = beams.vert(bx - ax * wb, y, bz - az * wb, 0, 1, 0, 0, 0);
        const i1 = beams.vert(bx + ax * wb, y, bz + az * wb, 0, 1, 0, 0, 0);
        const i2 = beams.vert(tx + ax * wt, ty, tz + az * wt, 0, 1, 0, 0, 1);
        const i3 = beams.vert(tx - ax * wt, ty, tz - az * wt, 0, 1, 0, 0, 1);
        beams.tri(i0, i1, i2);
        beams.tri(i0, i2, i3);
      }
    }
  }
}

// ---------- crane ----------

function buildCrane(roofW) {
  const b = new GeoBuilder();
  const s = clamp(roofW / 40, 0.6, 1.5);
  const yellow = rgb(0xf3b81f);
  const mastH = 42 * s;
  const m = 2.6 * s;
  b.set({ kind: KIND.PAINT, color: yellow, section: -1 });
  // Lattice mast: four corner posts with cross braces.
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    b.box((sx * m) / 2, 0, (sz * m) / 2, 0.35 * s, mastH, 0.35 * s);
  }
  for (let y = 0; y < mastH - 3 * s; y += 3.2 * s) {
    b.beam([-m / 2, y, m / 2], [m / 2, y + 3.2 * s, m / 2], 0.2 * s);
    b.beam([m / 2, y, -m / 2], [-m / 2, y + 3.2 * s, -m / 2], 0.2 * s);
    b.beam([m / 2, y, m / 2], [m / 2, y + 3.2 * s, -m / 2], 0.2 * s);
    b.beam([-m / 2, y, -m / 2], [-m / 2, y + 3.2 * s, m / 2], 0.2 * s);
  }
  // Jib and counter-jib.
  const jibL = 55 * s;
  b.box(jibL / 2 - 4 * s, mastH, 0, jibL, 1.6 * s, 1.6 * s);
  b.box(-9 * s, mastH, 0, 18 * s, 1.6 * s, 2 * s);
  b.beam([0, mastH + 7 * s, 0], [jibL - 6 * s, mastH + 1.6 * s, 0], 0.25 * s);
  b.beam([0, mastH + 7 * s, 0], [-16 * s, mastH + 1.6 * s, 0], 0.25 * s);
  b.box(0, mastH, 0, 1.2 * s, 7 * s, 1.2 * s);
  b.set({ color: rgb(0x8a8f96) });
  b.box(-15 * s, mastH - 2.5 * s, 0, 5 * s, 3 * s, 3 * s);
  b.set({ color: rgb(0xf4f4f4) });
  b.box(2.6 * s, mastH - 3.2 * s, 2.0 * s, 3 * s, 3 * s, 2.8 * s);
  b.set({ color: rgb(0x30343a) });
  b.box(jibL * 0.7, mastH - 22 * s, 0, 0.18 * s, 22 * s, 0.18 * s);
  b.set({ color: yellow });
  b.box(jibL * 0.7, mastH - 23.5 * s, 0, 1.4 * s, 1.5 * s, 1.4 * s);
  return b.build();
}

let _starTex = null;
function starTexture() {
  if (_starTex) return _starTex;
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,240,180,0.9)');
  g.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s / 2, 2);
  ctx.lineTo(s / 2, s - 2);
  ctx.moveTo(2, s / 2);
  ctx.lineTo(s - 2, s / 2);
  ctx.stroke();
  _starTex = new THREE.CanvasTexture(c);
  return _starTex;
}

// ---------- the view ----------

export class TowerView {
  constructor(globals, seedKey = 'tower') {
    this.globals = globals;
    this.uniforms = makeTowerUniforms(hashString(seedKey));
    const { material, depthMaterial } = createBuildingMaterial(globals, this.uniforms);
    this.material = material;
    this.depthMaterial = depthMaterial;
    this.glassMaterial = createGlassMaterial(this.uniforms);
    this.beamMaterial = createBeamMaterial(globals, this.uniforms);
    this.group = new THREE.Group();
    this.mesh = null;
    this.glassMesh = null;
    this.beamMesh = null;
    this.crane = null;
    this.craneOn = false;
    this.craneAngle = Math.random() * 6;
    this.craneTargetAngle = this.craneAngle;
    this.tower = null;
    this.height = 0;
    this.wobble = { value: 0, period: 3 };
    this.swayAmp = 0;
    this.swayTarget = 0;
    this.swayPhase = Math.random() * 10;
    this.windDir = new THREE.Vector2(1, 0.3).normalize();
    this.drop = null;
    this.selected = -1;
    this.pulseT = 0;
    this.roofY = 0;
    this.roofW = 40;
    this.guideMat = createGuideMaterial(this.uniforms);
    const gg = new THREE.PlaneGeometry(1, 1);
    gg.translate(0, 0.5, 0);
    this.guide = new THREE.Mesh(gg, this.guideMat);
    this.guide.frustumCulled = false;
    this.guide.renderOrder = 30;
    this.guide.visible = false;
    this.group.add(this.guide);
    this.star = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: starTexture(), color: 0xffe27a, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, blending: THREE.AdditiveBlending }),
    );
    this.star.renderOrder = 31;
    this.star.visible = false;
    this.group.add(this.star);
  }

  // Show the glowing guide when the tower is only a few pixels wide on screen.
  updateGuide(camera, viewportHeight) {
    const H = this.height;
    if (H < 400 || !this.tower) {
      this.guide.visible = this.star.visible = false;
      return;
    }
    const wp = this.group.position;
    const mid = new THREE.Vector3(wp.x, wp.y + H * 0.5, wp.z);
    const dist = Math.max(1, camera.position.distanceTo(mid));
    const pxPerM = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360) * dist);
    const towerPx = towerFootprint(this.tower) * pxPerM;
    const op = clamp((6 - towerPx) / 4, 0, 1);
    this.guideMat.uniforms.uOpacity.value = op * 0.9;
    this.guide.visible = this.star.visible = op > 0.01;
    if (!this.guide.visible) return;
    this.guide.scale.set(5 / pxPerM, H, 1);
    this.guide.rotation.y = Math.atan2(camera.position.x - wp.x, camera.position.z - wp.z);
    this.star.position.set(0, H, 0);
    this.star.scale.setScalar(0.07);
    this.star.material.opacity = op;
  }

  setTower(tower, world, { dropIndex = -1 } = {}) {
    this.tower = tower;
    const lay = layout(tower);
    const H = towerHeight(tower);
    this.height = H;
    const twin = tower.twin && lay.some((it) => !it.top);
    const offset = twin ? twinOffset(tower) : 0;
    const xs = twin ? [-offset, offset] : [0];

    const b = new GeoBuilder();
    const glass = new GeoBuilder();
    glass.set({ kind: KIND.GLASS });
    const beams = new GeoBuilder();
    for (const cx of xs) {
      let twistPhase = 0;
      for (const it of lay) {
        if (it.top) addTopper(b, it, cx, H);
        else {
          addSection(b, glass, it, cx, twistPhase, tower, offset);
          if (it.def.geo === 'twist') {
            const rate = ((it.def.twistPerFloor || 1.2) * Math.PI) / 180 / FLOOR_H;
            twistPhase += (it.z1 - it.z0) * rate;
          } else twistPhase = 0;
        }
      }
      if (tower.done || Object.values(tower.deco.extras || {}).some(Boolean)) addExtras(b, beams, tower, lay, cx, H);
    }

    this._replace('mesh', b.empty ? null : b.build(), this.material, true);
    this._replace('glassMesh', glass.empty ? null : glass.build(), this.glassMaterial, false);
    this._replace('beamMesh', beams.empty ? null : beams.build(), this.beamMaterial, false);
    if (this.glassMesh) this.glassMesh.renderOrder = 2;
    if (this.beamMesh) this.beamMesh.renderOrder = 3;

    const roof = [...lay].reverse().find((it) => !it.top);
    this.roofY = roof ? roof.z1 : 0;
    this.roofW = roof ? roof.topW : 40;
    this.roofXs = xs;

    const u = this.uniforms;
    u.uHeight.value = Math.max(H, 1);
    const deco = tower.deco || {};
    const wall = WALL_COLOURS[deco.wall || 0];
    u.uWallPaintOn.value = wall == null ? 0 : 1;
    if (wall != null) u.uWallPaint.value.set(wall);
    const gl = GLASS_COLOURS[deco.glass || 0];
    u.uGlassPaintOn.value = gl == null ? 0 : 1;
    if (gl != null) {
      u.uGlassPaint.value.set(gl);
      this.glassMaterial.color.set(gl);
    }
    const light = deco.light || { c: 0, p: 'off' };
    const lc = LIGHT_COLOURS[light.c] ?? 0xffffff;
    u.uRainbow.value = lc === -1 ? 1 : 0;
    if (lc !== -1) u.uLightCol.value.set(lc);
    u.uLightPattern.value = LIGHT_PATTERN_INDEX[light.p] || 0;

    this.wobble = computeWobble(tower, world);
    this.swayTarget = swayAmplitude(this.wobble, world);

    if (dropIndex >= 0) {
      this.drop = { index: dropIndex, t: 0, from: clamp(H * 0.08, 25, 160) };
      u.uDropIdx.value = dropIndex;
      u.uDropY.value = this.drop.from;
    }
    this._placeCrane();
  }

  _replace(key, geometry, material, shadows) {
    const old = this[key];
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
    }
    this[key] = null;
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    if (shadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = this.depthMaterial;
    }
    this.group.add(mesh);
    this[key] = mesh;
  }

  setCrane(on) {
    this.craneOn = on;
    if (on && !this.crane) {
      this.crane = new THREE.Mesh(buildCrane(this.roofW), this.material);
      this.crane.castShadow = true;
      this.crane.customDepthMaterial = this.depthMaterial;
      this.group.add(this.crane);
    }
    if (!on && this.crane) {
      this.group.remove(this.crane);
      this.crane.geometry.dispose();
      this.crane = null;
    }
    this._placeCrane();
  }

  _placeCrane() {
    if (!this.crane) return;
    const x = this.roofXs ? this.roofXs[this.roofXs.length - 1] : 0;
    this.crane.position.set(x, this.roofY, 0);
    this.crane.visible = this.roofY > 0;
  }

  // Swing the crane jib towards the tower (when something is being placed).
  swingCrane() {
    this.craneTargetAngle += 1.2 + Math.random() * 1.5;
  }

  setSelected(i) {
    this.selected = i;
    this.uniforms.uSelected.value = i;
  }

  update(dt) {
    // Sway: slow and smooth, faster to settle than to grow.
    this.swayAmp = lerp(this.swayAmp, this.swayTarget, 1 - Math.exp(-dt * 1.5));
    const period = this.wobble.period || 3;
    this.swayPhase += (dt * Math.PI * 2) / period;
    const s = Math.sin(this.swayPhase) * this.swayAmp;
    const s2 = Math.sin(this.swayPhase * 0.71 + 1.3) * this.swayAmp * 0.28;
    this.uniforms.uSway.value.set(this.windDir.x * s - this.windDir.y * s2, this.windDir.y * s + this.windDir.x * s2);

    if (this.drop) {
      this.drop.t += dt / 0.55;
      const t = Math.min(1, this.drop.t);
      this.uniforms.uDropY.value = this.drop.from * (1 - easeOutBounce(t));
      if (t >= 1) {
        this.drop = null;
        this.uniforms.uDropIdx.value = -10;
        this.uniforms.uDropY.value = 0;
      }
    }

    if (this.selected >= 0) {
      this.pulseT += dt;
      this.uniforms.uSelPulse.value = 0.18 + 0.14 * Math.sin(this.pulseT * 3.2);
    } else this.uniforms.uSelPulse.value = 0;

    if (this.crane) {
      this.craneAngle = lerp(this.craneAngle, this.craneTargetAngle, 1 - Math.exp(-dt * 1.2));
      this.crane.rotation.y = this.craneAngle + Math.sin(performance.now() / 4000) * 0.15;
    }
  }

  // Which section did a ray hit? Returns the part index or -1.
  pickSection(raycaster) {
    if (!this.mesh) return -1;
    const hits = raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return -1;
    const f = hits[0].face;
    const sec = this.mesh.geometry.attributes.aSection.getX(f.a);
    return Math.round(sec);
  }

  dispose() {
    for (const key of ['mesh', 'glassMesh', 'beamMesh']) this._replace(key, null);
    this.setCrane(false);
    this.material.dispose();
    this.depthMaterial.dispose();
    this.guideMat.dispose();
    this.guide.geometry.dispose();
    this.star.material.dispose();
    this.glassMaterial.dispose();
    this.beamMaterial.dispose();
  }
}
