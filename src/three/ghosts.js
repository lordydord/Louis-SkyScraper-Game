import * as THREE from 'three';
import { landmarksFor } from '../data/landmarks.js';
import { landmarkGeometry, createGhostMaterial, hasModel } from './landmarks3d.js';
import { clamp, damp } from '../util/math.js';

// See-through famous buildings standing beside Louie's tower: the next one to beat,
// and the one he just passed (in green). Sky heights (clouds, aeroplanes, the edge
// of space) are shown as glowing rings around the tower.

export class Ghosts {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.list = landmarksFor('earth');
    this.slots = { target: null, beaten: null };
    this.towerPos = new THREE.Vector3();
    this.height = 0;
    this.footprint = 40;
    this.enabled = true;
    this.ringGeo = new THREE.TorusGeometry(1, 0.012, 6, 96);
    this.ringGeo.rotateX(Math.PI / 2);
  }

  setWorld(world) {
    this.list = landmarksFor(world);
    this.clear();
  }

  clear() {
    for (const k of ['target', 'beaten']) this._drop(k);
  }

  _drop(slot) {
    const s = this.slots[slot];
    if (!s) return;
    this.group.remove(s.obj);
    s.mat.dispose();
    this.slots[slot] = null;
  }

  _make(lm, beaten) {
    const mat = createGhostMaterial(beaten ? 0x8dffb8 : 0x9fe6ff);
    let obj;
    let w = 0;
    if (lm.kind === 'sky') {
      obj = new THREE.Mesh(this.ringGeo, mat);
    } else if (hasModel(lm.key)) {
      const g = landmarkGeometry(lm.key);
      obj = new THREE.Mesh(g.geometry, mat);
      w = g.w;
    } else return null;
    obj.renderOrder = 10;
    if (lm.key === 'jeddah') mat.uniforms.uCut.value = 430; // built so far (mid-2026)
    this.group.add(obj);
    return { lm, obj, mat, w, fade: 0, age: 0 };
  }

  // Tell the ghosts where the tower is and how tall it is now.
  sync(towerPos, height, footprint) {
    this.towerPos.copy(towerPos);
    this.height = height;
    this.footprint = footprint;
    const next = this.list.find((l) => l.h > height) || null;
    const cur = this.slots.target;
    if ((cur && cur.lm) !== next) {
      this._drop('target');
      if (next) this.slots.target = this._make(next, false);
    }
  }

  // Show a landmark as just beaten (green) for a few seconds.
  markBeaten(lm) {
    this._drop('beaten');
    this.slots.beaten = this._make(lm, true);
  }

  // The next landmark to beat, if any.
  get target() {
    return this.slots.target ? this.slots.target.lm : null;
  }

  update(dt, camera) {
    this.group.visible = this.enabled;
    if (!this.enabled) return;
    const toCam = new THREE.Vector3().subVectors(camera.position, this.towerPos);
    toCam.y = 0;
    if (toCam.lengthSq() < 1) toCam.set(0, 0, 1);
    toCam.normalize();
    const right = new THREE.Vector3(toCam.z, 0, -toCam.x);
    for (const [slot, side] of [
      ['target', 1],
      ['beaten', -1],
    ]) {
      const s = this.slots[slot];
      if (!s) continue;
      s.age += dt;
      const fadeOut = slot === 'beaten' ? clamp((4.5 - s.age) / 1.2, 0, 1) * 0.7 : 1;
      s.fade = damp(s.fade, fadeOut, 4, dt);
      s.mat.uniforms.uOpacity.value = s.fade;
      if (slot === 'beaten' && s.age > 6) {
        this._drop('beaten');
        continue;
      }
      const lm = s.lm;
      if (lm.kind === 'sky') {
        const r = Math.max(this.footprint * 1.6, lm.h * 0.08);
        s.obj.scale.set(r, r, r);
        s.obj.position.set(this.towerPos.x, this.towerPos.y + lm.h, this.towerPos.z);
        s.labelPos = s.obj.position.clone().addScaledVector(right, r * side);
        continue;
      }
      let w = s.w;
      let sx = 1;
      if (lm.kind === 'mountain') {
        // Squash wide mountains sideways so the peak stays near the tower.
        sx = clamp((this.height * 1.4 + this.footprint) / w, 0.02, 1);
        w *= sx;
      }
      s.obj.scale.set(sx, 1, sx);
      const gap = Math.max(20, this.footprint * 0.4);
      const off = this.footprint / 2 + w / 2 + gap;
      s.obj.position.copy(this.towerPos).addScaledVector(right, off * side);
      s.obj.rotation.y = Math.atan2(toCam.x, toCam.z);
      s.labelPos = s.obj.position.clone().setY(this.towerPos.y + lm.h);
    }
  }

  // For the floating number labels: [{ lm, pos, beaten }]
  labels() {
    const out = [];
    for (const slot of ['target', 'beaten']) {
      const s = this.slots[slot];
      if (s && s.labelPos && s.fade > 0.2) out.push({ lm: s.lm, pos: s.labelPos, beaten: slot === 'beaten' });
    }
    return out;
  }
}
