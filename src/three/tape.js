import * as THREE from 'three';
import { clamp, easeInOutCubic } from '../util/math.js';

// A giant yellow tape measure that unrolls up the side of a tower, with marks every
// so often. Numbers for the big marks are DOM labels placed by the game screen.

export function niceStep(h) {
  const target = h / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1))));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

const vertex = /* glsl */ `
varying vec2 vUv;
varying float vY;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const fragment = /* glsl */ `
uniform float uShown;
uniform float uMajor;
uniform float uBase;
varying vec2 vUv;
varying float vY;
void main() {
  float y = vY - uBase;
  if (y > uShown) discard;
  vec3 tape = vec3(1.0, 0.8, 0.15);
  float minor = uMajor / 10.0;
  float fwM = fwidth(y / minor);
  float fwJ = fwidth(y / uMajor);
  float mMinor = (1.0 - smoothstep(0.0, 1.5 * fwM + 0.02, abs(fract(y / minor + 0.5) - 0.5) * 2.0)) * step(vUv.x, 0.35);
  float mMajor = (1.0 - smoothstep(0.0, 1.5 * fwJ + 0.01, abs(fract(y / uMajor + 0.5) - 0.5) * 2.0)) * step(vUv.x, 0.8);
  // Hide minor marks when they get too close together on screen.
  mMinor *= 1.0 - smoothstep(0.15, 0.35, fwM);
  float mark = max(mMinor, mMajor);
  float edge = step(0.94, vUv.x) + step(vUv.x, 0.04);
  vec3 col = mix(tape, vec3(0.08, 0.06, 0.02), max(mark, edge * 0.6));
  gl_FragColor = vec4(col, 1.0);
}`;

export class TapeMeasure {
  constructor(scene) {
    this.uniforms = { uShown: { value: 0 }, uMajor: { value: 100 }, uBase: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0.5, 0.5, 0);
    this.strip = new THREE.Mesh(g, this.mat);
    this.strip.frustumCulled = false;
    this.caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.5 }),
    );
    this.group = new THREE.Group();
    this.group.add(this.strip, this.caseMesh);
    this.group.visible = false;
    scene.add(this.group);
    this.height = 0;
    this.shown = 0;
    this.anim = null;
    this.target = null;
  }

  // Show beside a tower: base position, height, and how far out from its centre.
  show(basePos, height, sideOffset, { animate = true } = {}) {
    this.base = basePos.clone();
    this.height = height;
    this.offset = sideOffset;
    this.uniforms.uMajor.value = niceStep(height);
    this.uniforms.uBase.value = basePos.y;
    this.group.visible = true;
    const w = clamp(height * 0.032, 4, 8000);
    this.width = w;
    this.strip.scale.set(w, height, 1);
    this.caseMesh.scale.set(w * 2.2, w * 2.2, w * 1.4);
    if (animate) this.anim = { t: 0, dur: clamp(1.5 + Math.log10(Math.max(height, 10)) * 0.6, 2, 4.5) };
    else {
      this.anim = null;
      this.shown = height;
    }
  }

  hide() {
    this.group.visible = false;
    this.anim = null;
  }

  get visible() {
    return this.group.visible;
  }

  get done() {
    return !this.anim;
  }

  update(dt, camera) {
    if (!this.group.visible) return;
    if (this.anim) {
      this.anim.t += dt / this.anim.dur;
      const t = Math.min(1, this.anim.t);
      this.shown = this.height * easeInOutCubic(t);
      if (t >= 1) this.anim = null;
    }
    this.uniforms.uShown.value = this.shown;
    // Stand to the side of the tower facing the camera.
    const toCam = new THREE.Vector3().subVectors(camera.position, this.base);
    toCam.y = 0;
    if (toCam.lengthSq() < 1) toCam.set(0, 0, 1);
    toCam.normalize();
    const right = new THREE.Vector3(toCam.z, 0, -toCam.x);
    const p = this.base.clone().addScaledVector(right, -this.offset - this.width * 1.2).addScaledVector(toCam, this.offset * 0.3);
    this.group.position.copy(p);
    this.group.rotation.set(0, Math.atan2(toCam.x, toCam.z), 0);
    this.strip.position.set(0, 0, 0);
    this.caseMesh.position.set(this.width * 0.5, this.width * 1.1, 0);
  }

  // World positions of the big marks currently unrolled (for number labels).
  majorMarks(max = 9) {
    const out = [];
    const step = this.uniforms.uMajor.value;
    const n = Math.floor(this.shown / step);
    const every = Math.max(1, Math.ceil(n / max));
    for (let i = every; i <= n; i += every) {
      const v = this.group.localToWorld(new THREE.Vector3(this.width, i * step, 0));
      out.push({ value: i * step, pos: v });
    }
    return out;
  }

  topPosition() {
    return this.group.localToWorld(new THREE.Vector3(this.width * 0.5, this.shown, 0));
  }
}
