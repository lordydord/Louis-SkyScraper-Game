// Saved game state, kept in localStorage (persistent for Home Screen web apps).
// Plain JSON so it's easy to migrate later.

import { SAVE_KEY } from '../config.js';
import { PIECES, LIGHT_PRICES, EXTRAS } from '../data/pieces.js';
import { PLACES } from '../data/places.js';
import { newTower, freePlot } from './towerModel.js';
import { uid, hashString } from '../util/math.js';

const VERSION = 1;

export function defaultState() {
  const unlocked = {};
  for (const [id, p] of Object.entries(PIECES)) if (!p.price) unlocked[id] = true;
  for (const [id, price] of Object.entries(LIGHT_PRICES)) if (!price) unlocked['light:' + id] = true;
  for (const [id, e] of Object.entries(EXTRAS)) if (!e.price) unlocked['extra:' + id] = true;
  for (const [id, p] of Object.entries(PLACES)) if (!p.price) unlocked['place:' + id] = true;
  return {
    v: VERSION,
    coins: 0,
    unlocked,
    cities: [],
    towers: {},
    settings: { sound: true, music: true, voice: true },
    tutorial: {},
    passed: {},
    lastCity: null,
  };
}

function migrate(s) {
  const d = defaultState();
  if (!s || typeof s !== 'object') return d;
  // Fill in anything added since the save was written.
  const out = { ...d, ...s };
  out.unlocked = { ...d.unlocked, ...(s.unlocked || {}) };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.tutorial = { ...(s.tutorial || {}) };
  out.passed = { ...(s.passed || {}) };
  out.cities = Array.isArray(s.cities) ? s.cities : [];
  out.towers = s.towers && typeof s.towers === 'object' ? s.towers : {};
  out.v = VERSION;
  return out;
}

export class Store {
  constructor(storage) {
    this.storage = storage;
    this.listeners = new Set();
    this._timer = null;
    this.state = this.load();
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(SAVE_KEY);
      return raw ? migrate(JSON.parse(raw)) : defaultState();
    } catch (e) {
      console.warn('Could not load save', e);
      return defaultState();
    }
  }

  save() {
    clearTimeout(this._timer);
    this._timer = null;
    try {
      if (this.storage) this.storage.setItem(SAVE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Could not save', e);
    }
  }

  saveSoon() {
    if (this._timer) return;
    this._timer = setTimeout(() => this.save(), 400);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(what) {
    for (const fn of this.listeners) fn(what);
  }

  // ---- coins and unlocks ----

  get coins() {
    return this.state.coins;
  }

  addCoins(n) {
    this.state.coins += Math.round(n);
    this.saveSoon();
    this.emit('coins');
  }

  isUnlocked(key) {
    return !!this.state.unlocked[key];
  }

  // Returns true if unlocked (or already was), false if not enough coins.
  unlock(key, price) {
    if (this.isUnlocked(key)) return true;
    if (this.state.coins < price) return false;
    this.state.coins -= price;
    this.state.unlocked[key] = true;
    this.save();
    this.emit('coins');
    this.emit('unlocked');
    return true;
  }

  setting(key, value) {
    if (value === undefined) return this.state.settings[key];
    this.state.settings[key] = value;
    this.saveSoon();
    this.emit('settings');
    return value;
  }

  tutorialDone(step) {
    return !!this.state.tutorial[step];
  }

  markTutorial(step) {
    if (this.state.tutorial[step]) return;
    this.state.tutorial[step] = true;
    this.saveSoon();
  }

  // ---- cities ----

  city(id) {
    return this.state.cities.find((c) => c.id === id) || null;
  }

  // Louie's own new cities, newest first.
  ownCities() {
    return this.state.cities.filter((c) => c.place === 'newcity').sort((a, b) => b.created - a.created);
  }

  createCity() {
    const id = uid('c');
    const city = { id, place: 'newcity', seed: hashString(id), created: Date.now(), towers: [] };
    this.state.cities.push(city);
    this.save();
    return city;
  }

  // Pre-made places (Dubai, New York, Moon, Mars) have one city each.
  premadeCity(place) {
    let city = this.city(place);
    if (!city) {
      city = { id: place, place, seed: hashString(place), created: Date.now(), towers: [] };
      this.state.cities.push(city);
      this.save();
    }
    return city;
  }

  cityTowers(cityId) {
    const city = this.city(cityId);
    if (!city) return [];
    return city.towers.map((id) => this.state.towers[id]).filter(Boolean);
  }

  unfinishedTower(cityId) {
    return this.cityTowers(cityId).find((t) => !t.done) || null;
  }

  // Start a tower on the next free plot. `reserved` blocks belong to landmarks/water.
  startTower(cityId, reserved = []) {
    const city = this.city(cityId);
    const used = new Set(this.cityTowers(cityId).map((t) => t.plot.join(',')));
    let plot = null;
    for (let n = 0; n < 2000 && !plot; n++) {
      const p = freePlot(n, reserved);
      if (!used.has(p.join(','))) plot = p;
    }
    const tower = newTower({ id: uid('t'), city: cityId, plot });
    this.state.towers[tower.id] = tower;
    city.towers.push(tower.id);
    this.save();
    return tower;
  }

  putTower(tower) {
    this.state.towers[tower.id] = tower;
    this.saveSoon();
  }

  removeTower(id) {
    const t = this.state.towers[id];
    if (!t) return;
    delete this.state.towers[id];
    const city = this.city(t.city);
    if (city) city.towers = city.towers.filter((x) => x !== id);
    this.save();
  }

  finishTower(id, coins) {
    const t = this.state.towers[id];
    if (!t) return;
    t.done = true;
    t.coins = coins;
    t.finished = Date.now();
    this.state.coins += coins;
    this.save();
    this.emit('coins');
  }

  finishedTowers() {
    return Object.values(this.state.towers).filter((t) => t.done);
  }

  markPassed(key) {
    const first = !this.state.passed[key];
    this.state.passed[key] = true;
    if (first) this.saveSoon();
    return first;
  }
}
