import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newTower,
  addPart,
  stretchPart,
  setPartWidth,
  towerHeight,
  layout,
  spiralBlock,
  freePlot,
  floorsOf,
} from '../src/game/towerModel.js';
import { computeWobble, wobbleLevel } from '../src/game/physics.js';
import { finishCoins, bubbleCoins } from '../src/game/economy.js';
import { Store, defaultState } from '../src/game/store.js';
import { WORLDS } from '../src/data/places.js';
import { MAX_HEIGHT, FLOOR_H, SAVE_KEY } from '../src/config.js';
import { formatNumber } from '../src/util/format.js';
import { milestoneFor } from '../src/data/landmarks.js';

const EARTH = WORLDS.earth;

function build(steps, twin = false) {
  let t = { ...newTower({ id: 't', city: 'c', plot: [0, 0] }), twin };
  for (const s of steps) {
    if (typeof s === 'string') t = addPart(t, s).tower;
    else t = s(t);
  }
  return t;
}

function uniform(width, height) {
  let t = build(['glass']);
  t = setPartWidth(t, 0, width);
  return stretchPart(t, 0, height - towerHeight(t));
}

test('sections stack and snap to whole floors', () => {
  const t = build(['glass', 'stone']);
  assert.equal(t.parts.length, 2);
  assert.equal(towerHeight(t), 20 * FLOOR_H);
  const s = stretchPart(t, 1, 10.7);
  assert.equal(s.parts[1].h % FLOOR_H, 0);
  assert.equal(towerHeight(s), 20 * FLOOR_H + 12);
  assert.equal(floorsOf(s), 23);
});

test('new sections go under the topper, and a new topper replaces the old one', () => {
  let t = build(['glass', 'spire']);
  const r = addPart(t, 'stone');
  assert.equal(r.index, 1);
  assert.deepEqual(
    r.tower.parts.map((p) => p.t),
    ['glass', 'stone', 'spire'],
  );
  t = addPart(r.tower, 'dome').tower;
  assert.deepEqual(
    t.parts.map((p) => p.t),
    ['glass', 'stone', 'dome'],
  );
});

test('burj sections step in automatically', () => {
  const t = build(['burj', 'burj', 'burj']);
  const w = t.parts.map((p) => p.w);
  assert.ok(w[1] < w[0] && w[2] < w[1]);
});

test('taper sections continue from the narrower top', () => {
  const t = build(['taper', 'glass']);
  const lay = layout(t);
  assert.ok(Math.abs(lay[1].w - lay[0].topW) < 0.2);
});

test('fixed toppers follow the roof width', () => {
  let t = build(['glass', 'dome']);
  const h1 = t.parts[1].h;
  t = setPartWidth(t, 0, 76);
  assert.ok(t.parts[1].h > h1);
});

test('towers never pass the height limit', () => {
  let t = build(['glass']);
  t = stretchPart(t, 0, 10_000_000);
  assert.ok(towerHeight(t) <= MAX_HEIGHT);
  const more = addPart(t, 'glass');
  assert.ok(more === null || towerHeight(more.tower) <= MAX_HEIGHT);
  const top = addPart(t, 'spire');
  assert.ok(towerHeight(top.tower) <= MAX_HEIGHT);
});

test('wobble: wide short towers are steady, thin tall ones wobble', () => {
  assert.equal(wobbleLevel(computeWobble(build(['glass']), EARTH).value), 0);
  assert.equal(wobbleLevel(computeWobble(uniform(36, 400), EARTH).value), 0);
  assert.equal(wobbleLevel(computeWobble(uniform(24, 600), EARTH).value), 2);
});

test('wobble: a Burj-style tapering tower is steady', () => {
  let t = build(['glass']);
  t = setPartWidth(t, 0, 76);
  t = stretchPart(t, 0, 100 - towerHeight(t));
  for (let i = 0; i < 9; i++) t = addPart(t, 'burj').tower;
  t = addPart(t, 'spire').tower;
  t = stretchPart(t, t.parts.length - 1, 228 - t.parts[t.parts.length - 1].h);
  const w = computeWobble(t, EARTH);
  assert.ok(w.H > 700, `height ${w.H}`);
  assert.equal(wobbleLevel(w.value), 0, `wobble ${w.value}`);
  assert.ok(w.period > 6 && w.period <= 12);
});

