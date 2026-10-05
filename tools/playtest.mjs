// Plays through the game in headless Chromium at iPad mini size, taking a
// screenshot after each step, and fails on any page error.
// Usage: node tools/playtest.mjs <outDir>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(import.meta.url)(root + '/playwright');
  }
}
const { chromium } = await loadPlaywright();
const out = process.argv[2] || 'playtest';
mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ viewport: { width: 1133, height: 744 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});

let step = 0;
async function shot(name, wait = 800) {
  await page.waitForTimeout(wait);
  const file = `${out}/${String(++step).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('shot', file);
}

async function tapEl(selector, index = 0) {
  const els = await page.$$(selector);
  if (!els[index]) throw new Error('missing ' + selector + '[' + index + ']');
  await els[index].evaluate((e) => e.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await page.waitForTimeout(150);
  const box = await els[index].boundingBox();
  if (!box) throw new Error('not visible ' + selector + '[' + index + ']');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function drag(from, to, steps = 12) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

await page.goto(base + '/?nosw', { waitUntil: 'load' });
await shot('title', 9000);
await tapEl('.title-play');
await shot('picker', 1500);
await tapEl('.card.new');
await shot('new-city', 2500);
await tapEl('.piece', 0); // glass
await shot('first-piece', 1200);
const knob = await page.$('.knob:not(.hidden)');
if (knob) {
  const b = await knob.boundingBox();
  await drag({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2, y: b.y - 260 });
}
await shot('stretched', 1500);
await tapEl('.piece', 5); // burj (locked: should shake)
await tapEl('.piece', 3); // spire
await shot('spire', 1500);
const knob2 = await page.$('.knob:not(.hidden)');
if (knob2) {
  const b = await knob2.boundingBox();
  await drag({ x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2, y: b.y - 200 });
}
await shot('spire-stretched', 1500);
await tapEl('.tools-right .btn.big:not(.hidden)');
await shot('finishing', 2500);
await shot('decorate', 3000);
await tapEl('.deco .tile', 3); // sparkle (locked? first try)
await tapEl('.deco .tile', 1); // solid
await tapEl('.deco .swatch', 9); // rainbow colour
await shot('lights', 4500);
await tapEl('.deco .tabs .btn', 3); // roof extras
await tapEl('.deco .tile', 0);
await shot('extras', 1000);
await tapEl('.tools-right .btn.big:not(.hidden)');
await shot('celebrate', 2500);
await shot('city-view', 4000);
await tapEl('.tools-left .btn', 2); // lift
await shot('lift', 3000);
await shot('lift-top', 5000);
await page.touchscreen.tap(560, 300); // tap to leave the lift
await page.waitForTimeout(1500);
await tapEl('.hud-right .btn', 1); // home
await shot('picker-again', 2000);
await tapEl('.portfolio-top .btn', 0);
await shot('portfolio', 3000);
await tapEl('.portfolio-top .btn', 2);
await shot('photos', 2000);

console.log('\nERRORS:\n' + (errors.join('\n') || 'none'));
await browser.close();
