import * as THREE from 'three';
import { WORLDS } from '../data/places.js';
import { SKY_OBJECTS, BODIES } from '../data/planets.js';
import { clamp, lerp, smoothstep, mulberry32 } from '../util/math.js';
import { DAY_LENGTH } from '../config.js';
import { planetTexture } from './planetTextures.js';

// Sky, Sun and Moon, stars and planets, day/night, weather-free clouds, fog, the
// curved planet seen from high up, and the reflection map for shiny glass.
//
// Time of day is a `phase` from 0 to 1: 0 = sunrise, 0.3 = noon, 0.6 = sunset,
// 0.8 = midnight. Days take 60% of the cycle so there's more light for building.

const LAT = (35 * Math.PI) / 180;
const POLE = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT));
const NOON = new THREE.Vector3(0, Math.cos(LAT), Math.sin(LAT));
const DAY_FRACTION = 0.6;
const SKY_R = 1000;

const PALETTES = {
  earth: {
    dayZenith: 0x2f6fd0,
    dayHorizon: 0xb4daf5,
    nightZenith: 0x040a1e,
    nightHorizon: 0x182a58,
    sunsetHorizon: 0xff9a5c,
    sunsetZenith: 0x3c4a8c,
    sunsetGlow: 0xffa766,
    ground: 0x56664c,
    space: [14000, 90000],
    fog: 3.6e-5,
    sunColorLow: 0xffa262,
    sunColorHigh: 0xfff4e2,
    sunIntensity: 3.2,
    stars: 1,
    clouds: true,
  },
  mars: {
    dayZenith: 0x8f6a52,
    dayHorizon: 0xd9b48d,
    nightZenith: 0x020102,
    nightHorizon: 0x110b09,
    sunsetHorizon: 0x8d8c96,
    sunsetZenith: 0x3d3434,
    sunsetGlow: 0x7ea8e0,
    ground: 0x8c4c2c,
    space: [6000, 45000],
    fog: 5e-5,
    sunColorLow: 0xd9c2a6,
    sunColorHigh: 0xfff0dc,
    sunIntensity: 2.6,
    stars: 1,
    clouds: false,
  },
  moon: {
    dayZenith: 0x000000,
    dayHorizon: 0x04050a,
    nightZenith: 0x000000,
    nightHorizon: 0x020206,
    sunsetHorizon: 0x04050a,
    sunsetZenith: 0x000000,
    sunsetGlow: 0x000000,
    ground: 0x55565a,
    space: [0, 1],
    fog: 0,
    sunColorLow: 0xfffaf0,
    sunColorHigh: 0xffffff,
    sunIntensity: 3.6,
    stars: 0.85,
    clouds: false,
  },
};

const c = (hex) => new THREE.Color(hex);

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFragment = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uGlow;
uniform float uSunset;
uniform float uHorizonY;
uniform vec3 uSunCol;
uniform float uSunVisible;
uniform float uSpace;
uniform float uAir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = (d.y - uHorizonY) / (1.0 - uHorizonY);
  vec3 col;
  if (h >= 0.0) {
    col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  } else {
    col = mix(uHorizon, uGround, clamp(-h * 5.0, 0.0, 1.0));
  }
  float s = dot(d, uSunDir);
  float around = pow(max(s, 0.0), 3.0);
  float nearHorizon = 1.0 - clamp(abs(h) * 2.5, 0.0, 1.0);
  col = mix(col, uGlow, clamp(uSunset * around * (0.3 + 0.7 * nearHorizon), 0.0, 1.0));
  col = mix(col, vec3(0.0), uSpace * smoothstep(-0.05, 0.02, h));
  // The Sun: a bright disc, plus a halo only where there's air to scatter light.
  float disc = smoothstep(0.99975, 0.99988, s);
  float halo = pow(max(s, 0.0), 900.0) * 1.5 + pow(max(s, 0.0), 60.0) * 0.25 * uAir;
  col += uSunCol * (disc * 30.0 + halo) * uSunVisible;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const starVertex = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPixelRatio;
uniform float uTime;
varying vec3 vColor;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
  vColor = aColor;
  // Very slow, gentle twinkle (no flashing).
  vTw = 0.82 + 0.18 * sin(uTime * 0.6 + position.x * 0.13 + position.z * 0.07);
}`;

const starFragment = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor * a * uOpacity * vTw, 1.0);
  #include <colorspace_fragment>
}`;

