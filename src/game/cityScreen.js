import * as THREE from 'three';
import { PLACES, WORLDS } from '../data/places.js';
import { PIECES } from '../data/pieces.js';
import { SIZES, FLOOR_H, MAX_HEIGHT } from '../config.js';
import { milestoneFor } from '../data/landmarks.js';
import { reservedBlocks } from './cityLayout.js';
import {
  addPart,
  stretchPart,
  setPartWidth,
  setTwin,
  towerHeight,
  layout,
  canStretch,
  canResize,
  isTop,
} from './towerModel.js';
import { wobbleLevel } from './physics.js';
import { finishCoins, bubbleCoins, BUBBLE_MIN_S, BUBBLE_MAX_S } from './economy.js';
import { towerFootprint } from '../three/towerView.js';
import { el, button, setIcon, setGlow, flash } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { HeightPanel, Coins, LabelLayer, flyCoins, burst } from '../ui/hud.js';
import { Inventory } from '../ui/inventory.js';
import { DecorateBar } from '../ui/decorate.js';
import { Hand } from '../ui/tutorial.js';
import { formatNumber, spokenMetres } from '../util/format.js';
import { clamp, lerp, easeInOutCubic, damp } from '../util/math.js';
import { idbSet } from '../util/idb.js';

// One city: looking around, building a tower, decorating it, riding the lift.

const STRETCH_PX = 230; // drag this far to grow a section by e (about 2.7x)

export class CityScreen {
  constructor(app, cityId) {
    this.app = app;
    this.store = app.store;
    this.cityData = this.store.city(cityId);
    this.place = this.cityData.place;
    this.worldName = PLACES[this.place].world;
    this.world = WORLDS[this.worldName];
    this.reserved = reservedBlocks(this.place);
    this.mode = 'view';
    this.tower = null;
    this.tv = null;
    this.selected = -1;
    this.history = [];
    this.focusTv = null;
    this.bubbles = new Map();
    this.ray = new THREE.Raycaster();
    this.labelsOn = true;
  }

  // ---------- setup ----------

  enter() {
    const app = this.app;
    app.city.load(this.cityData, this.store.cityTowers(this.cityData.id));
    app.ghosts.setWorld(this.worldName);
    this.store.state.lastCity = this.cityData.id;
    this.store.saveSoon();
    this._buildUI();
    for (const tv of app.city.towerViews.values()) if (tv.tower.done) this._scheduleBubble(tv.tower.id, 8 + Math.random() * 20);

    const unfinished = this.store.unfinishedTower(this.cityData.id);
    const towers = this.store.cityTowers(this.cityData.id);
    if (unfinished && unfinished.parts.length === 0 && towers.length === 1) {
      this.startBuilding(unfinished, { fly: false });
    } else if (!towers.length && this.place === 'newcity') {
      this.startBuilding(null, { fly: false });
    } else {
      this.enterView({ fly: false });
    }
    app.rig.snap();
  }

  exit() {
    this.app.tape.hide();
    this.app.ghosts.clear();
    this.app.ghosts.enabled = false;
    this.hand.hide();
    this.labels.clear();
    this.ui.remove();
    if (this.tv) {
      this.tv.setCrane(false);
      this.tv.setSelected(-1);
    }
    this.app.rig.enabled = true;
  }

