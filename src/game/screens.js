import * as THREE from 'three';
import { PLACES, WORLDS } from '../data/places.js';
import { el, button, onTapped, flash, wheelScrollsSideways } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Coins, LabelLayer } from '../ui/hud.js';
import { PLACE_ART, skylineArt } from '../ui/cards.js';
import { TowerView, towerFootprint } from '../three/towerView.js';
import { towerHeight } from './towerModel.js';
import { formatNumber } from '../util/format.js';
import { idbGet } from '../util/idb.js';

// ---------------------------------------------------------------- title

export class TitleScreen {
  constructor(app) {
    this.app = app;
  }

  enter() {
    const app = this.app;
    app.showBackdrop();
    const ui = el('div', 'screen');
    ui.innerHTML = `<div class="title-logo"><div class="name">Louie's</div><div class="sub">Sky City</div></div>`;
    const play = button('play', {
      color: 'green',
      size: 'huge',
      extra: 'title-play glow',
      onTap: () => {
        app.audio.unlock();
        app.voice.unlock();
        app.audio.click();
        app.showPicker();
      },
    });
    ui.appendChild(play);
    app.uiRoot.appendChild(ui);
    this.ui = ui;
    // Draw the inventory pictures while Louie looks at the title.
    this._warm = setTimeout(() => app.prewarm(), 1500);
  }

  exit() {
    clearTimeout(this._warm);
    this.ui.remove();
  }

  update() {}
}

// ---------------------------------------------------------------- city picker

export class PickerScreen {
  constructor(app) {
    this.app = app;
    this.urls = [];
  }

  enter() {
    const app = this.app;
    const store = app.store;
    app.showBackdrop();
    const ui = el('div', 'screen');
    this.ui = ui;

    const top = el('div', 'portfolio-top');
    top.appendChild(button('photos', { color: 'purple', onTap: () => app.showPortfolio() }));
    ui.appendChild(top);
    const right = el('div', 'hud-right');
    this.coins = new Coins(right);
    this.coins.set(store.coins, true);
    this.soundBtn = button(store.setting('sound') === false ? 'soundOff' : 'soundOn', {
      color: 'glass',
      size: 'small',
      onTap: () => app.toggleSound(this.soundBtn),
    });
    right.appendChild(this.soundBtn);
    ui.appendChild(right);

    const picker = el('div', 'picker');
    const mine = el('div', 'card-row tap');
    const places = el('div', 'card-row tap');
    wheelScrollsSideways(mine);
    wheelScrollsSideways(places);
    picker.append(mine, places);
    ui.appendChild(picker);

    // Row 1: a brand new city, then Louie's own cities.
    const add = el('div', 'card new tap', `<div class="plus">${icon('plus')}</div>`);
    onTapped(add, () => {
      app.audio.click();
      const city = store.createCity();
      app.openCity(city.id);
    });
    mine.appendChild(add);
    const own = store.ownCities();
    if (!own.length) add.classList.add('glow');
    for (const city of own) {
      const towers = store.cityTowers(city.id);
      const done = towers.filter((t) => t.done).sort((a, b) => b.finished - a.finished);
      const heights = towers.map((t) => towerHeight(t)).sort((a, b) => b - a);
      const card = el('div', 'card tap', skylineArt(heights.length ? heights : [0]));
      if (heights.length) card.appendChild(el('div', 'badge', `${formatNumber(heights[0])} <small>m</small>`));
      onTapped(card, () => {
        app.audio.click();
        app.openCity(city.id);
      });
      mine.appendChild(card);
      if (done.length) this._photoInto(card, done[0].id);
    }

    // Row 2: the ready-made places.
    for (const placeId of ['dubai', 'newyork', 'moon', 'mars']) {
      const p = PLACES[placeId];
      const key = 'place:' + placeId;
      const card = el('div', 'card tap', PLACE_ART[placeId]);
      const locked = !store.isUnlocked(key);
      if (locked) {
        card.classList.add('locked');
        card.appendChild(el('div', 'lock-big', icon('lock')));
        card.appendChild(el('div', 'price', `${icon('coin')}<span>${formatNumber(p.price)}</span>`));
      } else {
        const city = store.city(placeId);
        const towers = city ? store.cityTowers(placeId) : [];
        const best = towers.reduce((m, t) => Math.max(m, towerHeight(t)), 0);
        if (best) card.appendChild(el('div', 'badge', `${formatNumber(best)} <small>m</small>`));
      }
      onTapped(card, () => {
        if (!store.isUnlocked(key)) {
          if (store.unlock(key, p.price)) {
            app.audio.unlockPiece();
            this.coins.set(store.coins);
            this.coins.bump();
            flash(card, 'pop');
            setTimeout(() => app.openCity(store.premadeCity(placeId).id), 500);
          } else {
            app.audio.denied();
            flash(card, 'shake');
            this.coins.shake();
          }
          return;
        }
        app.audio.click();
        app.openCity(store.premadeCity(placeId).id);
      });
      places.appendChild(card);
    }
    app.uiRoot.appendChild(ui);
  }

