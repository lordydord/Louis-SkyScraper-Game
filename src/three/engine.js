import * as THREE from 'three';

// Renderer, main loop and automatic quality for the iPad mini.
//
// Rendering happens in layers, each with its own camera and depth range, so that
// towers from 40 m to 400 km tall all render cleanly:
//   1. the sky (dome, stars, Sun, Moon, planets) at "infinity",
//   2. the planet's curved surface (seen when the camera is very high),
//   3. the world (city, towers) on top.
// Layers 1 and 2 are "pre-passes" registered by the Environment.

const QUALITY = [
  { name: 'low', dpr: 1, shadow: 1024 },
  { name: 'medium', dpr: 1.5, shadow: 2048 },
  { name: 'high', dpr: 2, shadow: 2048 },
];

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 1e6);
    // { scene, camera, sync(mainCamera) } drawn before the world, depth cleared after each.
    this.prePasses = [];

    const params = new URLSearchParams(location.search);
    const forced = QUALITY.findIndex((q) => q.name === params.get('quality'));
    this.qualityIndex = forced >= 0 ? forced : Math.min(QUALITY.length - 1, window.devicePixelRatio > 1 ? 1 : 2);
    this.adaptive = forced < 0;
    this._fpsSamples = [];
    this._slowTime = 0;

    this.time = 0;
    this.frameCallbacks = [];
    this.paused = false;
    this.width = 1;
    this.height = 1;

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', () => setTimeout(this.resize, 200));
    this.resize();
  }

  get quality() {
    return QUALITY[this.qualityIndex];
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.dpr));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.onResize) this.onResize(w, h);
  }

  onFrame(cb) {
    this.frameCallbacks.push(cb);
    return () => {
      const i = this.frameCallbacks.indexOf(cb);
      if (i >= 0) this.frameCallbacks.splice(i, 1);
    };
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const rawDt = (now - last) / 1000;
      last = now;
      if (this.paused) return;
      const dt = Math.min(rawDt, 0.1);
      this.time += dt;
      for (const cb of this.frameCallbacks.slice()) cb(dt, this.time);
      this.render();
      this._watchFps(rawDt);
    };
    requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
      last = performance.now();
    });
  }

  render(camera = this.camera) {
    const r = this.renderer;
    r.clear(true, true, true);
    for (const pass of this.prePasses) {
      if (pass.enabled === false) continue;
      pass.sync(camera);
      r.render(pass.scene, pass.camera);
      r.clearDepth();
    }
    r.render(this.scene, camera);
  }

  // Drop to a cheaper quality level if the iPad is struggling.
  _watchFps(dt) {
    if (!this.adaptive || this.qualityIndex === 0) return;
    if (this.time < 4) return; // ignore start-up hitches
    if (dt > 1 / 40) this._slowTime += dt;
    else this._slowTime = Math.max(0, this._slowTime - dt * 0.5);
    if (this._slowTime > 3) {
      this._slowTime = 0;
      this.qualityIndex--;
      this.resize();
      if (this.onQualityChange) this.onQualityChange(this.quality);
    }
  }

  // Take a tone-mapped photo (for the portfolio) by drawing into a corner of the
  // real canvas inside the frame loop, just before the normal frame overwrites it.
  snapshot(fn) {
    return new Promise((resolve) => {
      const off = this.onFrame(() => {
        off();
        resolve(fn(this));
      });
    });
  }

  // Called from within snapshot(): renders `camera` into a width x height image.
  photo(camera, width, height) {
    const r = this.renderer;
    const gl = r.getContext();
    const dpr = r.getPixelRatio();
    const bufW = gl.drawingBufferWidth;
    const bufH = gl.drawingBufferHeight;
    const scale = Math.min(1, bufW / width, bufH / height);
    const w = Math.floor(width * scale);
    const h = Math.floor(height * scale);
    const prevAspect = camera.aspect;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    r.setViewport(0, 0, w / dpr, h / dpr);
    r.setScissor(0, 0, w / dpr, h / dpr);
    r.setScissorTest(true);
    this.render(camera);
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    return pixelsToCanvas(pixels, w, h);
  }

  // Render something into an offscreen image with a transparent background (for
  // inventory icons). No tone mapping is applied to render targets.
  renderToCanvas(scene, camera, width, height, { transparent = true } = {}) {
    const r = this.renderer;
    const target = new THREE.WebGLRenderTarget(width, height, {
      samples: 4,
      colorSpace: THREE.SRGBColorSpace,
      type: THREE.UnsignedByteType,
    });
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(target);
    r.setClearColor(0x000000, transparent ? 0 : 1);
    r.clear(true, true, true);
    r.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    r.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);
    target.dispose();
    return pixelsToCanvas(pixels, width, height);
  }
}

function pixelsToCanvas(pixels, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(width, height);
  // Flip vertically: WebGL rows start at the bottom.
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    img.data.set(pixels.subarray(src, src + width * 4), y * width * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