  _buildUI() {
    const app = this.app;
    const ui = el('div', 'screen');
    this.ui = ui;
    app.uiRoot.appendChild(ui);

    this.labels = new LabelLayer(ui);
    this.height = new HeightPanel(ui);

    const right = el('div', 'hud-right');
    this.coins = new Coins(right);
    this.coins.set(this.store.coins, true);
    this.soundBtn = button(this.store.setting('sound') === false ? 'soundOff' : 'soundOn', {
      color: 'glass',
      size: 'small',
      onTap: () => app.toggleSound(this.soundBtn),
    });
    right.appendChild(this.soundBtn);
    this.homeBtn = button('home', { color: 'glass', onTap: () => app.showPicker() });
    right.appendChild(this.homeBtn);
    ui.appendChild(right);

    const left = el('div', 'tools-left');
    this.dayBtn = button('moon', { color: 'night', onTap: () => this.toggleDayNight() });
    this.rulerBtn = button('ruler', { color: 'yellow', onTap: () => this.toggleRuler() });
    this.liftBtn = button('lift', { color: 'purple', onTap: () => this.startLift() });
    left.append(this.dayBtn, this.rulerBtn, this.liftBtn);
    ui.appendChild(left);
    this.leftTools = left;

    const rightTools = el('div', 'tools-right');
    this.undoBtn = button('undo', { color: 'orange', onTap: () => this.undo() });
    this.finishBtn = button('tick', { color: 'green', size: 'big', onTap: () => this.finishBuilding() });
    this.doneBtn = button('tick', { color: 'green', size: 'big', onTap: () => this.completeTower() });
    rightTools.append(this.undoBtn, this.finishBtn, this.doneBtn);
    ui.appendChild(rightTools);
    this.rightTools = rightTools;

    this.buildBtn = button('plus', { color: 'green', size: 'huge', onTap: () => this.startBuilding() });
    this.buildBtn.style.position = 'absolute';
    this.buildBtn.style.right = 'var(--gutter-r)';
    this.buildBtn.style.bottom = 'var(--gutter-b)';
    ui.appendChild(this.buildBtn);

    this.inventory = new Inventory(ui, {
      store: this.store,
      thumbs: app.thumbs,
      onPiece: (id, elem) => this.tapPiece(id, elem),
      onSize: (i) => this.tapSize(i),
      onTwin: () => this.toggleTwin(),
    });

    this.deco = new DecorateBar(ui, {
      store: this.store,
      getDeco: () => this.tower?.deco || {},
      onChange: (change) => this.decorate(change),
      onFirework: () => this.launchFireworks(),
      onTab: (tab) => {
        app.audio.click();
        if (tab === 'lights' && !app.env.isNight && !this._autoNight) {
          // Lights look best in the dark: glide into the evening once.
          this._autoNight = true;
          app.env.toggleDayNight();
          app.audio.whoosh(false);
        }
      },
    });

    this.knob = el('div', 'knob tap hidden', icon('arrowUpDown'));
    ui.appendChild(this.knob);
    this._bindKnob();

    this.centerNum = el('div', 'center-num hidden');
    ui.appendChild(this.centerNum);

    this.hand = new Hand(ui);
  }

  _showFor(mode) {
    const is = (m) => mode === m;
    this.inventory.show(is('build'));
    this.deco.show(is('decorate'));
    this.undoBtn.classList.toggle('hidden', !is('build'));
    this.finishBtn.classList.toggle('hidden', !is('build'));
    this.doneBtn.classList.toggle('hidden', !is('decorate'));
    this.buildBtn.classList.toggle('hidden', !is('view'));
    const lift = is('lift');
    this.height.root.classList.toggle('hidden', lift);
    this.leftTools.classList.toggle('hidden', lift || is('finishing'));
    this.homeBtn.parentElement.classList.toggle('hidden', lift);
    this.centerNum.classList.toggle('hidden', !lift);
    this.knob.classList.add('hidden');
    this.height.setWobble(0, is('build'));
    if (!is('build')) this.height.setGoal(null);
  }

  // ---------- view mode ----------

  enterView({ fly = true, focus = null } = {}) {
    this.mode = 'view';
    this.app.ghosts.enabled = false;
    this.app.ghosts.clear();
    this._showFor('view');
    const unfinished = this.store.unfinishedTower(this.cityData.id);
    setIcon(this.buildBtn, unfinished && unfinished.parts.length ? 'crane' : 'plus');
    setGlow(this.buildBtn, true);
    const tvs = [...this.app.city.towerViews.values()].filter((t) => t.tower.done);
    this.focusTv = focus || (tvs.length ? tvs.reduce((a, b) => (b.height > a.height ? b : a)) : null);
    this._frameCity(fly);
    this._updateHeightView();
  }

  _frameCity(fly) {
    const app = this.app;
    const tv = this.focusTv;
    let target;
    let dist;
    if (tv) {
      const H = Math.max(tv.height, 60);
      target = tv.group.position.clone().setY(H * 0.42);
      dist = H * 1.75 + 380;
    } else {
      const lm = app.city.layout.landmarks[0];
      const H = app.city.tallest() || 120;
      target = lm ? app.city.plotPosition(lm.block).setY(H * 0.4) : new THREE.Vector3(0, 60, 0);
      dist = H * 1.6 + 600;
    }
    this._setLimits(Math.max(dist, 2000));
    if (fly) app.rig.flyTo({ target, dist, el: 0.32 });
    else app.rig.setGoal({ target, dist, el: 0.32 });
  }

  _setLimits(maxDist) {
    const rig = this.app.rig;
    rig.maxDist = Math.max(maxDist * 3, 4000);
    rig.minDist = 25;
    rig.maxTargetY = Math.max(400, (this.tower ? towerHeight(this.tower) : this.app.city.tallest()) * 1.2);
  }

  _updateHeightView() {
    const tv = this.focusTv;
    this.height.setHeight(tv ? tv.height : 0);
  }

  // ---------- building ----------

