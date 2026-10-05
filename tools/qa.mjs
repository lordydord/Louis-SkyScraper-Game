// Quality-control helpers: load the game in headless Chromium at iPad mini size,
// set up situations quickly, step animations and take screenshots.
//   node tools/qa.mjs <outDir> <check> [<check> ...]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const pw = createRequire(import.meta.url)(execSync('npm root -g').toString().trim() + '/playwright');
const [out = 'qa', ...checks] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:8080';
const W = Number(process.env.W || 1133);
const H = Number(process.env.H || 744);

const browser = await pw.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open() {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true })).newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && page.errors.push('console: ' + m.text()));
  await page.goto(base + '/?nosw', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('splash')?.classList.contains('gone'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return page;
}

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
}

// Open a city and build a tower from a recipe (skipping the tutorial).
async function build(page, place, recipe) {
  return page.evaluate(
    async ([place, recipe]) => {
      const app = window.__app;
      const st = app.store.state;
      st.coins = 5000;
      for (const k of ['place:moon', 'place:mars', 'burj', 'taper', 'twist', 'damper', 'crown', 'antenna', 'dome', 'pyramid', 'bridge']) st.unlocked[k] = true;
      for (const k of ['piece', 'stretch', 'more', 'orbit']) st.tutorial[k] = true;
      const city = place === 'newcity' ? app.store.createCity() : app.store.premadeCity(place);
      app.openCity(city.id);
      const s = app.screen;
      if (s.mode !== 'build') s.startBuilding(null, { fly: false });
      const m = await import('/src/game/towerModel.js');
      let t = s.tower;
      for (const step of recipe) {
        if (step.add) t = m.addPart(t, step.add).tower;
        if (step.width) t = m.setPartWidth(t, step.width[0], step.width[1]);
        if (step.stretchTo) t = m.stretchPart(t, step.stretchTo[0], step.stretchTo[1] - t.parts[step.stretchTo[0]].h);
        if (step.twin) t = m.setTwin(t, true);
      }
      s._commit(t, { progress: false });
      s._frameTower(false);
      app.rig.snap();
      return m.towerHeight(t);
    },
    [place, recipe],
  );
}

async function tapEl(page, selector, index = 0) {
  const els = await page.$$(selector);
  if (!els[index]) throw new Error('missing ' + selector + '[' + index + ']');
  await els[index].evaluate((e) => e.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await page.waitForTimeout(120);
  const b = await els[index].boundingBox();
  if (!b) throw new Error('not visible ' + selector + '[' + index + ']');
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
}

async function dragKnob(page, dy) {
  const k = await page.$('.knob:not(.hidden)');
  if (!k) return false;
  const b = await k.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x, y + (dy * i) / 10);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  return true;
}

const handAt = (page) =>
  page.evaluate(() => {
    const h = document.querySelector('.hand');
    if (!h || h.classList.contains('hidden') || h.style.display === 'none') return null;
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.left + 23), y: Math.round(r.top + 6), mode: [...h.classList].find((c) => c.startsWith('h-')) };
  });

