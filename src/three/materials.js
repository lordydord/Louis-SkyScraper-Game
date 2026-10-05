import * as THREE from 'three';
import { STYLES } from '../data/pieces.js';

// The building material: a MeshStandardMaterial (so it gets real lighting, shadows,
// sky reflections and fog) with extra shader code for:
//   - windows drawn procedurally from facade coordinates (uv = metres along the
//     wall, metres up), so any height from 4 m to 400 km looks right,
//   - windows that light up one by one as night falls,
//   - Louie's paint colours and light shows,
//   - the tower bending gently in the wind (sway), and a new section dropping in,
//   - a glow on the section he has selected.
//
// Geometry carries per-vertex attributes: aKind (what the surface is), aStyle
// (index into the style table) and aSection (which part of the tower it belongs to).

export const KIND = {
  FACADE: 0,
  WALL: 1,
  ROOF: 2,
  GLASS: 3,
  METAL: 4,
  GOLD: 5,
  BEACON: 6,
  PAINT: 7, // vertex colour
  GLOW: 8, // vertex colour, glowing
  WATER: 9,
};

export const STYLE_INDEX = { glass: 0, stone: 1, round: 2, twist: 3, burj: 4, filler: 5 };
const STYLE_LIST = ['glass', 'stone', 'round', 'twist', 'burj', 'filler'];
const FILLER_STYLE = { wall: 0xcfd4d8, glass: 0x5d7486, cell: [3, 4], win: [0.7, 0.62] };

export const LIGHT_PATTERN_INDEX = { off: 0, solid: 1, wave: 2, sparkle: 3, stripes: 4, breathe: 5, heart: 6, star: 7 };

// Style table shared by every building.
export const styleUniforms = (() => {
  const cell = [];
  const wall = [];
  const glass = [];
  for (const name of STYLE_LIST) {
    const s = STYLES[name] || FILLER_STYLE;
    cell.push(new THREE.Vector4(s.cell[0], s.cell[1], s.win[0], s.win[1]));
    wall.push(new THREE.Color(s.wall));
    glass.push(new THREE.Color(s.glass));
  }
  return {
    uStyleCell: { value: cell },
    uStyleWall: { value: wall },
    uStyleGlass: { value: glass },
  };
})();

export function makeTowerUniforms(seed = 1) {
  return {
    uSway: { value: new THREE.Vector2() },
    uBaseY: { value: 0 },
    uHeight: { value: 100 },
    uDropIdx: { value: -10 },
    uDropY: { value: 0 },
    uSelected: { value: -10 },
    uSelPulse: { value: 0 },
    uWallPaint: { value: new THREE.Color() },
    uWallPaintOn: { value: 0 },
    uGlassPaint: { value: new THREE.Color() },
    uGlassPaintOn: { value: 0 },
    uLightCol: { value: new THREE.Color(1, 1, 1) },
    uLightPattern: { value: 0 },
    uRainbow: { value: 0 },
    uSeed: { value: seed % 997 },
    uLitFraction: { value: 0.38 },
  };
}

const vertexDecl = /* glsl */ `
attribute float aKind;
attribute float aStyle;
attribute float aSection;
uniform vec2 uSway;
uniform float uBaseY;
uniform float uHeight;
uniform float uDropIdx;
uniform float uDropY;
varying float vKind;
varying float vStyle;
varying float vSection;
varying vec2 vFacade;
`;

const vertexBegin = /* glsl */ `
vKind = aKind;
vStyle = aStyle;
vSection = aSection;
vFacade = uv;
if (abs(aSection - uDropIdx) < 0.5) transformed.y += uDropY;
`;

// Bend the tower in world space so it works for any mesh transform (the crane
// turns, twins sit side by side). The base stays put; the top moves the most.
const projectVertex = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 swWorld = modelMatrix * mvPosition;
float swT = clamp((swWorld.y - uBaseY) / max(uHeight, 1.0), 0.0, 1.3);
swWorld.xz += uSway * swT * swT;
mvPosition = viewMatrix * swWorld;
gl_Position = projectionMatrix * mvPosition;
`;

const fragmentDecl = /* glsl */ `
uniform float uTime;
uniform float uNight;
uniform vec4 uStyleCell[6];
uniform vec3 uStyleWall[6];
uniform vec3 uStyleGlass[6];
uniform vec3 uWallPaint;
uniform float uWallPaintOn;
uniform vec3 uGlassPaint;
uniform float uGlassPaintOn;
uniform vec3 uLightCol;
uniform float uLightPattern;
uniform float uRainbow;
uniform float uSeed;
uniform float uSelected;
uniform float uSelPulse;
uniform float uLitFraction;
varying float vKind;
varying float vStyle;
varying float vSection;
varying vec2 vFacade;