  startBuilding(tower = null, { fly = true } = {}) {
    const app = this.app;
    if (!tower) tower = this.store.unfinishedTower(this.cityData.id) || this.store.startTower(this.cityData.id, this.reserved);
    this.tower = tower;
    const isNew = !app.city.towerViews.has(tower.id);
    this.tv = app.city.towerViews.get(tower.id) || app.city.addTower(tower);
    // A new building site gets its fence (and roads around it).
    if (isNew) app.city.rebuildSurroundings({ animate: false });
    this.mode = 'build';
    this.history = [];
    this.tv.setCrane(true);
    this.selected = tower.parts.length ? this._defaultSelection() : -1;
    this.tv.setSelected(this.selected);
    app.ghosts.enabled = true;
    app.tape.hide();
    this._showFor('build');
    this.inventory.refresh();
    this.inventory.setTwin(!!tower.twin);
    this._refreshBuildHud();
    this._frameTower(fly, true);
    app.audio.click();
    this._tutorial();
  }

  _defaultSelection() {
    const parts = this.tower.parts;
    for (let i = parts.length - 1; i >= 0; i--) if (!isTop(parts[i])) return i;
    return parts.length - 1;
  }

  _frameTower(fly = true, building = this.mode === 'build') {
    const app = this.app;
    const tv = this.tv;
    const H = Math.max(towerHeight(this.tower), 40);
    const fp = Math.max(towerFootprint(this.tower), 40);
    const vis = 2 * Math.tan((app.engine.camera.fov * Math.PI) / 360);
    const dist = Math.max(H / (0.62 * vis) + fp * 0.8, fp * 2.6 + 110);
    const target = tv.group.position.clone().setY(H * (building ? 0.47 : 0.5));
    this._setLimits(dist);
    const el = H > 8000 ? 0.12 : 0.22;
    if (fly) app.rig.flyTo({ target, dist, el, duration: 1.2 });
    else app.rig.setGoal({ target, dist, el });
    app.env.shadowRadius = clamp(Math.max(H * 0.75, fp * 3, 250), 250, 3500);
  }

  _refreshBuildHud() {
    const t = this.tower;
    const H = towerHeight(t);
    this.height.setHeight(H);
    this.height.setWobble(this.tv.wobble.value, true);
    const part = t.parts[this.selected];
    const resizable = canResize(part);
    let sizeIdx = -1;
    if (resizable) {
      let best = Infinity;
      SIZES.forEach((w, i) => {
        const d = Math.abs(w - part.w);
        if (d < best && d < 3) {
          best = d;
          sizeIdx = i;
        }
      });
    }
    this.inventory.setSize(sizeIdx, resizable);
    this.inventory.setTwin(!!t.twin);
    this.undoBtn.classList.toggle('disabled', !this.history.length);
    const hasSection = t.parts.some((p) => !isTop(p));
    this.finishBtn.classList.toggle('disabled', !hasSection);
    setGlow(this.finishBtn, hasSection && (H >= 120 || t.parts.length >= 4) && !this.knobDrag);
    // The next famous building to beat.
    this.app.ghosts.sync(this.tv.group.position, H, towerFootprint(t));
    const goal = this.app.ghosts.target;
    this.height.setGoal(goal, goal ? this.app.thumbs.landmark(goal.key) : null);
    // Physics hint: a very wobbly tower makes the wide size (and the damper) glow.
    const red = wobbleLevel(this.tv.wobble.value) === 2;
    this.inventory.glowSize(red ? 3 : -1);
    this.inventory.glow(red && this.store.isUnlocked('damper') ? ['damper'] : this._tutGlow || []);
  }

  _commit(newTower, { dropIndex = -1, select = null, sound = null } = {}) {
    const prevH = towerHeight(this.tower);
    this.history.push(this.tower);
    if (this.history.length > 60) this.history.shift();
    this.tower = newTower;
    this.store.putTower(newTower);
    this.tv.setTower(newTower, this.world, { dropIndex });
    if (select !== null) this.selected = select;
    if (this.selected >= newTower.parts.length) this.selected = newTower.parts.length - 1;
    this.tv.setSelected(this.selected);
    this._refreshBuildHud();
    this._frameTower(false);
    this._progress(prevH, towerHeight(newTower));
    if (sound) sound();
  }

