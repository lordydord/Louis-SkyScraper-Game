import * as THREE from 'three';
import { mulberry32 } from '../util/math.js';

// Procedural equirectangular textures for planets and moons, drawn on a canvas.
// Noise is evaluated on the sphere so textures wrap seamlessly with no pinched poles.
// The centre of each texture (u = 0.5, v = 0.5) is where Louie's city sits.

const cache = new Map();

function makeNoise(seed) {
  const rng = mulberry32(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const fade = (t) => t * t * (3 - 2 * t);
  function noise3(x, y, z) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = fade(x - xi);
    const yf = fade(y - yi);
    const zf = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf,
    );
  }
  return function fbm(x, y, z, octaves = 5) {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise3(x * f, y * f, z * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return sum / (1 - Math.pow(0.5, octaves));
  };
}

// Calls paint(nx, ny, nz, u, v) for every pixel; paint returns [r, g, b] (0-255).
function equirect(w, h, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const theta = v * Math.PI; // 0 at north pole
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const phi = u * Math.PI * 2;
      // Same convention as THREE.SphereGeometry.
      const nx = -Math.cos(phi) * st;
      const ny = ct;
      const nz = Math.sin(phi) * st;
      const c = paint(nx, ny, nz, u, v);
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sat = (t) => Math.max(0, Math.min(1, t));

function craters(ctx, w, h, seed, count, dark = 0.18) {
  const rng = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = h * (0.1 + rng() * 0.8);
    const r = Math.pow(rng(), 3) * w * 0.03 + 1;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${dark})`);
    g.addColorStop(0.75, `rgba(0,0,0,${dark * 0.6})`);
    g.addColorStop(0.9, `rgba(255,255,255,${dark * 0.8})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.0, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

const painters = {
  earth(w, h, { land = 'green' } = {}) {
    const n = makeNoise(7);
    const n2 = makeNoise(99);
    return equirect(w, h, (x, y, z) => {
      // A bump of land where the city is (the point facing +x in this convention).
      const near = Math.max(0, x) ** 8;
      let e = n(x * 1.6 + 3, y * 1.6, z * 1.6) - 0.06;
      // Make sure the land under the city is lowland (not sea, not mountains).
      e = e * (1 - near) + 0.56 * near;
      const lat = Math.abs(y);
      if (lat > 0.93) return [236, 242, 248];
      if (e < 0.5) {
        const deep = sat((0.5 - e) * 4);
        return mix([52, 120, 190], [18, 54, 120], deep);
      }
      const t = n2(x * 5, y * 5, z * 5);
      let c = land === 'sand' ? [214, 186, 128] : mix([72, 140, 64], [120, 150, 70], t);
      if (land !== 'sand' && lat < 0.4 && t > 0.74) c = [200, 176, 120];
      if (lat > 0.75) c = mix(c, [230, 236, 240], sat((lat - 0.75) * 6));
      if (e > 0.62) c = mix(c, [130, 120, 105], sat((e - 0.62) * 5));
      return c;
    });
  },
  moon(w, h) {
    const n = makeNoise(21);
    const canvas = equirect(w, h, (x, y, z) => {
      const e = n(x * 2.2, y * 2.2, z * 2.2);
      const g = 150 + (e - 0.5) * 120;
      const maria = e < 0.42 ? 0.55 : 1;
      return [g * maria, g * maria, g * maria * 1.02];
    });
    craters(canvas.getContext('2d'), w, h, 5, Math.floor(w * 0.6));
    return canvas;
  },
  mars(w, h) {
    const n = makeNoise(42);
    return equirect(w, h, (x, y, z) => {
      const e = n(x * 2, y * 2, z * 2);
      let c = mix([196, 98, 52], [140, 64, 38], sat((0.55 - e) * 3));
      const lat = Math.abs(y);
      if (lat > 0.9) c = mix(c, [240, 236, 230], sat((lat - 0.9) * 12));
      return c;
    });
  },
  jupiter(w, h) {
    const n = makeNoise(3);
    return equirect(w, h, (x, y, z, u, v) => {
      const wob = n(x * 3, y * 3, z * 3) * 0.06;
      const b = Math.sin((v + wob) * 34);
      let c = mix([220, 196, 160], [168, 116, 84], sat(b * 0.5 + 0.5));
      // Great Red Spot
      const dx = (u - 0.62) * 2.2;
      const dy = (v - 0.64) * 5;
      const r = dx * dx + dy * dy;
      if (r < 0.04) c = mix([196, 92, 60], c, sat(r / 0.04));
      return c;
    });
  },
  saturn(w, h) {
    const n = makeNoise(4);
    return equirect(w, h, (x, y, z, u, v) => {
      const b = Math.sin((v + n(x * 2, y * 2, z * 2) * 0.03) * 26);
      return mix([234, 214, 168], [200, 170, 120], sat(b * 0.5 + 0.5));
    });
  },
  venus(w, h) {
    const n = makeNoise(5);
    return equirect(w, h, (x, y, z) => {
      const e = n(x * 2 + y, y * 3, z * 2);
      return mix([240, 220, 170], [210, 176, 120], e);
    });
  },
  mercury(w, h) {
    const canvas = painters.moon(w, h);
    return canvas;
  },
  phobos(w, h) {
    const n = makeNoise(8);
    const canvas = equirect(w, h, (x, y, z) => {
      const e = n(x * 3, y * 3, z * 3);
      const g = 110 + e * 50;
      return [g, g * 0.9, g * 0.8];
    });
    craters(canvas.getContext('2d'), w, h, 9, 40, 0.3);
    return canvas;
  },
  sun(w, h) {
    const n = makeNoise(11);
    return equirect(w, h, (x, y, z) => {
      const e = n(x * 8, y * 8, z * 8, 3);
      return mix([255, 200, 60], [255, 140, 30], e);
    });
  },
};

// Returns a THREE.CanvasTexture (cached).
export function planetTexture(name, size = 256, opts = {}) {
  const key = `${name}:${size}:${JSON.stringify(opts)}`;
  if (cache.has(key)) return cache.get(key);
  const paint = painters[name] || painters.moon;
  const canvas = paint(size, size / 2, opts);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
