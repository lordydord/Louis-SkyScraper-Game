import * as THREE from 'three';
import { PIECES } from '../data/pieces.js';
import { WORLDS } from '../data/places.js';
import { newTower, addPart, towerHeight, setPartWidth, stretchPart } from '../game/towerModel.js';
import { TowerView, towerFootprint } from './towerView.js';
import { landmarkGeometry, hasModel } from './landmarks3d.js';
import { makeTowerUniforms, createBuildingMaterial } from './materials.js';

// Small pictures rendered from the real 3D models: inventory pieces and famous
// buildings. Rendered once into images so the menus stay fast.

function studioEnv(renderer) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'varying vec3 vP; void main(){ float y = normalize(vP).y; vec3 top = vec3(0.55,0.75,1.0); vec3 mid = vec3(1.0); vec3 low = vec3(0.45,0.45,0.5); vec3 c = y > 0.0 ? mix(mid, top, pow(y, 0.6)) : mix(mid, low, pow(-y, 0.5)); gl_FragColor = vec4(c * 1.2, 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 100, { size: 64 });
  pmrem.dispose();
  return rt.texture;
}

export class Thumbs {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.scene.environment = studioEnv(engine.renderer);
    this.scene.environmentIntensity = 0.8;
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 4);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x606060, 0.6));
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.5, 100000);
    this.globals = { uTime: { value: 0 }, uNight: { value: 0 } };
    this.cache = new Map();
  }

  _shoot(object, height, width, size = [128, 136], { el = 0.32, az = 0.65 } = {}) {
    this.scene.add(object);
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    const cam = this.camera;
    cam.aspect = size[0] / size[1];
    const fit = Math.max(dims.y, Math.max(dims.x, dims.z) / cam.aspect) * 0.5;
    const dist = (fit / Math.tan((cam.fov * Math.PI) / 360)) * 1.12;
    cam.position.set(center.x + Math.sin(az) * Math.cos(el) * dist, center.y + Math.sin(el) * dist, center.z + Math.cos(az) * Math.cos(el) * dist);
    cam.near = dist * 0.05;
    cam.far = dist * 4;
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    const canvas = this.engine.renderToCanvas(this.scene, cam, size[0] * 2, size[1] * 2, { transparent: true });
    this.scene.remove(object);
    return canvas.toDataURL('image/png');
  }

  // Picture of one inventory piece.
  piece(id) {
    const key = 'piece:' + id;
    if (this.cache.has(key)) return this.cache.get(key);
    const def = PIECES[id];
    let t = newTower({ id: 'icon-' + id, city: 'x', plot: [0, 0] });
    if (def.cat === 'top') {
      t = addPart(t, 'glass').tower;
      t = setPartWidth(t, 0, 36);
      t = stretchPart(t, 0, -28);
      t = addPart(t, id).tower;
      if (id === 'spire' || id === 'antenna') t = stretchPart(t, 1, 20);
    } else if (id === 'bridge') {
      t = { ...t, twin: true };
      t = addPart(t, 'glass').tower;
      t = setPartWidth(t, 0, 30);
      t = addPart(t, 'bridge').tower;
      t = addPart(t, 'glass').tower;
    } else {
      t = addPart(t, id).tower;
      t = setPartWidth(t, 0, 40);
      if (id === 'burj') {
        t = addPart(t, 'burj').tower;
        t = addPart(t, 'burj').tower;
      }
    }
    const tv = new TowerView(this.globals, 'icon-' + id);
    tv.setTower(t, WORLDS.earth);
    const url = this._shoot(tv.group, towerHeight(t), towerFootprint(t));
    tv.dispose();
    this.cache.set(key, url);
    return url;
  }

  // Picture of a famous building (or mountain).
  landmark(key) {
    const k = 'lm:' + key;
    if (this.cache.has(k)) return this.cache.get(k);
    if (!hasModel(key)) return null;
    const lm = landmarkGeometry(key);
    if (!this._lmMat) this._lmMat = createBuildingMaterial(this.globals, makeTowerUniforms(5)).material;
    const mesh = new THREE.Mesh(lm.geometry, this._lmMat);
    const url = this._shoot(mesh, 0, lm.w, [64, 88], { el: 0.15, az: 0.6 });
    this.cache.set(k, url);
    return url;
  }
}