  async _photoInto(card, towerId) {
    const blob = await idbGet('photo:' + towerId);
    if (!blob || !this.ui) return;
    const url = URL.createObjectURL(blob);
    this.urls.push(url);
    const img = el('img');
    img.src = url;
    img.alt = '';
    card.insertBefore(img, card.firstChild);
    const svg = card.querySelector('svg');
    if (svg) svg.remove();
  }

  exit() {
    this.ui.remove();
    this.ui = null;
    for (const u of this.urls) URL.revokeObjectURL(u);
  }

  update(dt) {
    this.coins.update(dt);
  }
}

// ---------------------------------------------------------------- portfolio

export class PortfolioScreen {
  constructor(app) {
    this.app = app;
    this.views = [];
    this.urls = [];
    this.tab = 'skyline';
  }

  enter() {
    const app = this.app;
    const store = app.store;
    this.towers = store.finishedTowers().sort((a, b) => towerHeight(b) - towerHeight(a));
    const ui = el('div', 'screen');
    this.ui = ui;
    const top = el('div', 'portfolio-top');
    top.appendChild(button('back', { color: 'glass', onTap: () => app.showPicker() }));
    this.skyBtn = button('skyline', { color: 'purple', onTap: () => this.setTab('skyline') });
    this.photoBtn = button('photos', { color: 'purple', onTap: () => this.setTab('photos') });
    top.append(this.skyBtn, this.photoBtn);
    this.dayBtn = button('moon', { color: 'night', onTap: () => app.env.toggleDayNight() });
    top.appendChild(this.dayBtn);
    ui.appendChild(top);
    const right = el('div', 'hud-right');
    this.coins = new Coins(right);
    this.coins.set(store.coins, true);
    ui.appendChild(right);
    this.labels = new LabelLayer(ui);
    this.grid = el('div', 'photo-grid tap hidden');
    ui.appendChild(this.grid);
    app.uiRoot.appendChild(ui);

    this._buildSkyline();
    this._buildPhotos();
    if (!this.towers.length) {
      const hint = el('div', 'empty-hint', `<span style="width:120px;height:120px;color:#ffc93c">${icon('crane')}</span>`);
      const go = button('plus', { color: 'green', size: 'huge', extra: 'glow', onTap: () => app.showPicker() });
      hint.appendChild(go);
      ui.appendChild(hint);
    }
    this.setTab('skyline');
  }

  setTab(tab) {
    this.tab = tab;
    this.skyBtn.classList.toggle('on', tab === 'skyline');
    this.photoBtn.classList.toggle('on', tab === 'photos');
    this.grid.classList.toggle('hidden', tab !== 'photos' || !this.towers.length);
    this.app.audio.click();
  }

