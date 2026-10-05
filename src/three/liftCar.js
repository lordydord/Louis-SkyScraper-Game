import * as THREE from 'three';
import { clamp, lerp } from '../util/math.js';

// The glass lift that carries the camera up the outside of a tower, with a little
// passenger inside. Its front (+z) faces away from the tower.

export function createLiftCar() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0xe0b84c, metalness: 0.85, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0xaee0ff,
    metalness: 0.2,
    roughness: 0.05,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const light = new THREE.MeshStandardMaterial({ color: 0xfff3cf, emissive: 0xffe7a3, emissiveIntensity: 1.4 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x3f8cff, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b98f, roughness: 0.7 });
  const W = 3.2;
  const H = 4;
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(W, 0.3, W), frame, 0, 0.15, 0);
  add(new THREE.BoxGeometry(W, 0.4, W), frame, 0, H - 0.2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.22, H, 0.22), frame, (sx * (W - 0.22)) / 2, H / 2, (sz * (W - 0.22)) / 2);
  const box = add(new THREE.BoxGeometry(W - 0.15, H - 0.6, W - 0.15), glass, 0, H / 2, 0);
  box.renderOrder = 4;
  add(new THREE.BoxGeometry(W * 0.6, 0.08, W * 0.6), light, 0, H - 0.45, 0);
  // The passenger, looking out at the view.
  const body = add(new THREE.CapsuleGeometry(0.32, 0.8, 4, 10), shirt, 0, 1.0, 0.3);
  body.scale.set(1, 1, 0.8);
  add(new THREE.SphereGeometry(0.28, 14, 10), skin, 0, 1.95, 0.3);
  g.visible = false;
  return g;
}

// How far from the tower's middle its outside wall is at height y, so the lift can
// run just outside it (square floors reach further at the corners).
export function towerRadiusAt(lay, y) {
  for (const it of lay) {
    if (y < it.z0 || y > it.z1) continue;
    const t = clamp((y - it.z0) / Math.max(1, it.z1 - it.z0), 0, 1);
    if (it.top) {
      const r0 = clamp(it.w * 0.085, 1.2, 9) * 1.7;
      return lerp(r0, 0.5, t) + 0.5;
    }
    const w = lerp(it.w, it.topW, t);
    return it.def.geo === 'round' || it.def.geo === 'y' ? w / 2 + 0.5 : w * 0.72;
  }
  return 10;
}
