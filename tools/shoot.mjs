// Screenshot pages in headless Chromium at iPad mini landscape size.
// Usage: node tools/shoot.mjs <url-path> <out.png> [<url-path> <out.png> ...]
// Env: WAIT (ms, default 3000), BASE (default http://localhost:8080), TOUCH=1
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Use a local playwright if installed, otherwise the global one.
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(import.meta.url)(root + '/playwright');
  }
}
const { chromium } = await loadPlaywright();

const args = process.argv.slice(2);
const base = process.env.BASE || 'http://localhost:8080';
const wait = Number(process.env.WAIT || 3000);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (let i = 0; i + 1 < args.length; i += 2) {
  const [path, out] = [args[i], args[i + 1]];
  const page = await browser.newPage({
    viewport: { width: 1133, height: 744 },
    deviceScaleFactor: 1,
    hasTouch: !!process.env.TOUCH,
  });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + path, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: out });
  await page.close();
  const interesting = logs.filter((l) => !/GPU stall|useProgram|favicon|404/.test(l));
  if (interesting.length) console.log(interesting.slice(0, 30).join('\n').slice(0, 4000));
  console.log('saved', out);
}
await browser.close();
