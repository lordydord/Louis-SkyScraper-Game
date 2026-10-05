import * as THREE from 'three';
import { Store } from './game/store.js';
import { Engine } from './three/engine.js';
import { Environment } from './three/environment.js';
import { CameraRig } from './three/cameraRig.js';
import { CityView } from './three/cityView.js';
import { Effects } from './three/effects.js';
import { TapeMeasure } from './three/tape.js';
import { Ghosts } from './three/ghosts.js';
import { Thumbs } from './three/thumbs.js';
import { AudioEngine } from './audio/audio.js';
import { Voice } from './audio/voice.js';
import { PlanetView } from './ui/planetView.js';
import { setIcon } from './ui/dom.js';
import { TitleScreen, PickerScreen, PortfolioScreen } from './game/screens.js';
import { CityScreen } from './game/cityScreen.js';
import { INVENTORY } from './data/pieces.js';

// Owns everything and switches between screens: title -> places -> a city, and
// the portfolio.

export class App {
  constructor() {
    const canvas = document.getElementById('scene');
    this.store = new Store(safeStorage());
    this.engine = new Engine(canvas);
    this.env = new Environment(this.engine);
    this.rig = new CameraRig(this.engine.camera, canvas);
    this.city = new CityView(this.engine, this.env);
    this.effects = new Effects(this.engine.scene, this.engine);
    this.tape = new TapeMeasure(this.engine.scene);
    this.ghosts = new Ghosts(this.engine.scene);
    this.audio = new AudioEngine(this.store);
    this.voice = new Voice(this.store, this.audio);
    this.thumbs = new Thumbs(this.engine);
    this.uiRoot = document.getElementById('ui');
    this.planetView = new PlanetView(this.uiRoot, { voice: this.voice, audio: this.audio });
    this.screen = null;
    this.cityLoaded = null;

    this.rig.onTap = (x, y) => {
      if (this.planetView.open) return;
      this.audio.unlock();
      this.screen?.onTap?.(x, y);
    };
    this.rig.onDoubleTap = (x, y) => this.screen?.onTap?.(x, y);
    this.rig.onInteract = () => this.screen?.onInteract?.();
    this.engine.onFrame((dt) => this.frame(dt));
    // Touches unlock sound and speech (iPad Safari needs a tap first, and may pause
    // audio when the app goes to the background).
    const unlock = () => {
      this.audio.unlock();
      this.voice.unlock();
    };
    for (const ev of ['touchend', 'click', 'pointerup']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  }

  async start() {
    this.showTitle();
    // Compile the 3D shaders behind the splash screen so the first seconds are smooth.
    // (One update first, so lights and the reflection map exist when compiling.)
    const r = this.engine.renderer;
    this.rig.update(0.016);
    this.env.update(0.016, this.engine.camera);
    try {
      if (r.compileAsync) {
        await Promise.race([
          Promise.all([
            r.compileAsync(this.engine.scene, this.engine.camera),
            r.compileAsync(this.env.skyScene, this.env.skyCamera),
            r.compileAsync(this.env.planetScene, this.env.planetCamera),
          ]),
          new Promise((resolve) => setTimeout(resolve, 6000)),
        ]);
      }
    } catch (e) {
      console.warn('shader warm-up skipped', e);
    }
    this.engine.start();
    navigator.storage?.persist?.();
    setTimeout(() => document.getElementById('splash')?.classList.add('gone'), 400);
  }

  setScreen(s) {
    this.screen?.exit();
    this.planetView.close(true);
    this.screen = s;
    s.enter();
  }

  // A city to look at behind the menus: the last city Louie played, else Dubai.
  showBackdrop() {
    const store = this.store;
    let city = store.state.lastCity && store.city(store.state.lastCity);
    if (!city) city = { id: '__backdrop', place: 'dubai', seed: 99, towers: [] };
    if (this.cityLoaded !== city.id) {
      this.city.load(city, city.id === '__backdrop' ? [] : store.cityTowers(city.id));
      this.cityLoaded = city.id;
    }
    this.ghosts.enabled = false;
    this.ghosts.clear();
    this.tape.hide();
    {
      const H = Math.max(this.city.tallest(), 150);
      const tallest = [...this.city.towerViews.values()].sort((a, b) => b.height - a.height)[0];
      const lm = this.city.layout.landmarks[0];
      const target = tallest
        ? tallest.group.position.clone().setY(H * 0.45)
        : lm
          ? this.city.plotPosition(lm.block).setY(H * 0.45)
          : new THREE.Vector3(0, H * 0.45, 0);
      this.rig.maxDist = 1e6;
      if (this._backdropShown) this.rig.flyTo({ target, dist: H * 1.4 + 450, el: 0.16, duration: 1.5 });
      else {
        // The very first view: start right there, no flying in.
        this._backdropShown = true;
        this.rig.setGoal({ target, dist: H * 1.4 + 450, el: 0.16 });
        this.rig.snap();
      }
    }
    this.rig.autoSpin = 0.05;
  }

  // Render picture icons ahead of time, a few per frame, so menus open instantly.
  prewarm() {
    const ids = [...INVENTORY];
    const step = () => {
      if (!ids.length) return;
      this.thumbs.piece(ids.shift());
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  showTitle() {
    this.env.setPhase(0.12);
    this.setScreen(new TitleScreen(this));
  }

  showPicker() {
    this.setScreen(new PickerScreen(this));
  }

  showPortfolio() {
    this.setScreen(new PortfolioScreen(this));
  }

  openCity(id) {
    this.rig.autoSpin = 0;
    this.cityLoaded = id;
    this.setScreen(new CityScreen(this, id));
  }

  toggleSound(btn) {
    const on = this.store.setting('sound') === false;
    this.audio.setOn(on);
    if (!on) this.voice.stop();
    if (btn) setIcon(btn, on ? 'soundOn' : 'soundOff');
    if (on) this.audio.click();
  }

  frame(dt) {
    const s = this.screen;
    if (!(s && s.mode === 'lift')) this.rig.update(dt);
    s?.update?.(dt);
    const cam = this.engine.camera;
    this.env.focus.set(this.rig.cur.target.x, 0, this.rig.cur.target.z);
    this.env.update(dt, cam);
    this.city.update(dt);
    this.effects.update(dt, cam, this.engine.height);
    this.tape.update(dt, cam);
    this.ghosts.update(dt, cam);
    this.audio.update(dt, {
      night: this.env.night,
      world: this.env.world,
      altitude: cam.position.y,
      cityLife: Math.min(1, this.city.towerViews.size / 3 + (this.city.layout?.fill ? 0.6 : 0)),
    });
  }
}

function safeStorage() {
  try {
    const k = '__test';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  }
}
