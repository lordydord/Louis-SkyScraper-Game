// Second play-through: twin towers, sky bridge, undo, sizes, selecting a section,
// coin bubbles, unlocking the Moon, and tapping a planet. Checks game state as it
// goes and prints PASS/FAIL lines. Usage: node tools/playtest2.mjs <outDir>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const pw = createRequire(import.meta.url)(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] || 'playtest2';
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:8080';
const browser = await pw.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 1133, height: 744 }, hasTouch: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n')[1]));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push('console: ' + m.text()));

let failures = 0;
function check(name, ok, info = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`);
  if (!ok) failures++;
}
const state = (fn) => page.evaluate(fn);
async function tapEl(selector, index = 0) {
  const els = await page.$$(selector);
  if (!els[index]) throw new Error('missing ' + selector + '[' + index + ']');
  await els[index].evaluate((e) => e.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await page.waitForTimeout(150);
  const box = await els[index].boundingBox();
  if (!box) throw new Error('not visible ' + selector + '[' + index + ']');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
}
const pieceIndex = (id) => page.evaluate(async (id) => (await import('/src/data/pieces.js')).INVENTORY.indexOf(id), id);

await page.goto(base + '/?nosw', { waitUntil: 'load' });
await page.waitForTimeout(9000);
await tapEl('.title-play');
await page.waitForTimeout(800);
// Skip the tutorial and give some coins.
await state(() => {
  const s = window.__app.store;
  for (const k of ['piece', 'stretch', 'more', 'orbit', 'lights', 'bubble']) s.state.tutorial[k] = true;
  s.state.coins = 1000;
});
await tapEl('.card.new');
await page.waitForTimeout(2500);

// Build: glass, twin on, bridge, glass.
await tapEl('.piece', await pieceIndex('glass'));
await tapEl('.twin-toggle');
let t = await state(() => window.__app.screen.tower);
check('twin toggles on', t.twin === true);
await tapEl('.piece', await pieceIndex('bridge')); // locked: buys it
await tapEl('.piece', await pieceIndex('bridge'));
await tapEl('.piece', await pieceIndex('glass'));
t = await state(() => window.__app.screen.tower);
check('twin + bridge + glass stacked', t.parts.map((p) => p.t).join(',') === 'glass,bridge,glass', t.parts.map((p) => p.t).join(','));
await page.screenshot({ path: `${out}/01-twins.png` });

// Size: make the top section the widest.
await tapEl('.size', 3);
t = await state(() => window.__app.screen.tower);
check('size changes the selected (top) section', t.parts[2].w === 76, 'w=' + t.parts[2].w);

// Undo it.
await tapEl('.tools-right .btn', 0);
t = await state(() => window.__app.screen.tower);
check('undo restores width', t.parts[2].w !== 76, 'w=' + t.parts[2].w);

// Tap the bottom of the tower on screen to select the first section.
const bottom = await state(() => {
  const app = window.__app;
  const s = app.screen;
  const p = s.tv.group.position.clone();
  p.x -= 30;
  p.y = 12;
  p.project(app.engine.camera);
  return { x: (p.x * 0.5 + 0.5) * app.engine.width, y: (-p.y * 0.5 + 0.5) * app.engine.height };
});
await page.touchscreen.tap(bottom.x, bottom.y);
await page.waitForTimeout(400);
const sel = await state(() => window.__app.screen.selected);
check('tapping the tower selects a section', sel === 0, 'selected=' + sel);
await page.screenshot({ path: `${out}/02-selected.png` });

// Wobble: a thin, very tall single tower goes red.
await state(async () => {
  const s = window.__app.screen;
  const m = await import('/src/game/towerModel.js');
  let tw = m.setTwin(s.tower, false);
  tw = { ...tw, parts: [{ t: 'glass', w: 24, h: 700 }] };
  s._commit(m.normalize(tw));
});
await page.waitForTimeout(500);
const wob = await state(() => window.__app.screen.tv.wobble.value);
check('thin 700 m tower is very wobbly', wob > 1, wob.toFixed(2));
const glowing = await page.$$eval('.size.glow', (e) => e.length);
check('wide size glows as a hint', glowing === 1);
await page.screenshot({ path: `${out}/03-wobbly.png` });

// Finish and complete quickly.
await tapEl('.tools-right .btn.big:not(.hidden)');
await page.waitForTimeout(6000);
check('decorate mode', (await state(() => window.__app.screen.mode)) === 'decorate');
const coinsBefore = await state(() => window.__app.store.coins);
await tapEl('.tools-right .btn.big:not(.hidden)');
await page.waitForTimeout(1500);
const coinsAfter = await state(() => window.__app.store.coins);
check('finishing pays coins', coinsAfter > coinsBefore, `${coinsBefore} -> ${coinsAfter}`);

// Coin bubble: make it appear now and tap it.
await page.waitForTimeout(3000);
await state(() => {
  const s = window.__app.screen;
  for (const b of s.bubbles.values()) b.at = 0;
});
await page.waitForTimeout(1500);
const bubble = await page.$('.bubble');
check('coin bubble appears', !!bubble);
if (bubble) {
  const c0 = await state(() => window.__app.store.coins);
  const bb = await bubble.boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(500);
  const c1 = await state(() => window.__app.store.coins);
  check('tapping a bubble gives coins', c1 > c0, `${c0} -> ${c1}`);
}
await page.screenshot({ path: `${out}/04-bubble.png` });

// Night: tap the Moon in the sky.
await state(() => {
  const app = window.__app;
  app.env.setPhase(0.8);
  app.rig.setGoal({ el: -0.2 });
  app.rig.snap();
});
await page.waitForTimeout(2500);
const moon = await state(() => {
  const app = window.__app;
  app.rig.apply();
  app.env._syncCamera(app.env.skyCamera, app.engine.camera);
  for (const b of app.env.bodies) {
    if (b.visible < 0.4) continue;
    const v = b.mesh.getWorldPosition(b.mesh.position.clone()).project(app.env.skyCamera);
    const x = (v.x * 0.5 + 0.5) * app.engine.width;
    const y = (-v.y * 0.5 + 0.5) * app.engine.height;
    if (v.z < 1 && x > 80 && x < app.engine.width - 80 && y > 120 && y < app.engine.height - 160) return { x, y, id: b.id };
  }
  return null;
});
if (moon) {
  await page.touchscreen.tap(moon.x, moon.y);
  await page.waitForTimeout(1200);
  check('tapping a sky object opens the planet view', !!(await page.$('.planet-view')), moon.id);
  await page.screenshot({ path: `${out}/05-planet.png` });
  await tapEl('.planet-view .close');
} else console.log('SKIP no sky object on screen');

// Home, unlock the Moon, open it.
await tapEl('.hud-right .btn', 1);
await page.waitForTimeout(1500);
await state(() => (window.__app.store.state.coins = 5000));
await tapEl('.card-row:nth-child(2) .card', 2);
await page.waitForTimeout(4000);
const place = await state(() => window.__app.screen.cityData?.place);
check('Moon unlocks and opens', place === 'moon', place);
await page.screenshot({ path: `${out}/06-moon.png` });

console.log('\nERRORS:\n' + (errors.join('\n') || 'none'));
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
await browser.close();
