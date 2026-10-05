// Packs the whole game into ONE html page (game code and styles inlined, three.js
// loaded from the jsDelivr CDN) so it can be shared as a link for testing on a
// laptop, e.g. as a private Claude artifact.
//   node tools/build-single-page.mjs <out.html> [--local-three]
// --local-three uses ./vendor/three.module.min.js instead of the CDN (offline tests).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = resolve(process.argv[2] || 'louies-sky-city.html');
const localThree = process.argv.includes('--local-three');
const THREE_URL = localThree ? './vendor/three.module.min.js' : 'https://cdn.jsdelivr.net/npm/three@0.186.1/+esm';

// esbuild: use a local install if there is one, otherwise fetch it with npx.
const tmp = mkdtempSync(join(tmpdir(), 'skycity-'));
const bundle = join(tmp, 'game.js');
const local = join(root, 'node_modules/.bin/esbuild');
const esbuild = existsSync(local) ? local : 'npx --yes esbuild@0.25';
execSync(`${esbuild} ${join(root, 'src/main.js')} --bundle --format=esm --minify --external:three --target=es2020 --outfile=${bundle}`, {
  stdio: 'inherit',
});
let js = readFileSync(bundle, 'utf8');
js = js.replace(/from\s*"three"/g, `from"${THREE_URL}"`).replace(/import\s*"three"/g, `import"${THREE_URL}"`);
if (/["']three["']/.test(js)) throw new Error('an import of "three" was not rewritten');
js = js.replace(/<\/script/gi, '<\\/script');

const css = readFileSync(join(root, 'src/ui/styles.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const bodyInner = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="src\/main.js"><\/script>/, '')
  .trim();

const page = `<title>Louie's Sky City</title>
<meta name="description" content="Build skyscrapers all the way to space.">
<style>
:root { color-scheme: dark; }
${css}
</style>
${bodyInner}
<script>window.SKY_CITY_NO_SW = true;</script>
<script type="module">
${js}
</script>
`;
writeFileSync(out, page);
console.log(`wrote ${out} (${Math.round(page.length / 1024)} KB, three.js from ${THREE_URL})`);