const CHECKS = {
  // A brand-new player, doing what the pointing hand shows.
  async firstrun(page) {
    const log = [];
    await shot(page, 'fr-01-title');
    await tapEl(page, '.title-play');
    await shot(page, 'fr-02-menu');
    await tapEl(page, '.card.new');
    await page.waitForTimeout(1500);
    await shot(page, 'fr-03-site');
    log.push(['site', await handAt(page)]);
    await tapEl(page, '.piece', 0);
    await page.waitForTimeout(900);
    await shot(page, 'fr-04-first-piece');
    log.push(['after piece', await handAt(page)]);
    await dragKnob(page, -220);
    await page.waitForTimeout(1200);
    await shot(page, 'fr-05-stretched');
    log.push(['after stretch', await handAt(page)]);
    const spire = await page.evaluate(async () => (await import('/src/data/pieces.js')).INVENTORY.indexOf('spire'));
    await tapEl(page, '.piece', spire);
    await page.waitForTimeout(900);
    await shot(page, 'fr-06-spire');
    log.push(['after spire', await handAt(page)]);
    // Spin the camera like the hand shows.
    await page.mouse.move(700, 330);
    await page.mouse.down();
    await page.mouse.move(520, 330, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await shot(page, 'fr-07-spun');
    log.push(['after spin', await handAt(page)]);
    log.push(['finish glows', await page.$eval('.tools-right .btn.big:not(.hidden)', (e) => e.classList.contains('glow'))]);
    await tapEl(page, '.tools-right .btn.big:not(.hidden)');
    await page.waitForTimeout(2500);
    await shot(page, 'fr-08-finishing');
    await page.waitForFunction(() => window.__app.screen.mode === 'decorate', null, { timeout: 30000 });
    await page.waitForTimeout(600);
    await shot(page, 'fr-09-decorate');
    log.push(['decorate', await handAt(page)]);
    await tapEl(page, '.deco .tile', 1);
    await page.waitForTimeout(1500);
    await shot(page, 'fr-10-lights');
    log.push(['after lights', await handAt(page)]);
    await tapEl(page, '.tools-right .btn.big:not(.hidden)');
    await page.waitForTimeout(3500);
    await shot(page, 'fr-11-done');
    await page.waitForFunction(() => window.__app.screen.mode === 'view', null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await shot(page, 'fr-12-city');
    log.push(['coins', await page.evaluate(() => window.__app.store.coins)]);
    return log;
  },

  async lift(page) {
    await build(page, 'newcity', [{ add: 'stone' }, { width: [0, 52] }, { stretchTo: [0, 160] }, { add: 'burj' }, { add: 'burj' }, { add: 'burj' }, { add: 'spire' }]);
    await shot(page, 'lift-0-before');
    return rideLift(page, 'lift', [0.12, 0.35, 0.6, 0.85]);
  },

  // A tower that reaches into space.
  async tallLift(page) {
    const h = await build(page, 'newcity', [{ add: 'glass' }, { width: [0, 76] }, { stretchTo: [0, 30000] }, { add: 'spire' }]);
    await shot(page, 'tall-0-before');
    return { h, ...(await rideLift(page, 'tall', [0.2, 0.5, 0.8, 0.95])) };
  },

  async twinLift(page) {
    await build(page, 'newcity', [{ add: 'glass' }, { stretchTo: [0, 200] }, { add: 'bridge' }, { add: 'glass' }, { stretchTo: [2, 120] }, { add: 'spire' }, { twin: true }]);
    await shot(page, 'twin-0-before');
    return rideLift(page, 'twin', [0.4, 0.8]);
  },

  // The see-through famous buildings at different tower heights.
  async ghosts(page) {
    const out = {};
    for (const h of [40, 120, 136, 250, 300]) {
      await build(page, 'newcity', [{ add: 'glass' }, { stretchTo: [0, h] }]);
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) window.__app.ghosts.update(0.25, window.__app.engine.camera);
      });
      await shot(page, `ghost-${h}`);
      out[h] = await page.evaluate(() => {
        const s = window.__app.ghosts.slots.target;
        return s ? `${s.lm.key} ${s.fade.toFixed(2)}` : null;
      });
    }
    return out;
  },

  async places(page) {
    for (const place of ['dubai', 'newyork', 'moon', 'mars']) {
      await build(page, place, [{ add: 'round' }, { stretchTo: [0, 150] }, { add: 'dome' }]);
      await shot(page, `place-${place}`);
    }
    return 'ok';
  },

  // A finished city at night, then the portfolio.
  async night(page) {
    await build(page, 'newyork', [{ add: 'glass' }, { stretchTo: [0, 300] }, { add: 'antenna' }]);
    await page.evaluate(() => window.__app.screen.finishBuilding());
    await page.waitForFunction(() => window.__app.screen.mode === 'decorate', null, { timeout: 30000 });
    await page.evaluate(() => window.__app.screen.completeTower());
    await page.waitForFunction(() => window.__app.screen.mode === 'view', null, { timeout: 30000 });
    await page.evaluate(() => {
      const env = window.__app.env;
      env.setPhase(0.8);
      env._envAge = 99; // refresh the reflections now (the test browser is slow)
    });
    await page.waitForTimeout(2500);
    await shot(page, 'night-city');
    return page.evaluate(() => ({ hand: !document.querySelector('.hand').classList.contains('hidden'), mode: window.__app.screen.mode }));
  },
};

// Ride the lift, stopping at each fraction of the way up for a picture, then the
// reveal and the way back.
async function rideLift(page, name, fractions) {
  await page.evaluate(() => window.__app.screen.startLift());
  const info = { dur: await page.evaluate(() => window.__app.screen.ride.dur) };
  for (const [i, f] of fractions.entries()) {
    await page.evaluate((f) => {
      const s = window.__app.screen;
      s._updateLift(f * s.ride.dur - s.ride.t * s.ride.dur);
    }, f);
    info[f] = await page.evaluate(() => window.__app.screen.centerNum.textContent);
    await shot(page, `${name}-${i + 1}-at-${Math.round(f * 100)}`);
  }
  await page.evaluate(() => {
    const s = window.__app.screen;
    s._updateLift(s.ride.dur);
    window.__app.rig.update(5);
  });
  await shot(page, `${name}-5-reveal`);
  info.modeAfter = await page.evaluate(() => {
    const s = window.__app.screen;
    s._updateLift(4);
    return s.mode;
  });
  info.crane = await page.evaluate(() => window.__app.screen.tv?.crane?.visible ?? null);
  await shot(page, `${name}-6-back`);
  return info;
}

for (const name of checks) {
  const page = await open();
  try {
    const info = await CHECKS[name](page);
    console.log(name, JSON.stringify(info), page.errors.slice(0, 6).join(' | ') || 'no errors');
  } catch (e) {
    console.log(name, 'FAILED', e.message, page.errors.slice(0, 6).join(' | '));
  }
  await page.close();
}
await browser.close();