const bodyVertex = /* glsl */ `
varying vec2 vUv;
varying mat3 vRot;
void main() {
  vUv = uv * 2.0 - 1.0;
  vRot = mat3(normalize(modelMatrix[0].xyz), normalize(modelMatrix[1].xyz), normalize(modelMatrix[2].xyz));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const bodyFragment = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uSunDir;
uniform float uOpacity;
uniform float uSelfLit;
uniform float uRing;
varying vec2 vUv;
varying mat3 vRot;
void main() {
  float r2 = dot(vUv, vUv);
  // Saturn's rings, drawn as a flat ellipse around the disc.
  float ringA = 0.0;
  if (uRing > 0.5) {
    vec2 q = vec2(vUv.x, vUv.y / 0.35) * 1.0;
    float rr = length(q);
    ringA = smoothstep(1.25, 1.3, rr) * (1.0 - smoothstep(1.85, 1.9, rr)) * (0.6 + 0.4 * sin(rr * 40.0));
    if (r2 < 1.0 && vUv.y < 0.0) ringA = 0.0;
  }
  vec2 p = vUv * (uRing > 0.5 ? 1.95 : 1.0);
  float pr = dot(p, p);
  if (pr > 1.0 && ringA <= 0.0) discard;
  vec4 col = vec4(0.0);
  if (pr <= 1.0) {
    vec3 n = vec3(p, sqrt(1.0 - pr));
    vec2 uv = vec2(0.5 + atan(n.x, n.z) / 6.2831853, 0.5 + asin(clamp(n.y, -1.0, 1.0)) / 3.14159265);
    vec3 tex = texture2D(uMap, uv).rgb;
    float light = max(dot(normalize(vRot * n), uSunDir), 0.0);
    float lit = mix(light * 1.15 + 0.03, 1.0, uSelfLit);
    float edge = smoothstep(1.0, 0.96, pr);
    col = vec4(tex * lit, edge);
  }
  if (ringA > 0.0) col = mix(vec4(0.86, 0.78, 0.62, ringA), col, col.a);
  gl_FragColor = vec4(col.rgb, col.a * uOpacity);
  #include <colorspace_fragment>
}`;

const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv);
  float a = pow(max(1.0 - d, 0.0), 2.2);
  gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

const cloudVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
varying float vShade;
void main() {
  vUv = uv;
  vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float scale = length(instanceMatrix[0].xyz);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = center + (right * position.x + up * position.y * 0.6) * scale;
  vShade = position.y + 0.5;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const cloudFragment = /* glsl */ `
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uLit;
uniform vec3 uShadow;
uniform float uOpacity;
varying vec2 vUv;
varying float vShade;
void main() {
  float a = texture2D(uMap, vUv).a * uOpacity;
  if (a < 0.01) discard;
  vec3 col = mix(uShadow, uLit, smoothstep(0.1, 0.9, vShade));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const atmoVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const atmoFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float f = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
  gl_FragColor = vec4(uColor * f * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

function puffTexture() {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  const rng = mulberry32(3);
  for (let i = 0; i < 14; i++) {
    const x = s * (0.22 + rng() * 0.56);
    const y = s * (0.38 + rng() * 0.3);
    const r = s * (0.13 + rng() * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function dirFromAzEl(az, el) {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

export class Environment {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
    this.phase = 0.13;
    this.phaseTarget = null;
    this.world = 'earth';
    this.palette = PALETTES.earth;
    this.radius = WORLDS.earth.radius;
    this.sunDir = new THREE.Vector3();
    this.night = 0;
    this.altitude = 0;
    this.focus = new THREE.Vector3();
    this.shadowRadius = 300;
    this.theta = 0;
    this._envAge = 99;
    this._envKey = '';
    this._tmp = new THREE.Vector3();

    this._buildSkyPass();
    this._buildPlanetPass();
    this._buildLights();
    this._buildClouds();
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.setWorld('earth');
  }

  // ---------- construction ----------

  _buildSkyPass() {
    this.skyScene = new THREE.Scene();
    this.skyCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    this.skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uSunset: { value: 0 },
      uHorizonY: { value: 0 },
      uSunCol: { value: new THREE.Color(1, 1, 1) },
      uSunVisible: { value: 1 },
      uSpace: { value: 0 },
      uAir: { value: 1 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this.skyScene.add(dome);
    this.dome = dome;

    this.skyRotator = new THREE.Group();
    this.skyScene.add(this.skyRotator);
    this.skyFixed = new THREE.Group();
    this.skyScene.add(this.skyFixed);

    // Stars
    const n = 2200;
    const rng = mulberry32(12345);
    const pos = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const tints = [c(0xffffff), c(0xcfe0ff), c(0xfff1d6), c(0xffd2b0)];
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const t = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(t) * SKY_R * 0.9, u * SKY_R * 0.9, r * Math.sin(t) * SKY_R * 0.9], i * 3);
      const m = Math.pow(rng(), 6);
      size[i] = 1.2 + m * 4.2;
      const tint = tints[Math.floor(rng() * tints.length)];
      const b = 0.35 + m * 0.65 + rng() * 0.2;
      col.set([tint.r * b, tint.g * b, tint.b * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.starUniforms = {
      uOpacity: { value: 0 },
      uPixelRatio: { value: 1 },
      uTime: this.uniforms.uTime,
    };
    this.stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: this.starUniforms,
        vertexShader: starVertex,
        fragmentShader: starFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.stars.frustumCulled = false;
    this.skyRotator.add(this.stars);

    this.bodies = [];

    this.engine.prePasses.push({
      scene: this.skyScene,
      camera: this.skyCamera,
      sync: (cam) => this._syncCamera(this.skyCamera, cam),
    });
  }

  _buildPlanetPass() {
    this.planetScene = new THREE.Scene();
    this.planetCamera = new THREE.PerspectiveCamera(50, 1, 1, 1e7);
    this.planetMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 96), this.planetMat);
    this.planet.rotation.z = Math.PI / 2; // texture centre (+x) faces up, under the city
    this.planetScene.add(this.planet);
    this.atmoUniforms = { uColor: { value: c(0x6aa8ff) }, uOpacity: { value: 0 } };
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 48),
      new THREE.ShaderMaterial({
        uniforms: this.atmoUniforms,
        vertexShader: atmoVertex,
        fragmentShader: atmoFragment,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.planetScene.add(this.atmo);
    this.planetSun = new THREE.DirectionalLight(0xffffff, 3);
    this.planetScene.add(this.planetSun);
    this.planetScene.add(this.planetSun.target);
    this.planetAmbient = new THREE.HemisphereLight(0x9ab8ff, 0x202020, 0.4);
    this.planetScene.add(this.planetAmbient);

    this.engine.prePasses.push({
      scene: this.planetScene,
      camera: this.planetCamera,
      sync: (cam) => this._syncPlanet(cam),
    });
  }

  _buildLights() {
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.engine.quality.shadow, this.engine.quality.shadow);
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 2;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4a4a40, 0.35);
    this.scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xb4daf5, 3e-5);
    this.scene.fog = this.fog;
    this.planetScene.fog = this.fog;
  }

  _buildClouds() {
    const count = 110;
    const rng = mulberry32(77);
    this.cloudUniforms = {
      uMap: { value: puffTexture() },
      uLit: { value: c(0xffffff) },
      uShadow: { value: c(0xc4cfdc) },
      uOpacity: { value: 0.9 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: cloudVertex,
      fragmentShader: cloudFragment,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    Object.assign(mat.uniforms, this.cloudUniforms);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
    this.cloudData = [];
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const r = 900 + Math.sqrt(rng()) * 16000;
      const a = rng() * Math.PI * 2;
      const d = {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        y: 1700 + rng() * 900,
        s: 500 + rng() * 900,
      };
      this.cloudData.push(d);
      m.makeScale(d.s, d.s, d.s).setPosition(d.x, d.y, d.z);
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.clouds = mesh;
    this.scene.add(mesh);
  }

  setWorld(world) {
    this.world = world;
    this.palette = PALETTES[world];
    this.radius = WORLDS[world].radius;
    this.planet.scale.setScalar(this.radius);
    this.atmo.scale.setScalar(this.radius * (world === 'earth' ? 1.018 : 1.01));
    const land = world === 'earth' ? (this.place === 'dubai' ? 'sand' : 'green') : undefined;
    this.planetMat.map = planetTexture(world, 1024, land ? { land } : {});
    this.planetMat.needsUpdate = true;
    this.atmoUniforms.uColor.value.set(world === 'mars' ? 0xd99a6a : 0x6aa8ff);
    this.clouds.visible = this.palette.clouds;
    this.starUniforms.uOpacity.value = 0;
    this._buildBodies();
    this._envAge = 99;
  }

  setPlace(placeId, world) {
    this.place = placeId;
    this.setWorld(world);
  }

  _buildBodies() {
    for (const b of this.bodies) {
      b.mesh.parent.remove(b.mesh);
      if (b.glow) b.glow.parent.remove(b.glow);
    }
    this.bodies = [];
    const objects = SKY_OBJECTS[this.world] || [];
    for (const o of objects) {
      const midnight = dirFromAzEl(o.dir[0], o.dir[1]);
      // Store the direction at phase angle 0, so rotating by theta gives the sky now.
      const base = o.fixed ? midnight : midnight.clone().applyAxisAngle(POLE, -Math.PI);
      const sizeAngle = o.size;
      const s = sizeAngle * SKY_R * 2;
      const uniforms = {
        uMap: { value: planetTexture(o.id, 256) },
        uSunDir: this.skyUniforms.uSunDir,
        uOpacity: { value: 1 },
        uSelfLit: { value: o.id === 'sun' ? 1 : 0 },
        uRing: { value: o.id === 'saturn' ? 1 : 0 },
      };
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: bodyVertex,
          fragmentShader: bodyFragment,
          transparent: true,
          depthWrite: false,
        }),
      );
      const ringScale = o.id === 'saturn' ? 1.95 : 1;
      mesh.scale.setScalar(s * ringScale);
      mesh.position.copy(base).multiplyScalar(SKY_R * 0.8);
      mesh.lookAt(0, 0, 0);
      mesh.userData.bodyId = o.id;
      (o.fixed ? this.skyFixed : this.skyRotator).add(mesh);
      // Soft glow so small planets are easy to spot (and to tap).
      let glow = null;
      const glowUniforms = { uColor: { value: c(o.color || 0xdfe8ff) }, uOpacity: { value: 0.5 } };
      glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          uniforms: glowUniforms,
          vertexShader: bodyVertex,
          fragmentShader: glowFragment,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glow.scale.setScalar(Math.max(s * 5, 14));
      glow.position.copy(base).multiplyScalar(SKY_R * 0.81);
      glow.lookAt(0, 0, 0);
      (o.fixed ? this.skyFixed : this.skyRotator).add(glow);
      this.bodies.push({ id: o.id, def: o, mesh, glow, uniforms, glowUniforms, visible: 0 });
    }
  }

  // ---------- time of day ----------

  get isNight() {
    return this.night > 0.5;
  }

  // Sun/moon button: glide to night (or to morning) over a few seconds.
  toggleDayNight() {
    const target = this.isNight ? 0.08 : 0.78;
    let dist = target - this.phase;
    if (dist <= 0) dist += 1;
    this.phaseTarget = { to: target, speed: dist / 4 };
    return !this.isNight;
  }

  setPhase(p) {
    this.phase = ((p % 1) + 1) % 1;
    this.phaseTarget = null;
  }

  _thetaFor(phase) {
    if (phase < DAY_FRACTION) return -Math.PI / 2 + (phase / DAY_FRACTION) * Math.PI;
    return Math.PI / 2 + ((phase - DAY_FRACTION) / (1 - DAY_FRACTION)) * Math.PI;
  }

  // ---------- per frame ----------

  update(dt, camera) {
    const u = this.uniforms;
    u.uTime.value += dt;

    if (this.phaseTarget) {
      const step = this.phaseTarget.speed * dt;
      let dist = this.phaseTarget.to - this.phase;
      if (dist < 0) dist += 1;
      if (dist <= step || dist > 0.999) {
        this.phase = this.phaseTarget.to;
        this.phaseTarget = null;
      } else this.phase = (this.phase + step) % 1;
    } else {
      this.phase = (this.phase + dt / DAY_LENGTH) % 1;
    }

    const theta = this._thetaFor(this.phase);
    this.theta = theta;
    this.sunDir.copy(NOON).applyAxisAngle(POLE, theta);
    const sunY = this.sunDir.y;
    this.night = 1 - smoothstep(-0.1, 0.12, sunY);
    u.uNight.value = this.night;
    this.skyRotator.quaternion.setFromAxisAngle(POLE, theta);

    this.altitude = Math.max(0, camera.position.y);
    const P = this.palette;
    const day = smoothstep(-0.16, 0.22, sunY);
    const sunset = clamp(1 - Math.abs(sunY - 0.02) / 0.28, 0, 1) * (sunY > -0.25 ? 1 : 0);
    const space = smoothstep(P.space[0], P.space[1], this.altitude);
    const su = this.skyUniforms;
    su.uSunDir.value.copy(this.sunDir);
    su.uZenith.value.copy(c(P.nightZenith)).lerp(c(P.dayZenith), day).lerp(c(P.sunsetZenith), sunset * 0.45);
    su.uHorizon.value.copy(c(P.nightHorizon)).lerp(c(P.dayHorizon), day).lerp(c(P.sunsetHorizon), sunset * 0.55);
    su.uGround.value.copy(c(P.ground)).multiplyScalar(0.15 + 0.85 * day);
    su.uGlow.value.copy(c(P.sunsetGlow));
    su.uSunset.value = sunset;
    su.uSpace.value = space;
    su.uAir.value = WORLDS[this.world].air;
    const dip = Math.acos(this.radius / (this.radius + this.altitude));
    su.uHorizonY.value = -Math.sin(dip);
    su.uSunVisible.value = smoothstep(-0.1, 0.02, sunY + Math.sin(dip));
    const sunCol = c(P.sunColorLow).lerp(c(P.sunColorHigh), smoothstep(0.0, 0.4, sunY));
    su.uSunCol.value.copy(sunCol);

    // Stars: at night, high up in space, and always on the airless Moon.
    this.starUniforms.uOpacity.value = clamp(Math.max(this.night, space, P.stars < 1 ? P.stars : 0), 0, 1) * P.stars;
    this.starUniforms.uPixelRatio.value = this.engine.renderer.getPixelRatio();

    for (const b of this.bodies) {
      const isPlanetDot = !!b.def.color;
      const wDir = this._tmp.copy(b.mesh.position).normalize();
      if (!b.def.fixed) wDir.applyQuaternion(this.skyRotator.quaternion);
      const above = smoothstep(-0.02, 0.04, wDir.y - su.uHorizonY.value);
      const dark = this.world === 'moon' ? 1 : Math.max(this.night, space);
      const vis = (isPlanetDot ? dark : Math.max(dark, 0.55)) * above;
      b.visible = vis;
      b.uniforms.uOpacity.value = vis;
      b.glowUniforms.uOpacity.value = vis * (isPlanetDot ? 0.55 : 0.18);
    }

    // Sunlight by day, soft blue moonlight by night.
    const sunUp = smoothstep(-0.04, 0.1, sunY);
    const lightDir = sunUp > 0.01 ? this.sunDir : this._tmp.set(-0.35, 0.8, 0.45).normalize();
    this.sun.color.copy(sunUp > 0.01 ? sunCol : c(0xa9bfff));
    this.sun.intensity = sunUp > 0.01 ? P.sunIntensity * sunUp : 0.9;
    const R = this.shadowRadius;
    this.sun.position.copy(this.focus).addScaledVector(lightDir, R * 3);
    this.sun.target.position.copy(this.focus);
    const sc = this.sun.shadow.camera;
    if (sc.right !== R) {
      sc.left = -R;
      sc.right = R;
      sc.top = R;
      sc.bottom = -R;
      sc.near = R * 0.5;
      sc.far = R * 6;
      sc.updateProjectionMatrix();
      this.sun.shadow.normalBias = R / 400;
    }
    this.sun.castShadow = R < 4000;

    this.hemi.color.copy(su.uZenith.value).lerp(c(0xffffff), 0.6);
    this.hemi.groundColor.copy(c(P.ground)).lerp(c(0x808080), 0.5).multiplyScalar(0.7);
    this.hemi.intensity = lerp(0.42, 0.9, day) * (this.world === 'moon' ? 0.45 : 1);

    // Fog thins out with height (most air is in the lowest ~10 km).
    this.fog.color.copy(su.uHorizon.value);
    const scaleHeight = this.world === 'mars' ? 11000 : 8000;
    this.fog.density = P.fog * Math.exp(-this.altitude / scaleHeight);

    // Clouds
    if (this.clouds.visible) {
      const m = new THREE.Matrix4();
      for (let i = 0; i < this.cloudData.length; i++) {
        const d = this.cloudData[i];
        d.x += dt * 4;
        if (d.x > 17000) d.x -= 34000;
        m.makeScale(d.s, d.s, d.s).setPosition(d.x, d.y, d.z);
        this.clouds.setMatrixAt(i, m);
      }
      this.clouds.instanceMatrix.needsUpdate = true;
      const cu = this.cloudUniforms;
      cu.uLit.value.copy(c(0x26304a)).lerp(c(0xffffff), day).lerp(c(0xffc4a0), sunset * 0.5);
      cu.uShadow.value.copy(cu.uLit.value).multiplyScalar(0.72);
      this.clouds.material.uniforms.uLit.value.copy(cu.uLit.value);
      this.clouds.material.uniforms.uShadow.value.copy(cu.uShadow.value);
    }

    // Planet pass lighting and the glowing rim of air seen from space.
    this.planetSun.position.copy(this.sunDir).multiplyScalar(1000);
    this.planetSun.color.copy(sunCol);
    this.planetSun.intensity = P.sunIntensity * 0.9;
    this.planetAmbient.intensity = lerp(0.05, 0.5, day);
    this.atmoUniforms.uOpacity.value =
      this.world === 'moon' ? 0 : smoothstep(15000, 80000, this.altitude) * (this.world === 'mars' ? 0.5 : 1);

    // Refresh the reflection map now and then (it's what makes glass look shiny).
    this._envAge += dt;
    const key = `${Math.round(this.phase * 300)}:${Math.round(space * 10)}:${this.world}`;
    if (this._envAge > 2 && key !== this._envKey) {
      this._envAge = 0;
      this._envKey = key;
      this._updateEnvMap();
    }
  }

  _updateEnvMap() {
    const prevVisible = this.stars.visible;
    this.stars.visible = false;
    for (const b of this.bodies) b.mesh.visible = b.glow.visible = false;
    const rt = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000, { size: 64 });
    this.stars.visible = prevVisible;
    for (const b of this.bodies) b.mesh.visible = b.glow.visible = true;
    if (this._envRT) this._envRT.dispose();
    this._envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = this.world === 'moon' ? 0.45 : 1.0;
  }

  _syncCamera(target, cam) {
    target.quaternion.copy(cam.quaternion);
    if (target.fov !== cam.fov || target.aspect !== cam.aspect) {
      target.fov = cam.fov;
      target.aspect = cam.aspect;
      target.updateProjectionMatrix();
    }
  }

  _syncPlanet(cam) {
    const pc = this.planetCamera;
    pc.quaternion.copy(cam.quaternion);
    const alt = Math.max(1, cam.position.y);
    const R = this.radius;
    const horizon = Math.sqrt(2 * R * alt + alt * alt);
    pc.near = Math.max(0.5, alt * 0.3);
    pc.far = Math.max(horizon * 1.6, 60000) + Math.hypot(cam.position.x, cam.position.z);
    pc.fov = cam.fov;
    pc.aspect = cam.aspect;
    pc.updateProjectionMatrix();
    // Camera-relative placement keeps the numbers small near the camera.
    this.planet.position.set(-cam.position.x, -R - 2 - cam.position.y, -cam.position.z);
    this.atmo.position.copy(this.planet.position);
    this.planetSun.target.position.set(0, 0, 0);
  }

  // Which sky object (planet, Moon, Earth) is near this screen point, if any.
  pickBody(x, y, width, height) {
    let best = null;
    let bestD = Infinity;
    const v = new THREE.Vector3();
    for (const b of this.bodies) {
      if (b.visible < 0.35) continue;
      b.mesh.getWorldPosition(v);
      v.project(this.skyCamera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * width;
      const sy = (-v.y * 0.5 + 0.5) * height;
      const d = Math.hypot(sx - x, sy - y);
      const radiusPx = (b.mesh.scale.x / (2 * SKY_R * 0.8)) * (height / (2 * Math.tan((this.skyCamera.fov * Math.PI) / 360)));
      const hit = Math.max(34, radiusPx * 1.2);
      if (d < hit && d < bestD) {
        best = b.id;
        bestD = d;
      }
    }
    return best && BODIES[best] ? best : null;
  }
}
