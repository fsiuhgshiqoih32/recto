// Renders build/icon.svg to build/icon.png (1024×1024, transparent) for electron-builder,
// which derives the Windows .ico and macOS .icns from it, and to the tile images a
// Microsoft Store package needs (build/appx/, see docs/microsoft-store.md).
//
//   npx tsx scripts/make-icon.ts

import { mkdirSync, readFileSync } from 'node:fs';
import { launch } from '../cli/pdf';

const svg = readFileSync('build/icon.svg', 'utf8');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: 'build/icon.png', omitBackground: true });
console.log('wrote build/icon.png');

// Store tiles: the mark centred with some air around it, on a transparent ground.
const TILES: [name: string, width: number, height: number][] = [
  ['StoreLogo.png', 50, 50],
  ['Square44x44Logo.png', 44, 44],
  ['SmallTile.png', 71, 71],
  ['Square150x150Logo.png', 150, 150],
  ['Wide310x150Logo.png', 310, 150],
  ['LargeTile.png', 310, 310],
];
mkdirSync('build/appx', { recursive: true });
// The plain name is the 100% image; .scale-200 and .scale-400 serve sharper screens.
for (const [name, width, height] of TILES) for (const scale of [1, 2, 4]) {
  const tile = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  const size = Math.round(Math.min(width, height) * (width === height ? 0.8 : 0.66));
  await tile.setContent(
    `<html><body style="margin:0;width:${width}px;height:${height}px;display:grid;place-items:center;background:transparent">` +
      `<div style="width:${size}px;height:${size}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div></body></html>`,
  );
  const file = scale === 1 ? name : name.replace(/\.png$/, `.scale-${scale * 100}.png`);
  await tile.screenshot({ path: `build/appx/${file}`, omitBackground: true });
  await tile.close();
  console.log(`wrote build/appx/${file} (${width * scale}×${height * scale})`);
}
await browser.close();