  tapPiece(id, elem) {
    const app = this.app;
    if (this.mode !== 'build') return;
    const def = PIECES[id];
    if (!this.store.isUnlocked(id)) {
      if (this.store.unlock(id, def.price)) {
        app.audio.unlockPiece();
        this.inventory.refresh();
        this.inventory.popPiece(id);
        this.coins.set(this.store.coins);
        this.coins.bump();
      } else {
        app.audio.denied();
        this.inventory.shakePiece(id);
        this.coins.shake();
      }
      return;
    }
    let base = this.tower;
    if (id === 'bridge' && !base.twin) base = setTwin(base, true);
    const res = addPart(base, id);
    if (!res) {
      app.audio.denied();
      this.inventory.shakePiece(id);
      return;
    }
    this.tv.swingCrane();
    this._commit(res.tower, { dropIndex: res.index, select: res.index });
    setTimeout(() => {
      app.audio.place();
      const top = this.tv.group.position.clone();
      const lay = layout(this.tower);
      const it = lay[res.index];
      if (it) app.effects.dust(top.setY(it.z0), Math.max(it.w, 20));
    }, 260);
    this.store.markTutorial('piece');
    if (this.tower.parts.length >= 2) this.store.markTutorial('more');
    this._tutorial();
  }

  tapSize(i) {
    if (this.mode !== 'build') return;
    const part = this.tower.parts[this.selected];
    if (!canResize(part)) {
      // Nothing selected that can change size: select the top section first.
      this.selected = this._defaultSelection();
      this.tv.setSelected(this.selected);
      if (!canResize(this.tower.parts[this.selected])) return;
    }
    const cur = this.tower.parts[this.selected].w;
    const w = SIZES[i];
    if (Math.abs(cur - w) < 0.5) return;
    this._commit(setPartWidth(this.tower, this.selected, w));
    this.app.audio.resize(w > cur);
  }

  toggleTwin() {
    if (this.mode !== 'build') return;
    this._commit(setTwin(this.tower, !this.tower.twin));
    this.app.audio.resize(this.tower.twin);
    this.app.audio.place();
  }

  undo() {
    if (this.mode !== 'build' || !this.history.length) return;
    const prev = this.history.pop();
    this.tower = prev;
    this.store.putTower(prev);
    this.tv.setTower(prev, this.world);
    this.selected = prev.parts.length ? Math.min(this.selected, prev.parts.length - 1) : -1;
    if (this.selected >= 0 && isTop(prev.parts[this.selected]) && !canStretch(prev.parts[this.selected])) this.selected = this._defaultSelection();
    this.tv.setSelected(this.selected);
    this._refreshBuildHud();
    this._frameTower(false);
    this.app.audio.undo();
  }

  // ---------- the stretch knob ----------

