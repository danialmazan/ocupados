import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = new URL('../dist/', import.meta.url);
const assets = new URL('assets/', root);
const files = readdirSync(assets);
const sum = (names, compressed = true) => names.reduce((n, name) => {
  const body = readFileSync(new URL(name, assets));
  return n + (compressed ? gzipSync(body).length : body.length);
}, 0);
const js = sum(files.filter(f => f.endsWith('.js')));
const css = sum(files.filter(f => f.endsWith('.css')));
const fonts = sum(files.filter(f => /-normal.*\.woff2$/.test(f)), false);
const data = gzipSync(readFileSync(new URL('data/employment.json', root))).length;
const initial = js + css + fonts + data + gzipSync(readFileSync(new URL('index.html', root))).length;
const result = { jsGzipBytes: js, cssGzipBytes: css, dataGzipBytes: data, normalFontBytes: fonts, initialTransferBudgetBytes: initial, limits: { js: 200000, data: 50000, initial: 400000 } };
console.log(JSON.stringify(result, null, 2));
writeFileSync(new URL('../data/build-budgets.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
if (js > 200000 || data > 50000 || initial > 400000) throw new Error('Initial transfer budget exceeded');
// The published page must contain no missing first-party file reference.
for (const name of ['data/employment.json', 'data/employment.csv', 'favicon.svg']) if (!statSync(join(root.pathname, name)).isFile()) throw new Error(`Missing ${name}`);
