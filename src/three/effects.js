import * as THREE from 'three';
import { clamp } from '../util/math.js';

// Celebrations: sparkles, confetti and soft fireworks. Particles are sized in metres
// relative to the tower so they look right on a 40 m tower and a 40 km one.

const pointsVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 90.0);
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const pointsFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  gl_FragColor = vec4(vColor * a * 1.6, 1.0);
}`;

const MAX = 3000;

export class Effects {
  constructor(scene, engine) {
    this.engine = engine;
    this.parts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.color = new Float32Array(MAX * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = { uScale: { value: 600 } };
    this.points = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: pointsVertex,
        fragmentShader: pointsFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    scene.add(this.points);

    // Confetti: little paper rectangles that flutter down.
    this.confettiMax = 500;
    const cg = new THREE.PlaneGeometry(1, 0.55);
    this.confetti = new THREE.InstancedMesh(
      cg,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }),
      this.confettiMax,
    );
    this.confetti.frustumCulled = false;
    this.confetti.count = 0;
    this.confettiData = [];
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < this.confettiMax; i++) this.confetti.setColorAt(i, white);
    scene.add(this.confetti);
  }

  _spawn(p) {
    if (this.parts.length >= MAX) this.parts.shift();
    this.parts.push(p);
  }

  // Twinkly stars bursting from a point (passing a famous building, etc).
  sparkle(center, scale, count = 90) {
    const cols = [new THREE.Color(1, 0.95, 0.6), new THREE.Color(0.7, 0.95, 1), new THREE.Color(1, 1, 1)];
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const speed = scale * (0.4 + Math.random() * 0.8);
      this._spawn({
        p: center.clone(),
        v: dir.multiplyScalar(speed),
        life: 0,
        max: 1 + Math.random() * 0.8,
        size: scale * (0.05 + Math.random() * 0.08),
        c: cols[i % 3],
        g: -scale * 0.2,
        drag: 1.6,
      });
    }
  }

  // A soft firework (no bang): a bright burst that drifts down and fades.
  firework(center, scale, color = null) {
    const base = color ? new THREE.Color(color) : new THREE.Color().setHSL(Math.random(), 0.9, 0.62);
    const n = 160;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const dir = new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t));
      const c = base.clone().offsetHSL((Math.random() - 0.5) * 0.08, 0, Math.random() * 0.15);
      this._spawn({
        p: center.clone(),
        v: dir.multiplyScalar(scale * (0.9 + Math.random() * 0.25)),
        life: 0,
        max: 1.8 + Math.random() * 0.9,
        size: scale * 0.07,
        c,
        g: -scale * 0.35,
        drag: 1.4,
        twinkle: true,
      });
    }
  }

  // Dust puff where a new section lands.
  dust(center, radius) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0.15 + Math.random() * 0.2, Math.sin(a));
      this._spawn({
        p: center.clone().add(new THREE.Vector3(Math.cos(a) * radius * 0.5, 0, Math.sin(a) * radius * 0.5)),
        v: dir.multiplyScalar(radius * (0.5 + Math.random() * 0.6)),
        life: 0,
        max: 0.8 + Math.random() * 0.4,
        size: radius * 0.35,
        c: new THREE.Color(0.55, 0.52, 0.48),
        g: 0,
        drag: 2.5,
        dim: 0.35,
      });
    }
  }

  confettiBurst(center, scale) {
    const cols = [0xff5a52, 0xffc93c, 0x3f8cff, 0x2fbf71, 0xb48cff, 0xff8ad8, 0xffffff];
    const col = new THREE.Color();
    for (let i = 0; i < 260; i++) {
      if (this.confettiData.length >= this.confettiMax) this.confettiData.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = scale * (0.3 + Math.random() * 0.7);
      this.confettiData.push({
        p: center.clone(),
        v: new THREE.Vector3(Math.cos(a) * sp, scale * (0.4 + Math.random() * 0.8), Math.sin(a) * sp),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        size: scale * 0.035,
        life: 0,
        max: 5 + Math.random() * 2,
        color: col.set(cols[i % cols.length]).clone(),
      });
    }
  }

  update(dt, camera, viewportHeight) {
    this.uniforms.uScale.value = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life += dt;
      if (q.life >= q.max) {
        this.parts.splice(i, 1);
        continue;
      }
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.v.y += q.g * dt;
      q.p.addScaledVector(q.v, dt);
    }
    for (const q of this.parts) {
      if (n >= MAX) break;
      const t = q.life / q.max;
      this.pos[n * 3] = q.p.x;
      this.pos[n * 3 + 1] = q.p.y;
      this.pos[n * 3 + 2] = q.p.z;
      this.size[n] = q.size * (q.dim ? 1 + t : 1);
      let a = (1 - t) * (1 - t);
      if (q.twinkle) a *= 0.75 + 0.25 * Math.sin(q.life * 9 + n);
      this.alpha[n] = a * (q.dim || 1);
      this.color[n * 3] = q.c.r;
      this.color[n * 3 + 1] = q.c.g;
      this.color[n * 3 + 2] = q.c.b;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const k of ['position', 'aSize', 'aAlpha', 'aColor']) g.attributes[k].needsUpdate = true;

    // Confetti
    const m = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let c = 0;
    for (let i = this.confettiData.length - 1; i >= 0; i--) {
      const d = this.confettiData[i];
      d.life += dt;
      if (d.life > d.max) this.confettiData.splice(i, 1);
    }
    for (const d of this.confettiData) {
      d.v.multiplyScalar(Math.exp(-2.2 * dt));
      d.v.y -= d.size * 6 * dt;
      d.p.addScaledVector(d.v, dt);
      d.p.x += Math.sin(d.life * 3 + d.size) * d.size * dt * 4;
      d.rot.x += d.spin.x * dt;
      d.rot.y += d.spin.y * dt;
      d.rot.z += d.spin.z * dt;
      quat.setFromEuler(d.rot);
      const fade = clamp((d.max - d.life) / 1.2, 0, 1);
      s.setScalar(d.size * fade);
      m.compose(d.p, quat, s);
      this.confetti.setMatrixAt(c, m);
      this.confetti.setColorAt(c, d.color);
      c++;
    }
    this.confetti.count = c;
    this.confetti.instanceMatrix.needsUpdate = true;
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }
}