  _bindKnob() {
    const k = this.knob;
    k.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.mode !== 'build') return;
      const part = this.tower.parts[this.selected];
      if (!canStretch(part)) return;
      k.setPointerCapture?.(e.pointerId);
      this.knobDrag = { y0: e.clientY, tower0: this.tower, h0: part.h, lastH: part.h, lastBuild: 0, changed: false };
      k.classList.add('dragging');
      this.app.rig.enabled = false;
    });
    k.addEventListener('pointermove', (e) => {
      const d = this.knobDrag;
      if (!d) return;
      const dy = e.clientY - d.y0;
      const part0 = d.tower0.parts[this.selected];
      const top = isTop(part0);
      const minH = top ? 5 : FLOOR_H * 2;
      let newH = Math.max(minH, d.h0 * Math.exp(-dy / STRETCH_PX));
      if (!top) newH = Math.round(newH / FLOOR_H) * FLOOR_H;
      const room = MAX_HEIGHT - (towerHeight(d.tower0) - d.h0);
      newH = Math.min(newH, room);
      if (Math.abs(newH - d.lastH) < (top ? 0.5 : FLOOR_H - 0.01)) return;
      const floorsMoved = Math.round((newH - d.lastH) / FLOOR_H);
      d.lastH = newH;
      d.changed = true;
      const prevH = towerHeight(this.tower);
      this.tower = stretchPart(d.tower0, this.selected, newH - d.h0);
      this.app.audio.tick(Math.max(0, Math.round(Math.log2(Math.max(1, towerHeight(this.tower))) * 3 + (floorsMoved > 0 ? 1 : 0))));
      // Rebuilding the model is the slow part: do it at most ~20 times a second.
      const now = performance.now();
      if (now - d.lastBuild > 50) {
        d.lastBuild = now;
        this.tv.setTower(this.tower, this.world);
        this.tv.setSelected(this.selected);
      }
      this.height.setHeight(towerHeight(this.tower));
      this.height.setWobble(this.tv.wobble.value, true);
      this._progress(prevH, towerHeight(this.tower), { live: true });
      this._frameTower(false);
      this.app.ghosts.sync(this.tv.group.position, towerHeight(this.tower), towerFootprint(this.tower));
      const goal = this.app.ghosts.target;
      this.height.setGoal(goal, goal ? this.app.thumbs.landmark(goal.key) : null);
    });
    const end = () => {
      const d = this.knobDrag;
      if (!d) return;
      this.knobDrag = null;
      k.classList.remove('dragging');
      this.app.rig.enabled = true;
      if (d.changed) {
        const t = this.tower;
        this.tower = d.tower0;
        this._commit(t);
        this.store.markTutorial('stretch');
        this._tutorial();
      }
    };
    k.addEventListener('pointerup', end);
    k.addEventListener('pointercancel', end);
  }

  _updateKnob() {
    const k = this.knob;
    if (this.mode !== 'build' || this.selected < 0 || !this.tower) {
      k.classList.add('hidden');
      return;
    }
    const part = this.tower.parts[this.selected];
    if (!canStretch(part)) {
      k.classList.add('hidden');
      return;
    }
    const lay = layout(this.tower);
    const it = lay[this.selected];
    const p = this.tv.group.position.clone();
    p.y += it.z1;
    // Put the knob just beside the top of the selected section.
    const cam = this.app.engine.camera;
    p.project(cam);
    if (p.z > 1) {
      k.classList.add('hidden');
      return;
    }
    const w = this.app.engine.width;
    const h = this.app.engine.height;
    let x = (p.x * 0.5 + 0.5) * w;
    let y = (-p.y * 0.5 + 0.5) * h;
    x = clamp(x + 70, 60, w - 150);
    y = clamp(y, 150, h - 190);
    k.style.left = x + 'px';
    k.style.top = y + 'px';
    k.classList.remove('hidden');
  }

  // ---------- heights passed: famous buildings and milestones ----------

  _progress(prevH, newH, { live = false } = {}) {
    if (newH <= prevH) return;
    const app = this.app;
    const passed = app.ghosts.list.filter((l) => prevH < l.h && newH >= l.h);
    if (passed.length) {
      const lm = passed[passed.length - 1];
      app.ghosts.markBeaten(lm);
      const top = this.tv.group.position.clone().setY(newH);
      app.effects.sparkle(top, Math.max(25, newH * 0.08));
      app.audio.milestone();
      app.voice.say(lm.say, { important: !live });
      const img = app.thumbs.landmark(lm.key);
      burst(
        this.ui,
        `${img ? `<img src="${img}" alt="">` : `<span>${icon('sparkle')}</span>`}<span>${formatNumber(lm.h)} m</span><span style="color:#5ef28f">${icon('tick')}</span>`,
      );
      this.height.pop();
      // The first time ever: a few bonus coins.
      if (this.store.markPassed(lm.key)) {
        const bonus = 20;
        this.store.addCoins(bonus);
        const from = this._screenPos(top) || { x: app.engine.width / 2, y: app.engine.height / 2 };
        flyCoins(this.ui, from, this.coins.center(), bonus, (i, n) => {
          app.audio.coin(i);
          if (i === n - 1) {
            this.coins.set(this.store.coins);
            this.coins.bump();
          }
        });
      }
      return;
    }
    const m = milestoneFor(prevH, newH);
    if (m) {
      app.voice.say(spokenMetres(m));
      this.height.pop();
    }
  }

  _screenPos(world) {
    const v = world.clone().project(this.app.engine.camera);
    if (v.z > 1) return null;
    return { x: (v.x * 0.5 + 0.5) * this.app.engine.width, y: (-v.y * 0.5 + 0.5) * this.app.engine.height };
  }

  // ---------- finishing ----------

  finishBuilding() {
    const app = this.app;
    if (this.mode !== 'build') return;
    if (!this.tower.parts.some((p) => !isTop(p))) {
      app.audio.denied();
      flash(this.finishBtn, 'shake');
      this.hand.point(this.inventory.piece('glass'), 'tap');
      return;
    }
    this.mode = 'finishing';
    this._showFor('finishing');
    this.hand.hide();
    this.tv.setCrane(false);
    this.tv.setSelected(-1);
    app.ghosts.enabled = false;
    const H = towerHeight(this.tower);
    this._frameTower(true, false);
    app.audio.cheer();
    const top = this.tv.group.position.clone().setY(H);
    app.effects.confettiBurst(top, Math.max(30, H * 0.12));
    setTimeout(() => this._showTape(true), 700);
    app.voice.say(`Your tower is ${spokenMetres(Math.round(H)).replace(/!$/, '')} tall!`, { important: true });
    setTimeout(() => this.enterDecorate(), 4200);
  }

  enterDecorate() {
    if (this.mode !== 'finishing') return;
    this.mode = 'decorate';
    this._showFor('decorate');
    this.deco.render();
    setGlow(this.doneBtn, true);
    this._tutorial();
  }

  decorate(change) {
    const app = this.app;
    if (change.unlocked) {
      app.audio.unlockPiece();
      this.coins.set(this.store.coins);
      this.coins.bump();
      return;
    }
    if (change.denied) {
      app.audio.denied();
      this.coins.shake();
      return;
    }
    const deco = { ...this.tower.deco, ...change };
    this.tower = { ...this.tower, deco };
    this.store.putTower(this.tower);
    this.tv.setTower(this.tower, this.world);
    app.audio.click();
    app.audio.resize(true);
    if (change.light) this.store.markTutorial('lights');
    this._tutorial();
  }

  launchFireworks() {
    const app = this.app;
    const H = Math.max(60, towerHeight(this.tower));
    const base = this.tv.group.position;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const p = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * H * 0.6, H * (0.85 + Math.random() * 0.4), (Math.random() - 0.5) * H * 0.6));
        app.effects.firework(p, Math.max(20, H * 0.12));
        app.audio.firework();
      }, i * 450);
    }
  }

  completeTower() {
    const app = this.app;
    if (this.mode !== 'decorate') return;
    const H = towerHeight(this.tower);
    const coins = finishCoins(H);
    this.tower = { ...this.tower, done: true };
    this.store.putTower(this.tower);
    this.store.finishTower(this.tower.id, coins);
    this.tower = this.store.state.towers[this.tower.id];
    this.tv.setTower(this.tower, this.world);
    app.city.rebuildSurroundings({ animate: true });
    app.tape.hide();
    this.mode = 'celebrate';
    this._showFor('view');
    this.buildBtn.classList.add('hidden');
    const top = this.tv.group.position.clone().setY(H);
    app.audio.cheer();
    this.launchFireworks();
    app.effects.confettiBurst(top, Math.max(30, H * 0.12));
    app.voice.say(`Hooray! People are moving in! ${formatNumber(coins)} coins!`, { important: true });
    // Coins pour out of the tower.
    const from = this._screenPos(top) || { x: app.engine.width / 2, y: app.engine.height / 3 };
    flyCoins(this.ui, from, this.coins.center(), coins, (i, n) => {
      app.audio.coin(i % 4);
      if (i === n - 1) {
        this.coins.set(this.store.coins);
        this.coins.bump();
      }
    });
    this._takePhoto(this.tower, this.tv);
    this._scheduleBubble(this.tower.id, 25);
    const done = this.tv;
    this.tower = null;
    this.tv = null;
    this.selected = -1;
    // Pull back to watch the city grow around the new tower.
    setTimeout(() => {
      if (this.mode !== 'celebrate') return;
      this.enterView({ fly: true, focus: done });
    }, 2600);
  }

  async _takePhoto(tower, tv) {
    const app = this.app;
    const H = Math.max(tv.height, 40);
    const fp = towerFootprint(tower);
    const cam = new THREE.PerspectiveCamera(42, 4 / 3, 1, 1e7);
    const vis = 2 * Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.max(H / (0.8 * vis), fp * 3 + 80);
    const az = app.rig.cur.az + 0.4;
    const base = tv.group.position;
    cam.position.set(base.x + Math.sin(az) * dist, Math.max(4, H * 0.32), base.z + Math.cos(az) * dist);
    cam.lookAt(base.x, H * 0.48, base.z);
    cam.updateMatrixWorld();
    // Wait a moment so the fireworks and new buildings are in the picture.
    await new Promise((r) => setTimeout(r, 1600));
    const canvas = await app.engine.snapshot(() => app.engine.photo(cam, 480, 360));
    canvas.toBlob((blob) => blob && idbSet('photo:' + tower.id, blob), 'image/jpeg', 0.82);
  }

  // ---------- tape measure ----------

  _tapeTower() {
    if (this.tv && this.mode !== 'view') return this.tv;
    return this.focusTv || this.tv;
  }

  _showTape(animate) {
    const tv = this._tapeTower();
    if (!tv || tv.height <= 0) return;
    const fp = towerFootprint(tv.tower);
    this.app.tape.show(tv.group.position, tv.height, fp / 2 + Math.max(6, fp * 0.15), { animate });
    this.app.audio.whoosh(true);
  }

  toggleRuler() {
    if (this.app.tape.visible) {
      this.app.tape.hide();
      this.rulerBtn.classList.remove('on');
      this.app.audio.click();
    } else {
      this._showTape(true);
      this.rulerBtn.classList.add('on');
    }
  }

  // ---------- day and night ----------

  toggleDayNight() {
    const toNight = this.app.env.toggleDayNight();
    this.app.audio.whoosh(!toNight);
  }

  // ---------- the lift ride ----------

  startLift() {
    const app = this.app;
    const tv = this.mode === 'view' ? this.focusTv : this.tv;
    if (!tv || tv.height < 12) {
      app.audio.denied();
      flash(this.liftBtn, 'shake');
      return;
    }
    this.liftReturn = this.mode;
    this.mode = 'lift';
    this._showFor('lift');
    app.rig.enabled = false;
    const H = tv.height;
    const fp = towerFootprint(tv.tower);
    this.ride = {
      tv,
      t: 0,
      hold: 0,
      H,
      dur: clamp(5 + 2.6 * Math.log10(H / 50), 5, 15),
      r: fp / 2 + 9,
      az: app.rig.cur.az,
    };
    app.audio.whoosh(true);
  }

  _updateLift(dt) {
    const app = this.app;
    const r = this.ride;
    const cam = app.engine.camera;
    if (r.t < 1) r.t = Math.min(1, r.t + dt / r.dur);
    else r.hold += dt;
    const e = easeInOutCubic(r.t);
    const y = Math.exp(lerp(Math.log(3), Math.log(Math.max(4, r.H * 0.97)), e));
    const az = r.az + e * 1.4;
    const base = r.tv.group.position;
    const dir = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    cam.position.copy(base).addScaledVector(dir, r.r).setY(y);
    // Look out over the city, tilting down more the higher we go.
    const look = cam.position.clone().addScaledVector(dir, 600).setY(y - 120 - y * 0.45);
    cam.lookAt(look);
    cam.near = 0.5;
    cam.far = Math.max(90000, y * 30);
    cam.updateProjectionMatrix();
    this.centerNum.innerHTML = `${formatNumber(y)}<span class="unit"> m</span>`;
    if (r.t >= 1 && !r.said) {
      r.said = true;
      app.audio.milestone();
      app.voice.say(spokenMetres(Math.round(r.H)), { important: true });
    }
    if (r.hold > 3) this.endLift();
  }

  endLift() {
    const app = this.app;
    if (this.mode !== 'lift') return;
    this.mode = this.liftReturn || 'view';
    this.ride = null;
    // Hand the camera back smoothly from where the lift stopped.
    const cam = app.engine.camera;
    const rig = app.rig;
    rig.enabled = true;
    const tgt = new THREE.Vector3();
    cam.getWorldDirection(tgt);
    rig.cur.target.copy(cam.position).addScaledVector(tgt, 200);
    const off = cam.position.clone().sub(rig.cur.target);
    rig.cur.dist = off.length();
    rig.cur.az = Math.atan2(off.x, off.z);
    rig.cur.el = Math.asin(clamp(off.y / rig.cur.dist, -1, 1));
    this._showFor(this.mode);
    if (this.mode === 'build') {
      this._refreshBuildHud();
      this._frameTower(true);
    } else this._frameCity(true);
  }

  // ---------- coin bubbles ----------

  _scheduleBubble(id, inSeconds) {
    this.bubbles.set(id, { at: performance.now() / 1000 + inSeconds, shown: false });
  }

  _updateBubbles() {
    const now = performance.now() / 1000;
    const app = this.app;
    const cam = app.engine.camera;
    for (const [id, b] of this.bubbles) {
      const tv = app.city.towerViews.get(id);
      if (!tv || !tv.tower.done) continue;
      if (!b.shown && now >= b.at) b.shown = true;
      if (!b.shown || this.mode === 'lift') continue;
      const pos = tv.group.position.clone().setY(tv.height + Math.max(15, tv.height * 0.06));
      this.labels.put('bubble:' + id, pos, cam, app.engine.width, app.engine.height, {
        cls: 'bubble',
        html: icon('coin'),
        tap: () => this._popBubble(id, tv),
      });
      if (!this.store.tutorialDone('bubble') && !this.hand.visible && this.mode === 'view') {
        this.hand.point(() => this._screenPos(pos), 'tap');
        this._handFor = 'bubble';
      }
    }
  }

  _popBubble(id, tv) {
    const app = this.app;
    const b = this.bubbles.get(id);
    if (!b || !b.shown) return;
    const amount = bubbleCoins(tv.height);
    this.store.addCoins(amount);
    this._scheduleBubble(id, BUBBLE_MIN_S + Math.random() * (BUBBLE_MAX_S - BUBBLE_MIN_S));
    const pos = tv.group.position.clone().setY(tv.height + Math.max(15, tv.height * 0.06));
    const from = this._screenPos(pos) || { x: app.engine.width / 2, y: 200 };
    app.audio.bubble();
    flyCoins(this.ui, from, this.coins.center(), amount, (i, n) => {
      app.audio.coin(i % 3);
      if (i === n - 1) {
        this.coins.set(this.store.coins);
        this.coins.bump();
      }
    });
    if (this._handFor === 'bubble') {
      this.hand.hide();
      this._handFor = null;
    }
    this.store.markTutorial('bubble');
  }

  // ---------- the wordless tutorial ----------

  _tutorial() {
    const st = this.store;
    const hand = this.hand;
    this._tutGlow = null;
    if (this.mode === 'build') {
      if (!st.tutorialDone('piece')) {
        hand.point(this.inventory.piece('glass'), 'tap');
        this._tutGlow = ['glass'];
        return;
      }
      if (!st.tutorialDone('stretch') && this.tower.parts.length) {
        hand.point(() => {
          const r = this.knob.getBoundingClientRect();
          return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        }, 'drag-up');
        return;
      }
      if (!st.tutorialDone('more')) {
        hand.point(this.inventory.piece('spire'), 'tap');
        this._tutGlow = ['spire'];
        return;
      }
      if (!st.tutorialDone('orbit')) {
        hand.point({ x: this.app.engine.width * 0.62, y: this.app.engine.height * 0.45 }, 'swipe');
        return;
      }
    }
    if (this.mode === 'decorate' && !st.tutorialDone('lights')) {
      if (this.deco.tab !== 'lights') hand.point(this.deco.tabEls.lights, 'tap');
      else hand.point(() => {
        const s = this.deco.options.querySelectorAll('.tile')[1];
        if (!s) return null;
        const r = s.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, 'tap');
      return;
    }
    hand.hide();
  }

  // ---------- taps in the 3D scene ----------

  onTap(x, y) {
    const app = this.app;
    if (this.mode === 'lift') {
      this.endLift();
      return;
    }
    // Planets and the Moon in the sky.
    if (app.env.night > 0.4 || app.env.altitude > 20000 || this.worldName === 'moon') {
      const body = app.env.pickBody(x, y, app.engine.width, app.engine.height);
      if (body) {
        app.planetView.show(body);
        return;
      }
    }
    const ndc = new THREE.Vector2((x / app.engine.width) * 2 - 1, -(y / app.engine.height) * 2 + 1);
    this.ray.setFromCamera(ndc, app.engine.camera);
    if (this.mode === 'build') {
      const idx = this.tv.pickSection(this.ray);
      if (idx >= 0) {
        this.selected = idx;
        this.tv.setSelected(idx);
        this._refreshBuildHud();
        app.audio.click();
      }
      return;
    }
    if (this.mode === 'view') {
      let best = null;
      let bestD = Infinity;
      for (const tv of app.city.towerViews.values()) {
        if (!tv.mesh) continue;
        const hit = this.ray.intersectObject(tv.mesh, false)[0];
        if (hit && hit.distance < bestD) {
          bestD = hit.distance;
          best = tv;
        }
      }
      if (best) {
        if (!best.tower.done) {
          this.startBuilding(best.tower);
          return;
        }
        this.focusTv = best;
        this._updateHeightView();
        this.height.pop();
        app.audio.click();
        if (app.tape.visible) this._showTape(true);
        app.voice.say(spokenMetres(Math.round(best.height)));
      }
    }
  }

  onInteract() {
    if (this.mode === 'build' && !this.store.tutorialDone('orbit') && this.store.tutorialDone('more')) {
      this.store.markTutorial('orbit');
      this.hand.hide();
    }
  }

  // ---------- every frame ----------

  update(dt) {
    const app = this.app;
    this.height.update(dt);
    this.coins.update(dt);
    this.hand.update();
    if (this.mode === 'lift') this._updateLift(dt);
    this._updateKnob();
    setIcon(this.dayBtn, app.env.isNight ? 'sun' : 'moon');
    this.dayBtn.className = `btn tap ${app.env.isNight ? 'yellow' : 'night'}`;

    // Floating labels: famous-building heights and tape-measure numbers.
    const cam = app.engine.camera;
    const W = app.engine.width;
    const H = app.engine.height;
    this.labels.begin();
    if (app.ghosts.enabled && this.mode === 'build') {
      for (const l of app.ghosts.labels()) {
        const img = app.thumbs.landmark(l.lm.key);
        const pic = img ? `<img src="${img}" alt="">` : l.lm.kind === 'sky' ? icon('sparkle') : '';
        this.labels.put('ghost:' + l.lm.key, l.pos, cam, W, H, {
          cls: `label3d ${l.beaten ? 'beaten' : 'ghost'}`,
          html: `${pic}${formatNumber(l.lm.h)} m${l.beaten ? icon('tick') : ''}`,
        });
      }
    }
    if (app.tape.visible && this.mode !== 'lift') {
      for (const m of app.tape.majorMarks()) {
        this.labels.put('tape:' + m.value, m.pos, cam, W, H, { cls: 'tick-label', html: formatNumber(m.value) });
      }
      if (app.tape.done) {
        this.labels.put('tape:top', app.tape.topPosition(), cam, W, H, {
          cls: 'label3d',
          html: `${formatNumber(app.tape.height)} m`,
        });
      }
    }
    if (this.mode !== 'lift') this._updateBubbles();
    this.labels.end();
  }
}
