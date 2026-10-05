import * as THREE from 'three';
import { KIND } from './materials.js';

// Collects triangles with the attributes the building material needs:
// position, normal, uv (facade metres), color, aKind, aStyle, aSection.

const WHITE = [1, 1, 1];

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.kind = [];
    this.style = [];
    this.section = [];
    this.index = [];
    this.n = 0;
    // Defaults applied to new vertices.
    this.k = KIND.WALL;
    this.s = 0;
    this.sec = -1;
    this.color = WHITE;
  }

  set({ kind, style, section, color } = {}) {
    if (kind !== undefined) this.k = kind;
    if (style !== undefined) this.s = style;
    if (section !== undefined) this.sec = section;
    if (color !== undefined) this.color = color;
    return this;
  }

  vert(x, y, z, nx, ny, nz, u = 0, v = 0) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(this.color[0], this.color[1], this.color[2]);
    this.kind.push(this.k);
    this.style.push(this.s);
    this.section.push(this.sec);
    return this.n++;
  }

  tri(a, b, c) {
    this.index.push(a, b, c);
  }

  // Quad from 4 points (counter-clockwise when seen from outside), flat normal.
  quad(p0, p1, p2, p3, uvs = null) {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const u = uvs || [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    const a = this.vert(...p0, nx, ny, nz, ...u[0]);
    const b = this.vert(...p1, nx, ny, nz, ...u[1]);
    const c = this.vert(...p2, nx, ny, nz, ...u[2]);
    const d = this.vert(...p3, nx, ny, nz, ...u[3]);
    this.tri(a, b, c);
    this.tri(a, c, d);
  }

  // Extrude a closed ring of [x, z] points through a list of heights.
  // rings[i] is the outline at ys[i] (same number of points each). Facade u runs
  // along each side and is scaled so a whole number of window columns fits.
  // smooth: share normals around (for round shapes).
  loft(rings, ys, { smooth = false, cellW = 3, cx = 0, cz = 0, uBase = 0, sideKinds = null } = {}) {
    const m = rings[0].length;
    const rows = ys.length;
    if (smooth) {
      // Perimeter length of the bottom ring -> number of window columns.
      let per = 0;
      for (let i = 0; i < m; i++) {
        const a = rings[0][i];
        const b = rings[0][(i + 1) % m];
        per += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      const cols = Math.max(1, Math.round(per / cellW));
      const base = this.n;
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i <= m; i++) {
          const p = rings[r][i % m];
          const nxz = Math.hypot(p[0], p[1]) || 1;
          // Slope of the wall between neighbouring rows, for tapered round shapes.
          const r0 = Math.hypot(...rings[Math.max(0, r - 1)][i % m]);
          const r1 = Math.hypot(...rings[Math.min(rows - 1, r + 1)][i % m]);
          const dy = ys[Math.min(rows - 1, r + 1)] - ys[Math.max(0, r - 1)] || 1;
          const slope = (r0 - r1) / dy;
          const nl = Math.hypot(1, slope);
          this.vert(
            p[0] + cx,
            ys[r],
            p[1] + cz,
            p[0] / nxz / nl,
            slope / nl,
            p[1] / nxz / nl,
            uBase + (i / m) * cols * cellW,
            ys[r],
          );
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let i = 0; i < m; i++) {
          const a = base + r * (m + 1) + i;
          const b = a + 1;
          const c2 = a + (m + 1) + 1;
          const d = a + (m + 1);
          this.tri(a, c2, b);
          this.tri(a, d, c2);
        }
      }
      return;
    }
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const a0 = rings[0][i];
      const b0 = rings[0][j];
      const sideLen = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
      const cols = Math.max(1, Math.round(sideLen / cellW));
      const u0 = uBase + i * 1200 * cellW;
      const u1 = u0 + cols * cellW;
      if (sideKinds) this.k = sideKinds[i];
      for (let r = 0; r < rows - 1; r++) {
        const pa = rings[r][i];
        const pb = rings[r][j];
        const qa = rings[r + 1][i];
        const qb = rings[r + 1][j];
        // Outward winding for points ordered with increasing angle (x towards z):
        this.quad(
          [pa[0] + cx, ys[r], pa[1] + cz],
          [qa[0] + cx, ys[r + 1], qa[1] + cz],
          [qb[0] + cx, ys[r + 1], qb[1] + cz],
          [pb[0] + cx, ys[r], pb[1] + cz],
          [
            [u0, ys[r]],
            [u0, ys[r + 1]],
            [u1, ys[r + 1]],
            [u1, ys[r]],
          ],
        );
      }
    }
  }

  // Flat cap (fan from the centre) for a ring at height y. up = +1 for a roof.
  cap(ring, y, up = 1, cx = 0, cz = 0) {
    const m = ring.length;
    const centre = this.vert(cx, y, cz, 0, up, 0);
    const first = this.n;
    for (let i = 0; i < m; i++) this.vert(ring[i][0] + cx, y, ring[i][1] + cz, 0, up, 0);
    for (let i = 0; i < m; i++) {
      const a = first + i;
      const b = first + ((i + 1) % m);
      if (up > 0) this.tri(centre, b, a);
      else this.tri(centre, a, b);
    }
  }

  // Axis-aligned box centred at (x, y0..y0+h, z).
  box(x, y0, z, sx, h, sz) {
    const hx = sx / 2;
    const hz = sz / 2;
    const ring = [
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
      [-hx, -hz],
    ];
    this.loft([ring, ring], [y0, y0 + h], { cx: x, cz: z, cellW: 1e9 });
    this.cap(ring, y0 + h, 1, x, z);
    this.cap(ring, y0, -1, x, z);
  }

  // Box between two points (for beams, struts, cables).
  beam(p, q, thick) {
    const dir = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const len = dir.length();
    const g = new THREE.BoxGeometry(thick, len, thick);
    g.translate(0, len / 2, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    g.applyQuaternion(quat);
    g.translate(p[0], p[1], p[2]);
    this.addGeometry(g);
    g.dispose();
  }

  // Cylinder/cone from y0 to y1 with radii r0 -> r1.
  cylinder(x, y0, z, r0, r1, h, segs = 12, caps = true) {
    const ring0 = circle(r0, segs);
    const ring1 = circle(Math.max(r1, 0.001), segs);
    this.loft([ring0, ring1], [y0, y0 + h], { smooth: true, cx: x, cz: z, cellW: 1e9 });
    if (caps) {
      if (r1 > 0.01) this.cap(ring1, y0 + h, 1, x, z);
      this.cap(ring0, y0, -1, x, z);
    }
  }

  sphere(x, y, z, r, wSegs = 16, hSegs = 10, { half = false } = {}) {
    const g = half
      ? new THREE.SphereGeometry(r, wSegs, hSegs, 0, Math.PI * 2, 0, Math.PI / 2)
      : new THREE.SphereGeometry(r, wSegs, hSegs);
    g.translate(x, y, z);
    this.addGeometry(g);
    g.dispose();
  }

  // Append any THREE geometry using the current kind/style/section/colour.
  addGeometry(g) {
    const gi = g.index ? g : g;
    const p = gi.attributes.position;
    const nrm = gi.attributes.normal;
    const base = this.n;
    for (let i = 0; i < p.count; i++) {
      this.vert(p.getX(i), p.getY(i), p.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i), 0, 0);
    }
    if (gi.index) {
      const idx = gi.index.array;
      for (let i = 0; i < idx.length; i++) this.index.push(base + idx[i]);
    } else {
      for (let i = 0; i < p.count; i++) this.index.push(base + i);
    }
  }

  get empty() {
    return this.n === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kind, 1));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.style, 1));
    g.setAttribute('aSection', new THREE.Float32BufferAttribute(this.section, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---- outlines (rings of [x, z], increasing angle from +x towards +z) ----

export function circle(r, segs = 32) {
  const out = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

export function square(w) {
  const h = w / 2;
  return [
    [h, -h],
    [h, h],
    [-h, h],
    [-h, -h],
  ];
}

// Square with cut corners (chamfer as a fraction of the width).
export function chamferSquare(w, f = 0.14) {
  const h = w / 2;
  const c = w * f;
  return [
    [h, -h + c],
    [h, h - c],
    [h - c, h],
    [-h + c, h],
    [-h, h - c],
    [-h, -h + c],
    [-h + c, -h],
    [h - c, -h],
  ];
}

// Three wings around a core, like the Burj Khalifa's "Y" floor plan.
export function yShape(w) {
  const L = w / 2;
  const hw = w * 0.17;
  const out = [];
  const dirs = [90, 210, 330].map((d) => (d * Math.PI) / 180);
  for (let k = 0; k < 3; k++) {
    const a = dirs[k];
    const d = [Math.cos(a), Math.sin(a)];
    const n = [-d[1], d[0]];
    // Corner between this wing and the previous one.
    const prev = dirs[(k + 2) % 3];
    const pd = [Math.cos(prev), Math.sin(prev)];
    const pn = [-pd[1], pd[0]];
    // Intersection of line (-n*hw + t d) and (pn*hw + s pd)... solved numerically.
    const inner = intersect([-n[0] * hw, -n[1] * hw], d, [pn[0] * hw, pn[1] * hw], pd);
    out.push(inner);
    // Rounded wing tip: a few points.
    const tip = [d[0] * L, d[1] * L];
    out.push([tip[0] - n[0] * hw - d[0] * hw * 0.3, tip[1] - n[1] * hw - d[1] * hw * 0.3]);
    out.push([tip[0] - n[0] * hw * 0.5, tip[1] - n[1] * hw * 0.5]);
    out.push([tip[0] + n[0] * hw * 0.5, tip[1] + n[1] * hw * 0.5]);
    out.push([tip[0] + n[0] * hw - d[0] * hw * 0.3, tip[1] + n[1] * hw - d[1] * hw * 0.3]);
  }
  return sortByAngle(out);
}

function intersect(p, d, q, e) {
  // p + t d = q + s e
  const det = d[0] * -e[1] - d[1] * -e[0];
  if (Math.abs(det) < 1e-9) return [p[0], p[1]];
  const rx = q[0] - p[0];
  const ry = q[1] - p[1];
  const t = (rx * -e[1] - ry * -e[0]) / det;
  return [p[0] + t * d[0], p[1] + t * d[1]];
}

function sortByAngle(points) {
  return points
    .map((p) => ({ p, a: Math.atan2(p[1], p[0]) }))
    .sort((a, b) => a.a - b.a)
    .map((o) => o.p);
}

export function scaleRing(ring, s) {
  return ring.map(([x, z]) => [x * s, z * s]);
}

export function rotateRing(ring, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return ring.map(([x, z]) => [x * c - z * s, x * s + z * c]);
}
