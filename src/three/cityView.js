import * as THREE from 'three';
import { BLOCK, ROAD_W } from '../config.js';
import { LAYOUTS, inWater } from '../game/cityLayout.js';
import { PLACES, WORLDS } from '../data/places.js';
import { KIND, makeTowerUniforms, createBuildingMaterial } from './materials.js';
import { GeoBuilder, circle } from './geometry.js';
import { landmarkGeometry } from './landmarks3d.js';
import { TowerView, towerFootprint } from './towerView.js';
import {
  officeBlock,
  house,
  lot,
  pond,
  fence,
  treeGeometry,
  palmGeometry,
  carGeometry,
  roverGeometry,
  personGeometry,
  baseModule,
  crater,
  rgb,
} from './cityParts.js';
import { hash3, mulberry32, clamp, lerp, easeOutBack } from '../util/math.js';

// A whole city: the ground, roads, buildings that grow around Louie's towers,
// trees, cars, people, water and landmarks. Louie's own towers are TowerViews.

const LOT = BLOCK - ROAD_W;
const GROUND = {
  grass: { base: 0x86b35f, alt: 0x9cc06a, lot: 0xc9ccd0 },
  park: { base: 0x7fae5c, alt: 0x93ba63, lot: 0xc4c6c9 },
  sand: { base: 0xe0c592, alt: 0xd3b27c, lot: 0xe6ddca },
  moon: { base: 0x8b8b8e, alt: 0x737377, lot: 0x96969a },
  mars: { base: 0xb5653a, alt: 0x9d5232, lot: 0xbd7449 },
};
const CAR_COLOURS = [0xf2f2f2, 0x2b2d33, 0xc8463d, 0x3f6fd8, 0xb9c4cc, 0xf3c623];
const PEOPLE_COLOURS = [0xe85d5d, 0x4f86e8, 0x5cc46a, 0xf2c14e, 0xa66de0, 0xffffff, 0x333333, 0xf08a4b];

export function blockCenter(bx, bz, out = new THREE.Vector3()) {
  return out.set(bx * BLOCK, 0, bz * BLOCK);
}