float sc_hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 sc_hue(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}
// Pixel pictures drawn with lit windows, tiled over the facade.
float sc_picture(float kind, vec2 cell) {
  vec2 q = mod(cell, 12.0) - vec2(5.5, 5.5);
  if (kind < 6.5) {
    vec2 p = q / 4.6;
    p.y = -p.y + 0.15;
    float a = p.x * p.x + p.y * p.y - 1.0;
    return step(a * a * a - p.x * p.x * p.y * p.y * p.y, 0.0);
  }
  float ang = atan(q.y, q.x);
  float r = length(q);
  float spike = 0.5 + 0.5 * cos(5.0 * (ang + 1.5708));
  return step(r, 2.2 + 2.9 * pow(spike, 2.2));
}
`;

const fragmentColor = /* glsl */ `
int scSt = int(vStyle + 0.5);
vec4 scCell = uStyleCell[scSt];
vec3 scWall = mix(uStyleWall[scSt], uWallPaint, uWallPaintOn);
vec3 scGlass = mix(uStyleGlass[scSt], uGlassPaint, uGlassPaintOn);
float scRough = 0.8;
float scMetal = 0.0;
vec3 scEmis = vec3(0.0);
float scWin = 0.0;
vec2 scIdx = vec2(0.0);
float scK = vKind;
if (scK < 0.5) {
  vec2 cu = vFacade / scCell.xy;
  vec2 f = fract(cu);
  scIdx = floor(cu);
  vec2 fw = max(fwidth(cu), vec2(1e-4));
  vec2 dd = abs(f - 0.5) - scCell.zw * 0.5;
  float m = (1.0 - smoothstep(-fw.x, fw.x, dd.x)) * (1.0 - smoothstep(-fw.y, fw.y, dd.y));
  float farAway = clamp(max(fw.x, fw.y) * 1.6 - 0.35, 0.0, 1.0);
  scWin = mix(m, scCell.z * scCell.w, farAway);
  diffuseColor.rgb = mix(scWall, scGlass, scWin);
  scRough = mix(0.62, 0.07, scWin);
  scMetal = mix(0.05, 0.8, scWin);
  float h1 = sc_hash(scIdx + uSeed);
  float on = step(h1, uNight * uLitFraction);
  float cool = step(0.88, sc_hash(scIdx.yx * 1.7 + uSeed));
  vec3 warm = mix(vec3(1.0, 0.68, 0.34), vec3(0.75, 0.85, 1.0), cool);
  float avgOn = uNight * uLitFraction;
  scEmis += warm * mix(on, avgOn, farAway) * scWin * 1.15;
} else if (scK < 1.5) {
  diffuseColor.rgb = scWall;
  scRough = 0.72;
} else if (scK < 2.5) {
  diffuseColor.rgb = vec3(0.30, 0.31, 0.33);
  scRough = 0.9;
} else if (scK < 3.5) {
  diffuseColor.rgb = scGlass;
  scRough = 0.05;
  scMetal = 0.85;
  scWin = 1.0;
} else if (scK < 4.5) {
  diffuseColor.rgb = vec3(0.86, 0.88, 0.9);
  scRough = 0.24;
  scMetal = 1.0;
} else if (scK < 5.5) {
  diffuseColor.rgb = vec3(1.0, 0.74, 0.28);
  scRough = 0.25;
  scMetal = 1.0;
} else if (scK < 6.5) {
  diffuseColor.rgb = vec3(0.5, 0.04, 0.04);
  float b = 0.5 + 0.5 * sin(uTime * 2.4 + uSeed);
  scEmis += vec3(1.0, 0.08, 0.04) * (0.25 + 2.8 * b * b) * (0.35 + 0.65 * uNight);
} else if (scK < 7.5) {
  diffuseColor.rgb = vColor.rgb;
  scRough = 0.7;
} else if (scK < 8.5) {
  diffuseColor.rgb = vColor.rgb * 0.5;
  scEmis += vColor.rgb * mix(0.35, 1.7, uNight);
} else {
  diffuseColor.rgb = vec3(0.08, 0.45, 0.7);
  scRough = 0.04;
  scMetal = 0.2;
  scEmis += vec3(0.0, 0.25, 0.4) * uNight;
}

