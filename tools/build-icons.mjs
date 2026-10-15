/**
 * build-icons.mjs -- erzeugt aus tools/icon-source.svg die PNG-Groessen
 * fuer die Erweiterung (und die Vorlagen fuer icon.ico).
 *
 *   npm run icons
 *
 * Fuer icon.ico danach z. B.:
 *   magick ico-16.png ico-32.png ico-48.png ico-64.png ico-128.png ico-256.png extension/icons/icon.ico
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const svg = readFileSync(join(here, 'icon-source.svg'), 'utf8');
const outDir = join(root, 'extension', 'icons');
mkdirSync(outDir, { recursive: true });

const targets = [
  [16, 'icon16.png'],
  [32, 'icon32.png'],
  [48, 'icon48.png'],
  [128, 'icon128.png'],
  [256, 'icon.png']
];

for (const [size, name] of targets) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const out = join(outDir, name);
  writeFileSync(out, resvg.render().asPng());
  console.log('geschrieben:', out);
}
console.log('\nFertig. Fuer icon.ico die Groessen 16..256 mit einem ICO-Werkzeug zusammenfassen.');
