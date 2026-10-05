// Drives the game into special situations (very tall towers, space, night planets,
// the Moon) and screenshots them. Usage: node tools/scenarios.mjs <outDir> [names...]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const pw = createRequire(import.meta.url)(execSync('npm root -g').toString().trim() + '/playwright');
const out = process.argv[2] || 'scenarios';
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:8080';

const browser = await pw.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function newPage() {
  const page = await (await browser.newContext({ viewport: { width: 1133, height: 744 }, hasTouch: true })).newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && page.errors.push('console: ' + m.text()));
  await page.goto(base + '/?nosw', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return page;
}

// Start building in a fresh city of the given place, with plenty of coins.
async function build(page, place, recipe) {
  return page.evaluate(
    async ([place, recipe]) => {
      const app = window.__app;
      app.store.state.coins = 99999;
      for (const k of ['place:moon', 'place:mars']) app.store.state.unlocked[k] = true;
      for (const k of ['burj', 'taper', 'twist', 'damper', 'crown', 'antenna', 'dome', 'pyramid', 'bridge']) app.store.state.unlocked[k] = true;
      for (const k of ['piece', 'stretch', 'more', 'orbit']) app.store.state.tutorial[k] = true;
      const city = place === 'newcity' ? app.store.createCity() : app.store.premadeCity(place);
      app.openCity(city.id);
      const s = app.screen;
      if (s.mode !== 'build') s.startBuilding(null, { fly: false });
      const m = await import('/src/game/towerModel.js');
      let t = s.tower;
      for (const step of recipe) {
        if (step.add) t = m.addPart(t, step.add).tower;
        if (step.width) t = m.setPartWidth(t, step.width[0], step.width[1]);
        if (step.stretchTo) {
          const [i, h] = step.stretchTo;
          t = m.stretchPart(t, i, h - t.parts[i].h);
        }
        if (step.twin) t = m.setTwin(t, true);
      }
      s._commit(t);
      s._frameTower(false);
      app.rig.snap();
      return m.towerHeight(t);
    },
    [place, recipe],
  );
}

async function settle(page, ms = 2500) {
  await page.evaluate(() => window.__app.rig.snap());
  await page.waitForTimeout(ms);
}

const scenarios = {
  async km3(page) {
    const h = await build(page, 'newcity', [{ add: 'glass' }, { width: [0, 76] }, { stretchTo: [0, 900] }, { add: 'taper' }, { stretchTo: [1, 1600] }, { add: 'spire' }, { stretchTo: [2, 600] }]);
    await settle(page);
    return h;
  },
  async everest(page) {
    const h = await build(page, 'newcity', [{ add: 'glass' }, { width: [0, 76] }, { stretchTo: [0, 9200] }]);
    await settle(page);
    return h;
  },
  async space(page) {
    const h = await build(page, 'newcity', [{ add: 'glass' }, { width: [0, 76] }, { stretchTo: [0, 120000] }]);
    await settle(page, 3500);
    return h;
  },
  async iss(page) {
    const h = await build(page, 'newcity', [{ add: 'burj' }, { width: [0, 76] }, { stretchTo: [0, 405000] }]);
    await settle(page, 3500);
    return h;
  },
  async night(page) {
    const h = await build(page, 'dubai', [{ add: 'glass' }, { stretchTo: [0, 300] }, { add: 'crown' }]);
    await page.evaluate(() => {
      const app = window.__app;
      app.env.setPhase(0.8);
      app.rig.setGoal({ el: -0.05, dist: 900 });
    });
    await settle(page, 3000);
    // Tap the brightest planet we can see.
    const pos = await page.evaluate(() => {
      const app = window.__app;
      const THREE_v = app.env.bodies.find((b) => b.visible > 0.5);
      if (!THREE_v) return null;
      const v = THREE_v.mesh.getWorldPosition(THREE_v.mesh.position.clone());
      v.project(app.env.skyCamera);
      return { x: (v.x * 0.5 + 0.5) * app.engine.width, y: (-v.y * 0.5 + 0.5) * app.engine.height, id: THREE_v.id, z: v.z };
    });
    return { h, planet: pos };
  },
  async planet(page) {
    await page.evaluate(() => window.__app.planetView.show('jupiter'));
    await page.waitForTimeout(800);
    return 'jupiter';
  },
  async moon(page) {
    const h = await build(page, 'moon', [{ add: 'stone' }, { width: [0, 52] }, { stretchTo: [0, 400] }, { add: 'round' }, { add: 'antenna' }]);
    await page.evaluate(() => window.__app.rig.setGoal({ el: 0.1 }));
    await settle(page);
    return h;
  },
  async mars(page) {
    const h = await build(page, 'mars', [{ add: 'twist' }, { stretchTo: [0, 500] }, { add: 'dome' }]);
    await settle(page);
    return h;
  },
  async lift(page) {
    const h = await build(page, 'newcity', [{ add: 'glass' }, { stretchTo: [0, 500] }, { add: 'spire' }]);
    // Fast-forward the lift ride (headless rendering is far slower than an iPad).
    await page.evaluate(() => {
      const s = window.__app.screen;
      s.startLift();
      for (let i = 0; i < 25; i++) s._updateLift(0.2);
    });
    await page.waitForTimeout(1500);
    return h;
  },
  async newyork(page) {
    const h = await build(page, 'newyork', [{ add: 'stone' }, { stretchTo: [0, 200] }, { add: 'stone' }, { width: [1, 36] }, { add: 'crown' }]);
    await settle(page);
    return h;
  },
};

for (const [name, fn] of Object.entries(scenarios)) {
  if (only.length && !only.includes(name)) continue;
  const page = await newPage();
  try {
    const info = await fn(page);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(name, JSON.stringify(info), page.errors.slice(0, 5).join(' | '));
  } catch (e) {
    console.log(name, 'FAILED', e.message, page.errors.slice(0, 5).join(' | '));
  }
  await page.close();
}
await browser.close();
