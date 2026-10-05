// Writes the list of game files (and a version hash) into sw.js so the game can
// be saved for offline play. Run after changing any game file:
//   node tools/build-sw.mjs
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const include = ['index.html', 'manifest.webmanifest', 'src', 'vendor', 'assets'];
const files = [];
function walk(rel) {
  const abs = join(root, rel);
  if (statSync(abs).isDirectory()) {
    for (const f of readdirSync(abs).sort()) walk(join(rel, f));
  } else if (!/\.(md|DS_Store)$/.test(rel) && !rel.includes('LICENSE')) files.push(rel);
}
for (const p of include) walk(p);

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 10);

const swPath = join(root, 'sw.js');
let sw = readFileSync(swPath, 'utf8');
const list = ['./', ...files.map((f) => './' + f)].map((f) => `  '${f}',`).join('\n');
sw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = 'sky-city-${version}';`);
sw = sw.replace(/\/\/ FILES-START[\s\S]*\/\/ FILES-END/, `// FILES-START\nconst FILES = [\n${list}\n];\n// FILES-END`);
writeFileSync(swPath, sw);
console.log(`sw.js: ${files.length} files, version ${version}`);