function groundTexture(kind) {
  const s = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  const g = GROUND[kind];
  const base = new THREE.Color(g.base);
  ctx.fillStyle = '#' + base.getHexString();
  ctx.fillRect(0, 0, s, s);
  const rng = mulberry32(kind.length * 97);
  const alt = new THREE.Color(g.alt);
  // Soft blobs, drawn wrapped around the edges so the texture tiles seamlessly.
  for (let i = 0; i < 1400; i++) {
    const x = rng() * s;
    const y = rng() * s;
    const r = 2 + rng() * 10;
    const c = base.clone().lerp(alt, rng()).multiplyScalar(0.94 + rng() * 0.12);
    ctx.fillStyle = `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.2)`;
    for (const dx of [-s, 0, s])
      for (const dy of [-s, 0, s]) {
        if (x + dx + r < 0 || x + dx - r > s || y + dy + r < 0 || y + dy - r > s) continue;
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function roadTexture(dusty) {
  const w = 64;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = dusty ? '#b9b2a8' : '#43474d';
  ctx.fillRect(0, 0, w, h);
  const rng = mulberry32(5);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(${dusty ? '90,80,70' : '255,255,255'},${rng() * 0.06})`;
    ctx.fillRect(rng() * w, rng() * h, 2, 2);
  }
  if (!dusty) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(3, 0, 2, h);
    ctx.fillRect(w - 5, 0, 2, h);
    ctx.fillStyle = 'rgba(255,214,90,0.95)';
    ctx.fillRect(w / 2 - 1.5, 0, 3, h * 0.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const key = (x, z) => `${x},${z}`;

export class CityView {
  constructor(engine, env) {
    this.engine = engine;
    this.env = env;
    this.group = new THREE.Group();
    engine.scene.add(this.group);
    this.staticUniforms = makeTowerUniforms(42);
    this.staticUniforms.uLitFraction.value = 0.42;
    const { material, depthMaterial } = createBuildingMaterial(env.uniforms, this.staticUniforms);
    this.material = material;
    this.depthMaterial = depthMaterial;
    this.towerViews = new Map();
    this.parts = [];
    this.anims = [];
    this.cars = [];
    this.people = [];
    this.city = null;
  }

  // ---------- lifecycle ----------

  load(city, towers) {
    this.clear();
    this.city = city;
    this.place = city.place;
    this.layout = LAYOUTS[city.place];
    this.world = PLACES[city.place].world;
    this.groundKind = PLACES[city.place].ground;
    this.seed = city.seed;
    this.env.setPlace(city.place, this.world);
    this._buildGround();
    this._buildWater();
    this._buildLandmarks();
    for (const t of towers) this.addTower(t);
    this.rebuildSurroundings({ animate: false });
  }

  clear() {
    for (const tv of this.towerViews.values()) {
      this.group.remove(tv.group);
      tv.dispose();
    }
    this.towerViews.clear();
    for (const obj of this.parts) {
      this.group.remove(obj);
      obj.geometry?.dispose();
    }
    this.parts = [];
    this._dynamic = [];
    this.anims = [];
    this.cars = [];
    this.people = [];
    this.carMeshes = [];
    this.peopleMesh = null;
  }

  _add(obj, { dynamic = false } = {}) {
    this.group.add(obj);
    this.parts.push(obj);
    if (dynamic) this._dynamic.push(obj);
    return obj;
  }

  _mesh(geometry, material = this.material, { shadows = true, receive = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = shadows;
    m.receiveShadow = receive;
    if (material === this.material) m.customDepthMaterial = this.depthMaterial;
    return m;
  }

  // ---------- static scenery ----------

  _buildGround() {
    const tex = groundTexture(this.groundKind);
    tex.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    // Sample the same texture at a much bigger scale too, so it doesn't look tiled.
    const baseLum = new THREE.Color(GROUND[this.groundKind].base);
    const lum = 0.299 * baseLum.r + 0.587 * baseLum.g + 0.114 * baseLum.b;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uBaseLum = { value: lum };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uBaseLum;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           const vec3 LW = vec3(0.299, 0.587, 0.114);
           vec2 ruv = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.43 + 0.17;
           diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(map, ruv).rgb, 0.5);
           float l1 = dot(texture2D(map, vMapUv * 0.037 + 0.31).rgb, LW) / uBaseLum;
           float l2 = dot(texture2D(map, vMapUv * 0.0071 + 0.7).rgb, LW) / uBaseLum;
           diffuseColor.rgb *= clamp(mix(1.0, l1, 0.8) * mix(1.0, l2, 0.8), 0.55, 1.6);`,
        );
    };
    const R = 24000;
    const g = new THREE.CircleGeometry(R, 96);
    g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 60, pos.getZ(i) / 60);
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    this._add(ground);

    // Moon and Mars: craters and rocks.
    if (this.world !== 'earth') {
      const b = new GeoBuilder();
      const rng = mulberry32(this.seed);
      const col = GROUND[this.groundKind].base;
      for (let i = 0; i < 70; i++) {
        const r = 30 + Math.pow(rng(), 2) * 260;
        const d = 700 + rng() * 9000;
        const a = rng() * Math.PI * 2;
        crater(b, Math.cos(a) * d, Math.sin(a) * d, r, col);
      }
      for (let i = 0; i < 160; i++) {
        const d = 300 + rng() * 5000;
        const a = rng() * Math.PI * 2;
        const s = 1 + rng() * 5;
        b.set({ kind: KIND.PAINT, color: rgb(new THREE.Color(col).multiplyScalar(0.8 + rng() * 0.25).getHex()) });
        const rock = new THREE.DodecahedronGeometry(s, 0);
        rock.scale(1, 0.6, 1.2);
        rock.translate(Math.cos(a) * d, s * 0.2, Math.sin(a) * d);
        b.addGeometry(rock);
        rock.dispose();
      }
      this._add(this._mesh(b.build(), this.material, { shadows: false }));
    }
    if (this.place === 'mars') {
      // Olympus Mons on the horizon (really much further away, but it's huge).
      const lm = landmarkGeometry('olympus');
      const m = this._mesh(lm.geometry, this.material, { shadows: false });
      m.position.set(-60000, -2500, -150000);
      m.scale.setScalar(0.5);
      this._add(m);
    }
  }

  _buildWater() {
    const L = this.layout;
    if (!L.water.length) return;
    const mat = new THREE.MeshStandardMaterial({ color: 0x23668f, roughness: 0.12, metalness: 0.05 });
    for (const w of L.water) {
      const x0 = (w.x0 - 0.5) * BLOCK;
      const x1 = (w.x1 + 0.5) * BLOCK;
      const z0 = (w.z0 - 0.5) * BLOCK;
      const z1 = (w.z1 + 0.5) * BLOCK;
      const g = new THREE.PlaneGeometry(Math.min(x1 - x0, 48000), Math.min(z1 - z0, 48000));
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set(clamp((x0 + x1) / 2, -24000, 24000), 1.2, clamp((z0 + z1) / 2, -24000, 24000));
      m.receiveShadow = true;
      this._add(m);
    }
    // Beaches / embankments along the shore.
    const b = new GeoBuilder();
    const sandy = this.place === 'dubai';
    for (const w of L.water) {
      const x0 = (w.x0 + 0.5) * BLOCK;
      const x1 = (w.x1 - 0.5) * BLOCK;
      const z0 = (w.z0 + 0.5) * BLOCK;
      const z1 = (w.z1 - 0.5) * BLOCK;
      b.set({ kind: KIND.PAINT, color: rgb(sandy ? 0xead9ae : 0x9a9a96) });
      const span = 9000;
      if (w.x1 < 50) b.box(x1 - 20, 0, clamp((z0 + z1) / 2, -span, span), 60, 1.6, Math.min(z1 - z0, 2 * span));
      if (w.x0 > -50) b.box(x0 + 20, 0, clamp((z0 + z1) / 2, -span, span), 60, 1.6, Math.min(z1 - z0, 2 * span));
      if (w.z1 < 50) b.box(clamp((x0 + x1) / 2, -span, span), 0, z1 - 20, Math.min(x1 - x0, 2 * span), 1.6, 60);
      if (w.z0 > -50) b.box(clamp((x0 + x1) / 2, -span, span), 0, z0 + 20, Math.min(x1 - x0, 2 * span), 1.6, 60);
    }
    if (!b.empty) this._add(this._mesh(b.build(), this.material, { shadows: false }));
  }

  _buildLandmarks() {
    for (const l of this.layout.landmarks) {
      const lm = landmarkGeometry(l.key);
      if (!lm) continue;
      const pos = blockCenter(l.block[0], l.block[1]);
      if (l.island) {
        const b = new GeoBuilder();
        b.set({ kind: KIND.PAINT, color: rgb(GROUND[this.groundKind].base) });
        b.cylinder(pos.x, 0, pos.z, l.island, l.island * 0.92, 2.2, 32);
        this._add(this._mesh(b.build(), this.material, { shadows: false }));
      }
      const m = this._mesh(lm.geometry);
      m.position.copy(pos);
      if (l.island) m.position.y = 2.2;
      m.userData.landmark = l.key;
      this._add(m);
    }
  }

  // ---------- Louie's towers ----------

  addTower(tower) {
    const tv = new TowerView(this.env.uniforms, tower.id);
    tv.setTower(tower, WORLDS[this.world]);
    tv.group.position.copy(this.plotPosition(tower.plot));
    this.group.add(tv.group);
    this.towerViews.set(tower.id, tv);
    return tv;
  }

  removeTower(id) {
    const tv = this.towerViews.get(id);
    if (!tv) return;
    this.group.remove(tv.group);
    tv.dispose();
    this.towerViews.delete(id);
  }

  plotPosition(plot) {
    return blockCenter(plot[0], plot[1]);
  }

  // ---------- the growing surroundings ----------

  // Rebuild roads, buildings, trees, cars and people around the towers.
  // With animate, anything new springs up out of the ground.
  rebuildSurroundings({ animate = false } = {}) {
    for (const obj of this._dynamic) {
      this.group.remove(obj);
      obj.geometry?.dispose();
      this.parts.splice(this.parts.indexOf(obj), 1);
    }
    this._dynamic = [];
    this.anims = [];
    const L = this.layout;
    const towers = [...this.towerViews.values()].map((tv) => tv.tower);
    const owned = new Set(towers.map((t) => key(...t.plot)));
    const finished = towers.filter((t) => t.done);
    const landmarkBlocks = new Set(L.landmarks.map((l) => key(...l.block)));
    const parkBlocks = new Map(L.parks.map((p) => [key(...p.block), p]));

    // Which blocks are downtown, suburbs, or countryside?
    const downtown = new Set();
    const suburb = new Set();
    if (L.fill) {
      const R = L.fill.radius;
      for (let x = -R; x <= R; x++)
        for (let z = -R; z <= R; z++) {
          if (Math.hypot(x, z) <= R + 0.5 && !inWater(L, x, z)) downtown.add(key(x, z));
        }
    }
    for (const t of finished) {
      const [px, pz] = t.plot;
      for (let dx = -2; dx <= 2; dx++)
        for (let dz = -2; dz <= 2; dz++) {
          const k = key(px + dx, pz + dz);
          if (inWater(L, px + dx, pz + dz)) continue;
          if (Math.max(Math.abs(dx), Math.abs(dz)) <= 1) downtown.add(k);
          else suburb.add(k);
        }
    }
    for (const k of downtown) suburb.delete(k);
    for (const t of towers) {
      downtown.add(key(...t.plot));
      suburb.delete(key(...t.plot));
    }
    for (const k of landmarkBlocks) downtown.add(k);
    for (const k of parkBlocks.keys()) downtown.add(k);

    const prevBlocks = this._prevBlocks || new Set();
    const isNew = (k) => animate && !prevBlocks.has(k);
    const allBlocks = new Set([...downtown, ...suburb]);
    this._prevBlocks = allBlocks;

    const oldB = new GeoBuilder();
    const newB = new GeoBuilder();
    const trees = [];
    const palms = [];
    const base = !!L.base;
    const fill = L.fill || { minH: 18, maxH: base ? 20 : 64, styles: ['glass', 'stone', 'filler', 'filler'] };

    for (const k of allBlocks) {
      const [bx, bz] = k.split(',').map(Number);
      const b = isNew(k) ? newB : oldB;
      const c = blockCenter(bx, bz);
      const rng = mulberry32(hash3(bx, bz, this.seed));
      const isDown = downtown.has(k);
      const gk = GROUND[this.groundKind];
      if (owned.has(k)) {
        const t = towers.find((tw) => key(...tw.plot) === k);
        if (t && !t.done) fence(b, c.x, c.z, Math.min(LOT - 20, Math.max(80, towerFootprint(t) + 30)));
        else lot(b, c.x, c.z, LOT, LOT, base ? gk.lot : 0xd4d1ca);
        if (t && t.done && !base) {
          // Trees around the plaza.
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.4;
            trees.push([c.x + Math.cos(a) * LOT * 0.42, c.z + Math.sin(a) * LOT * 0.42, 0.9 + rng() * 0.3, isNew(k)]);
          }
        }
        continue;
      }
      if (landmarkBlocks.has(k)) {
        lot(b, c.x, c.z, LOT, LOT, base ? gk.lot : 0xd8d2c4);
        continue;
      }
      if (parkBlocks.has(k)) {
        lot(b, c.x, c.z, LOT, LOT, 0x6fa85a);
        const p = parkBlocks.get(k);
        if (p.lake) pond(b, c.x, c.z, LOT * 0.28);
        for (let i = 0; i < 36; i++) {
          const x = c.x + (rng() - 0.5) * LOT * 0.9;
          const z = c.z + (rng() - 0.5) * LOT * 0.9;
          if (p.lake && Math.hypot(x - c.x, z - c.z) < LOT * 0.33) continue;
          (L.fill?.palms ? palms : trees).push([x, z, 0.8 + rng() * 0.6, isNew(k)]);
        }
        continue;
      }
      if (base) {
        lot(b, c.x, c.z, LOT * 0.55, LOT * 0.55, gk.lot, 0.1);
        const n = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          const ox = (rng() - 0.5) * LOT * 0.55;
          const oz = (rng() - 0.5) * LOT * 0.55;
          baseModule(b, rng, c.x + ox, c.z + oz, this.world);
        }
        continue;
      }
      if (isDown) {
        lot(b, c.x, c.z, LOT, LOT, gk.lot);
        if (!L.fill && rng() < 0.14) {
          // A little park.
          pond(b, c.x, c.z, LOT * 0.2);
          for (let i = 0; i < 18; i++) {
            const a = rng() * Math.PI * 2;
            const r = LOT * (0.28 + rng() * 0.18);
            trees.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 0.8 + rng() * 0.5, isNew(k)]);
          }
          continue;
        }
        const n = rng() < 0.5 ? 2 : 3;
        const cell = LOT / n;
        const dist = Math.hypot(bx, bz);
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++) {
            if (rng() < 0.12) continue;
            const w = cell * (0.55 + rng() * 0.25);
            const d = cell * (0.55 + rng() * 0.25);
            const x = c.x - LOT / 2 + cell * (i + 0.5);
            const z = c.z - LOT / 2 + cell * (j + 0.5);
            const falloff = L.fill ? clamp(1.25 - dist / (L.fill.radius + 1), 0.25, 1) : 1;
            let h = lerp(fill.minH, fill.maxH, Math.pow(rng(), 2.2)) * falloff;
            let style = fill.styles[Math.floor(rng() * fill.styles.length)];
            if (fill.pencil && rng() < 0.04) {
              h = 380 + rng() * 60;
              style = 'stone';
            }
            officeBlock(b, rng, x, z, style === 'stone' && h > 380 ? w * 0.45 : w, style === 'stone' && h > 380 ? d * 0.45 : d, h, style);
          }
        if (L.fill?.palms) for (let i = 0; i < 6; i++) palms.push([c.x + (rng() - 0.5) * LOT, c.z + LOT * 0.47 * (i % 2 ? 1 : -1), 1, isNew(k)]);
        continue;
      }
      // Suburbs: houses with gardens and trees.
      lot(b, c.x, c.z, LOT, LOT, 0x7fb062, 0.15);
      const rows = 4;
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < rows; j++) {
          if (rng() < 0.15) continue;
          const x = c.x - LOT / 2 + (LOT / rows) * (i + 0.5) + (rng() - 0.5) * 8;
          const z = c.z - LOT / 2 + (LOT / rows) * (j + 0.5) + (rng() - 0.5) * 8;
          house(b, rng, x, z, Math.floor(rng() * 4) * (Math.PI / 2));
          trees.push([x + 14, z + 10, 0.7 + rng() * 0.4, isNew(k)]);
        }
    }

    // Countryside trees (or desert palms) beyond the town.
    if (!base) {
      const rng = mulberry32(this.seed + 5);
      const reach = Math.max(4, ...[...allBlocks].map((k) => Math.max(...k.split(',').map((v) => Math.abs(+v))))) + 1;
      const count = L.fill?.palms ? 140 : 420;
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const r = (reach + rng() * 9) * BLOCK;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const bx = Math.round(x / BLOCK);
        const bz = Math.round(z / BLOCK);
        if (allBlocks.has(key(bx, bz)) || inWater(L, bx, bz)) continue;
        (L.fill?.palms ? palms : trees).push([x, z, 0.8 + rng() * 0.8, false]);
      }
      // Patchwork fields around a new city.
      if (this.place === 'newcity') {
        const fb = new GeoBuilder();
        const cols = [0x8fb85c, 0xb9c46a, 0x7ea852, 0xc9b26a, 0x6e9a4c];
        for (let i = 0; i < 70; i++) {
          const a = rng() * Math.PI * 2;
          const r = (reach + 1.5 + rng() * 10) * BLOCK;
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          fb.set({ kind: KIND.PAINT, color: rgb(cols[Math.floor(rng() * cols.length)]) });
          fb.box(x, 0, z, 120 + rng() * 260, 0.12, 120 + rng() * 260);
        }
        this._add(this._mesh(fb.build(), this.material, { shadows: false }), { dynamic: true });
      }
    }

    if (!oldB.empty) this._add(this._mesh(oldB.build()), { dynamic: true });
    if (!newB.empty) {
      const m = this._add(this._mesh(newB.build()), { dynamic: true });
      m.scale.y = 0.001;
      this.anims.push({ obj: m, t: -0.6, axis: 'y' });
    }
    this._buildRoads(allBlocks, animate ? prevBlocks : null);
    this._buildTrees(trees, palms);
    this._buildTraffic(allBlocks, base);
  }

  _buildRoads(blocks, prevBlocks) {
    const segs = new Map();
    for (const k of blocks) {
      const [bx, bz] = k.split(',').map(Number);
      const x0 = (bx - 0.5) * BLOCK;
      const x1 = (bx + 0.5) * BLOCK;
      const z0 = (bz - 0.5) * BLOCK;
      const z1 = (bz + 0.5) * BLOCK;
      segs.set(`h${z0},${x0}`, { axis: 'x', c: z0, a: x0, b: x1 });
      segs.set(`h${z1},${x0}`, { axis: 'x', c: z1, a: x0, b: x1 });
      segs.set(`v${x0},${z0}`, { axis: 'z', c: x0, a: z0, b: z1 });
      segs.set(`v${x1},${z0}`, { axis: 'z', c: x1, a: z0, b: z1 });
    }
    this.roadSegs = [...segs.values()];
    const dusty = this.world !== 'earth';
    const mat = new THREE.MeshStandardMaterial({ map: roadTexture(dusty), roughness: 0.92, metalness: 0 });
    const pos = [];
    const uv = [];
    const idx = [];
    const hw = ROAD_W / 2;
    const y = 0.35;
    const push = (x, z, u, v) => {
      pos.push(x, y, z);
      uv.push(u, v);
      return pos.length / 3 - 1;
    };
    for (const s of this.roadSegs) {
      const a = s.a + hw;
      const bb = s.b - hw;
      const len = (bb - a) / 24;
      let i0, i1, i2, i3;
      if (s.axis === 'x') {
        i0 = push(a, s.c - hw, 0, 0);
        i1 = push(a, s.c + hw, 1, 0);
        i2 = push(bb, s.c + hw, 1, len);
        i3 = push(bb, s.c - hw, 0, len);
      } else {
        i0 = push(s.c + hw, a, 0, 0);
        i1 = push(s.c - hw, a, 1, 0);
        i2 = push(s.c - hw, bb, 1, len);
        i3 = push(s.c + hw, bb, 0, len);
      }
      idx.push(i0, i2, i1, i0, i3, i2);
    }
    // Junction squares (plain tarmac).
    const corners = new Set();
    for (const s of this.roadSegs) {
      for (const p of [s.a, s.b]) corners.add(s.axis === 'x' ? `${p},${s.c}` : `${s.c},${p}`);
    }
    for (const cnr of corners) {
      const [x, z] = cnr.split(',').map(Number);
      const i0 = push(x - hw, z - hw, 0.25, 0.75);
      const i1 = push(x - hw, z + hw, 0.25, 0.75);
      const i2 = push(x + hw, z + hw, 0.25, 0.75);
      const i3 = push(x + hw, z - hw, 0.25, 0.75);
      idx.push(i0, i1, i2, i0, i2, i3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const roads = new THREE.Mesh(g, mat);
    roads.receiveShadow = true;
    this._add(roads, { dynamic: true });
  }

  _buildTrees(trees, palms) {
    const make = (list, geo) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, this.material, list.length);
      mesh.customDepthMaterial = this.depthMaterial;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color();
      const rng = mulberry32(list.length);
      const greens = this.place === 'dubai' ? [0x5f9a3f, 0x7aa84a] : [0x4f8f3e, 0x5fa34a, 0x6eae4f, 0x3f7f3a, 0x8bb85a];
      mesh.userData.items = list;
      list.forEach(([x, z, s], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
        m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(i, m);
        col.set(greens[Math.floor(rng() * greens.length)]);
        mesh.setColorAt(i, col);
      });
      mesh.computeBoundingSphere();
      this._add(mesh, { dynamic: true });
      const fresh = list.map((t, i) => (t[3] ? i : -1)).filter((i) => i >= 0);
      if (fresh.length) this.anims.push({ obj: mesh, t: -0.9, instances: fresh, list });
    };
    make(trees, this._treeGeo || (this._treeGeo = treeGeometry()));
    make(palms, this._palmGeo || (this._palmGeo = palmGeometry()));
  }

  // Cars on the roads and people on the pavements (rovers and astronauts in space).
  _buildTraffic(blocks, base) {
    this.cars = [];
    this.people = [];
    // Merge straight road pieces into long lines that cars drive along.
    const lines = new Map();
    for (const s of this.roadSegs) {
      const k = `${s.axis}${s.c}`;
      const l = lines.get(k) || { axis: s.axis, c: s.c, a: Infinity, b: -Infinity };
      l.a = Math.min(l.a, s.a);
      l.b = Math.max(l.b, s.b);
      lines.set(k, l);
    }
    this.lines = [...lines.values()];
    const total = this.lines.reduce((sum, l) => sum + (l.b - l.a), 0);
    const rng = mulberry32(this.seed + blocks.size);
    const nCars = Math.min(base ? 18 : 160, Math.floor(total / (base ? 600 : 90)));
    const nPeople = Math.min(base ? 30 : 220, Math.floor(total / (base ? 300 : 60)));
    const pickLine = () => {
      let r = rng() * total;
      for (const l of this.lines) {
        r -= l.b - l.a;
        if (r <= 0) return l;
      }
      return this.lines[0];
    };
    const kinds = base ? 1 : CAR_COLOURS.length;
    for (let i = 0; i < nCars; i++) {
      const l = pickLine();
      if (!l) break;
      const dir = rng() < 0.5 ? 1 : -1;
      this.cars.push({ l, t: l.a + rng() * (l.b - l.a), dir, v: (base ? 4 : 9) + rng() * 5, kind: Math.floor(rng() * kinds), lane: dir * ROAD_W * 0.24 });
    }
    for (let i = 0; i < nPeople; i++) {
      const l = pickLine();
      if (!l) break;
      const side = rng() < 0.5 ? 1 : -1;
      this.people.push({ l, t: l.a + rng() * (l.b - l.a), dir: rng() < 0.5 ? 1 : -1, v: 1 + rng() * 0.6, off: side * (ROAD_W / 2 + 3 + rng() * 3), ph: rng() * 6 });
    }
    this.carMeshes = [];
    for (let k = 0; k < kinds; k++) {
      const count = this.cars.filter((c) => c.kind === k).length;
      if (!count) {
        this.carMeshes.push(null);
        continue;
      }
      const geo = base ? (this._roverGeo ||= roverGeometry()) : ((this._carGeos ||= CAR_COLOURS.map((c) => carGeometry(c)))[k]);
      const mesh = new THREE.InstancedMesh(geo, this.material, count);
      mesh.frustumCulled = false;
      this._add(mesh, { dynamic: true });
      this.carMeshes.push(mesh);
    }
    if (this.people.length) {
      const geo = base ? (this._astroGeo ||= personGeometry({ astronaut: true })) : (this._personGeo ||= personGeometry());
      const mesh = new THREE.InstancedMesh(geo, this.material, this.people.length);
      const col = new THREE.Color();
      this.people.forEach((p, i) => mesh.setColorAt(i, col.set(base ? 0xffffff : PEOPLE_COLOURS[i % PEOPLE_COLOURS.length])));
      mesh.frustumCulled = false;
      this._add(mesh, { dynamic: true });
      this.peopleMesh = mesh;
    } else this.peopleMesh = null;
    this._trafficT = 0;
  }

  _updateTraffic(dt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    const counters = this.carMeshes.map(() => 0);
    for (const c of this.cars) {
      c.t += c.v * c.dir * dt;
      if (c.t > c.l.b) c.t = c.l.a;
      if (c.t < c.l.a) c.t = c.l.b;
      const mesh = this.carMeshes[c.kind];
      if (!mesh) continue;
      if (c.l.axis === 'x') {
        p.set(c.t, 0.4, c.l.c + c.lane);
        q.setFromAxisAngle(up, c.dir > 0 ? 0 : Math.PI);
      } else {
        p.set(c.l.c - c.lane, 0.4, c.t);
        q.setFromAxisAngle(up, c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      m.compose(p, q, s);
      mesh.setMatrixAt(counters[c.kind]++, m);
    }
    for (const mesh of this.carMeshes) if (mesh) mesh.instanceMatrix.needsUpdate = true;
    if (this.peopleMesh) {
      this.people.forEach((h, i) => {
        h.t += h.v * h.dir * dt;
        if (h.t > h.l.b) h.t = h.l.a;
        if (h.t < h.l.a) h.t = h.l.b;
        h.ph += dt * 7;
        const bob = Math.abs(Math.sin(h.ph)) * 0.08;
        if (h.l.axis === 'x') {
          p.set(h.t, 0.3 + bob, h.l.c + h.off);
          q.setFromAxisAngle(up, h.dir > 0 ? 0 : Math.PI);
        } else {
          p.set(h.l.c + h.off, 0.3 + bob, h.t);
          q.setFromAxisAngle(up, h.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        }
        m.compose(p, q, s);
        this.peopleMesh.setMatrixAt(i, m);
      });
      this.peopleMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- per frame ----------

  update(dt) {
    const cam = this.engine.camera;
    for (const tv of this.towerViews.values()) {
      tv.update(dt);
      tv.updateGuide(cam, this.engine.height);
    }
    if (this.cars.length || this.people.length) this._updateTraffic(dt);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt / 1.6;
      const t = clamp(a.t, 0, 1);
      if (a.axis === 'y') {
        a.obj.scale.y = Math.max(0.001, easeOutBack(t));
      } else if (a.instances) {
        // Trees grow one after another.
        const m = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scl = new THREE.Vector3();
        for (let j = 0; j < a.instances.length; j++) {
          const idx = a.instances[j];
          const local = clamp(t * 1.5 - (j / a.instances.length) * 0.5, 0, 1);
          a.obj.getMatrixAt(idx, m);
          m.decompose(pos, quat, scl);
          const s0 = a.list[idx][2];
          const s = Math.max(0.001, s0 * easeOutBack(local));
          m.compose(pos, quat, scl.set(s, s, s));
          a.obj.setMatrixAt(idx, m);
        }
        a.obj.instanceMatrix.needsUpdate = true;
      }
      if (a.t >= 1) this.anims.splice(i, 1);
    }
  }

  // Tallest thing to frame the camera on.
  tallest() {
    let h = 0;
    for (const tv of this.towerViews.values()) h = Math.max(h, tv.height);
    for (const l of this.layout?.landmarks || []) h = Math.max(h, l.key === 'burj' ? 828 : 400);
    return h;
  }
}