  // All of Louie's towers in a row, tallest first.
  _buildSkyline() {
    const app = this.app;
    app.city.clear();
    app.city.group.visible = false;
    app.env.setPlace('newcity', 'earth');
    const group = new THREE.Group();
    this.group = group;
    app.engine.scene.add(group);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30000, 64).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3d4a5c, roughness: 0.35, metalness: 0.2 }),
    );
    ground.receiveShadow = true;
    group.add(ground);
    let x = 0;
    let maxH = 60;
    this.slots = [];
    for (const t of this.towers) {
      const tv = new TowerView(app.env.uniforms, t.id);
      tv.setTower(t, WORLDS[PLACES[app.store.city(t.city)?.place || 'newcity'].world]);
      const fp = Math.max(towerFootprint(t), 30);
      x += fp / 2;
      tv.group.position.set(x, 0, 0);
      x += fp / 2 + 40;
      group.add(tv.group);
      this.views.push(tv);
      const h = towerHeight(t);
      maxH = Math.max(maxH, h);
      this.slots.push({ tv, h, x: tv.group.position.x });
    }
    const width = Math.max(x - 40, 60);
    this.center = new THREE.Vector3(width / 2, maxH * 0.45, 0);
    const vis = 2 * Math.tan((app.engine.camera.fov * Math.PI) / 360);
    const dist = Math.max(maxH / (0.7 * vis), width / (0.9 * vis * app.engine.camera.aspect)) + 100;
    app.rig.maxDist = dist * 4;
    app.rig.minDist = 20;
    app.rig.maxTargetY = maxH * 1.2;
    app.rig.autoSpin = 0;
    app.rig.flyTo({ target: this.center, dist, az: 0, el: 0.12, duration: 1.2 });
    app.env.shadowRadius = Math.min(3000, Math.max(300, width));
    app.env.focus.copy(this.center).setY(0);
  }

  async _buildPhotos() {
    const app = this.app;
    for (const t of this.towers) {
      const h = towerHeight(t);
      const card = el('div', 'photo tap');
      const place = app.store.city(t.city)?.place || 'newcity';
      card.innerHTML = `<div class="h">${formatNumber(h)} <small>m</small></div>
        <div class="c">${icon('coin')}${formatNumber(t.coins || 0)}</div>
        ${place !== 'newcity' ? `<div class="place">${PLACE_ART[place]}</div>` : ''}`;
      this.grid.appendChild(card);
      onTapped(card, () => this._enlarge(card.querySelector('img')));
      idbGet('photo:' + t.id).then((blob) => {
        if (!blob || !this.ui) return;
        const url = URL.createObjectURL(blob);
        this.urls.push(url);
        const img = el('img');
        img.src = url;
        img.alt = '';
        card.insertBefore(img, card.firstChild);
      });
    }
  }

  _enlarge(img) {
    if (!img) return;
    const big = el('div', 'photo-big tap', `<img src="${img.src}" alt="">`);
    onTapped(big, () => big.remove());
    this.ui.appendChild(big);
    this.app.audio.click();
  }

  onTap(x, y) {
    if (this.tab !== 'skyline') return;
    const app = this.app;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / app.engine.width) * 2 - 1, -(y / app.engine.height) * 2 + 1), app.engine.camera);
    for (const s of this.slots) {
      if (s.tv.mesh && ray.intersectObject(s.tv.mesh, false).length) {
        const H = Math.max(s.h, 40);
        app.rig.flyTo({ target: s.tv.group.position.clone().setY(H * 0.5), dist: H * 1.9 + 120, duration: 1 });
        app.voice.say(`${formatNumber(Math.round(s.h))} metres!`);
        app.audio.click();
        return;
      }
    }
  }

  exit() {
    const app = this.app;
    for (const tv of this.views) tv.dispose();
    this.views = [];
    app.engine.scene.remove(this.group);
    app.city.group.visible = true;
    this.labels.clear();
    this.ui.remove();
    this.ui = null;
    for (const u of this.urls) URL.revokeObjectURL(u);
    app.cityLoaded = null;
  }

  update(dt) {
    const app = this.app;
    this.coins.update(dt);
    for (const tv of this.views) tv.update(dt);
    this.dayBtn.innerHTML = icon(app.env.isNight ? 'sun' : 'moon');
    this.dayBtn.className = `btn tap ${app.env.isNight ? 'yellow' : 'night'}`;
    this.labels.begin();
    if (this.tab === 'skyline') {
      for (const s of this.slots) {
        const pos = s.tv.group.position.clone().setY(s.h + Math.max(6, s.h * 0.03));
        this.labels.put('h:' + s.tv.tower.id, pos, app.engine.camera, app.engine.width, app.engine.height, {
          cls: 'label3d',
          html: `${formatNumber(s.h)} m`,
        });
      }
    }
    this.labels.end();
  }
}