// Light shows (smooth and slow: nothing flashes).
bool scShow = uLightPattern > 0.5 && (scK < 1.5 || (scK > 2.5 && scK < 3.5));
if (scShow) {
  float p = uLightPattern;
  float vy = vFacade.y;
  vec3 lc = uRainbow > 0.5 ? sc_hue(fract(vy / 180.0 - uTime * 0.045)) : uLightCol;
  float amt = 1.0;
  if (p < 1.5) {
    amt = 1.0;
  } else if (p < 2.5) {
    amt = 0.15 + 0.85 * smoothstep(0.2, 1.0, 0.5 + 0.5 * sin(vy / 22.0 - uTime * 1.4));
  } else if (p < 3.5) {
    float hs = sc_hash(scIdx * 1.31 + 7.0);
    amt = 0.08 + 0.92 * smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(uTime * 0.8 + hs * 40.0));
  } else if (p < 4.5) {
    amt = 0.12 + 0.88 * step(0.5, fract(scIdx.x / 2.0));
    if (uRainbow > 0.5) lc = sc_hue(fract(scIdx.x / 7.0 + uTime * 0.02));
  } else if (p < 5.5) {
    amt = 0.3 + 0.7 * (0.5 + 0.5 * sin(uTime * 0.75));
  } else {
    vec2 cellPos = scIdx + vec2(0.0, -floor(uTime * 0.6));
    amt = 0.06 + 0.94 * sc_picture(p, cellPos);
  }
  float nightBoost = mix(0.22, 1.0, uNight);
  scEmis += lc * amt * nightBoost * mix(0.45, 1.0, scWin) * 1.5;
  diffuseColor.rgb = mix(diffuseColor.rgb, lc, 0.25 * amt * nightBoost);
}

if (abs(vSection - uSelected) < 0.5) {
  scEmis += vec3(0.25, 0.7, 1.0) * uSelPulse;
}
`;

function patchVertex(shader, towerUniforms) {
  Object.assign(shader.uniforms, towerUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + vertexDecl)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBegin)
    .replace('#include <project_vertex>', projectVertex);
}

// The main building material. `globals` = { uTime, uNight } shared by everything.
export function createBuildingMaterial(globals, towerUniforms) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0 });
  mat.onBeforeCompile = (shader) => {
    patchVertex(shader, towerUniforms);
    Object.assign(shader.uniforms, styleUniforms, { uTime: globals.uTime, uNight: globals.uNight });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragmentDecl)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragmentColor)
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nroughnessFactor = scRough;\nmetalnessFactor = scMetal;',
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += scEmis;');
  };
  mat.customProgramCacheKey = () => 'sky-city-building';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => patchVertex(shader, towerUniforms);
  depth.customProgramCacheKey = () => 'sky-city-building-depth';
  return { material: mat, depthMaterial: depth };
}

// A see-through glass material that sways with its tower (damper rooms).
export function createGlassMaterial(towerUniforms, color = 0x9cc8e8) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.05,
    metalness: 0.4,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    vertexColors: false,
  });
  mat.onBeforeCompile = (shader) => {
    patchVertex(shader, towerUniforms);
  };
  mat.customProgramCacheKey = () => 'sky-city-glass';
  return mat;
}

// A glowing line up the tower (with a star on top) that shows where it is when the
// tower is too thin to see, e.g. a 76 m wide tower reaching into space.
export function createGuideMaterial(towerUniforms) {
  return new THREE.ShaderMaterial({
    uniforms: { ...towerUniforms, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform vec2 uSway;
      uniform float uBaseY;
      uniform float uHeight;
      varying vec2 vUv;
      void main() {
        vec3 transformed = position;
        vUv = uv;
        ${projectVertex}
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = smoothstep(0.0, 0.6, edge) * uOpacity;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.35) * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Additive light beams (rooftop spotlights), only visible at night.
export function createBeamMaterial(globals, towerUniforms) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...towerUniforms,
      uTime: globals.uTime,
      uNight: globals.uNight,
    },
    vertexShader: /* glsl */ `
      attribute float aKind;
      attribute float aStyle;
      attribute float aSection;
      uniform vec2 uSway;
      uniform float uBaseY;
      uniform float uHeight;
      uniform float uDropIdx;
      uniform float uDropY;
      varying float vAlong;
      varying vec3 vColor;
      attribute vec3 color;
      void main() {
        vec3 transformed = position;
        vAlong = uv.y;
        vColor = color;
        ${projectVertex}
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vColor;
      void main() {
        float a = pow(1.0 - vAlong, 2.2) * 0.16 * uNight;
        gl_FragColor = vec4(vColor * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  return mat;
}