test('wobble: a damper calms a pencil tower, bridges brace twins', () => {
  const pencil = uniform(18, 436);
  const plain = computeWobble(pencil, EARTH).value;
  const withDamper = computeWobble(addPart(pencil, 'damper').tower, EARTH).value;
  assert.ok(withDamper < plain);

  const twins = { ...uniform(24, 500), twin: true };
  const bridged = addPart(twins, 'bridge').tower;
  assert.ok(computeWobble(bridged, EARTH).value < computeWobble(twins, EARTH).value);
});

test('wobble: the Moon (no wind, low gravity) is far steadier than Earth', () => {
  const t = uniform(24, 2000);
  const earth = computeWobble(t, WORLDS.earth).value;
  const mars = computeWobble(t, WORLDS.mars).value;
  const moon = computeWobble(t, WORLDS.moon).value;
  assert.ok(moon < mars && mars < earth, `${moon} ${mars} ${earth}`);
  assert.equal(computeWobble(t, WORLDS.moon).sway, 0);
});

test('coins: taller towers pay more', () => {
  const hs = [40, 150, 828, 1000, 10_000, 100_000, 400_000];
  const c = hs.map(finishCoins);
  for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1], `${hs[i]} -> ${c[i]}`);
  assert.equal(finishCoins(0), 0);
  assert.ok(bubbleCoins(40) >= 5);
});

test('city plots spiral outwards and skip reserved blocks', () => {
  assert.deepEqual(spiralBlock(0), [0, 0]);
  const seen = new Set();
  for (let i = 0; i < 49; i++) seen.add(spiralBlock(i).join(','));
  assert.equal(seen.size, 49);
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) assert.ok(seen.has(`${x},${z}`));
  assert.deepEqual(freePlot(0, [[0, 0]]), [1, 0]);
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('store: towers, coins, unlocks and saving', () => {
  const storage = memoryStorage();
  const s = new Store(storage);
  assert.equal(s.coins, 0);
  assert.ok(s.isUnlocked('glass'));
  assert.ok(!s.isUnlocked('crown'));
  assert.ok(s.isUnlocked('place:dubai'));
  assert.ok(!s.isUnlocked('place:moon'));

  const city = s.createCity();
  const t1 = s.startTower(city.id);
  assert.deepEqual(t1.plot, [0, 0]);
  s.finishTower(t1.id, 300);
  assert.equal(s.coins, 300);
  const t2 = s.startTower(city.id);
  assert.deepEqual(t2.plot, [1, 0]);

  assert.equal(s.unlock('crown', 200), true);
  assert.equal(s.coins, 100);
  assert.equal(s.unlock('place:moon', 800), false);
  s.save();

  const again = new Store(storage);
  assert.equal(again.coins, 100);
  assert.ok(again.isUnlocked('crown'));
  assert.equal(again.cityTowers(city.id).length, 2);
  assert.equal(again.unfinishedTower(city.id).id, t2.id);

  const dubai = again.premadeCity('dubai');
  const d1 = again.startTower(dubai.id, [[0, 0]]);
  assert.deepEqual(d1.plot, [1, 0]);
});

test('store: survives a corrupt save', () => {
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, '{not json');
  const s = new Store(storage);
  assert.deepEqual(Object.keys(s.state).sort(), Object.keys(defaultState()).sort());
});

test('number formatting and milestones', () => {
  assert.equal(formatNumber(828), '828');
  assert.equal(formatNumber(1250), '1,250');
  assert.equal(formatNumber(400000), '400,000');
  assert.equal(milestoneFor(90, 130), 100);
  assert.equal(milestoneFor(950, 2100), 2000);
  assert.equal(milestoneFor(120, 150), null);
});
