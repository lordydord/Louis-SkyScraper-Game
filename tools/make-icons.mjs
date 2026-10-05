// Draws the app icon (SVG) and saves PNGs for the iPad Home Screen.
//   node tools/make-icons.mjs
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const pw = createRequire(import.meta.url)(execSync('npm root -g').toString().trim() + '/playwright');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1d44"/><stop offset=".55" stop-color="#2b4f9e"/><stop offset="1" stop-color="#ff9f5a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#ffc93c"/><stop offset="1" stop-color="#e09612"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#bfe0ff"/><stop offset="1" stop-color="#6f9fd8"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <circle cx="390" cy="110" r="38" fill="#fff4cf"/>
  <circle cx="404" cy="98" r="34" fill="#16295a"/>
  <g fill="#fff">
    <circle cx="90" cy="80" r="4"/><circle cx="150" cy="140" r="3"/><circle cx="60" cy="190" r="3"/>
    <circle cx="310" cy="60" r="3"/><circle cx="460" cy="200" r="4"/><circle cx="200" cy="50" r="3"/>
  </g>
  <path d="M90 512V300h70v212z" fill="url(#glass)" opacity=".9"/>
  <path d="M352 512V250h74v262z" fill="url(#glass)" opacity=".9"/>
  <path d="M186 512V380h20V300h18V200h14V120l18-70 18 70v80h14v100h18v80h20v132z" fill="url(#gold)" stroke="#8a4b00" stroke-width="6" stroke-linejoin="round"/>
  <g fill="#fff6d0" opacity=".9">
    <rect x="240" y="150" width="8" height="30"/><rect x="264" y="150" width="8" height="30"/>
    <rect x="232" y="230" width="10" height="40"/><rect x="270" y="230" width="10" height="40"/>
    <rect x="216" y="330" width="12" height="40"/><rect x="284" y="330" width="12" height="40"/>
  </g>
  <rect y="470" width="512" height="42" fill="#2b3f66"/>
</svg>`;

writeFileSync(root + 'assets/icons/icon.svg', svg);
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `${root}assets/icons/icon-${size}.png` });
  console.log('icon', size);
}
await browser.close();
