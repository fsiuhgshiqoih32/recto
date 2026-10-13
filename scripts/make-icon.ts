// Renders build/icon.svg to build/icon.png (1024×1024, transparent) for electron-builder,
// which derives the Windows .ico and macOS .icns from it.
//
//   npx tsx scripts/make-icon.ts

import { readFileSync } from 'node:fs';
import { launch } from '../cli/pdf';

const svg = readFileSync('build/icon.svg', 'utf8');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: 'build/icon.png', omitBackground: true });
await browser.close();
console.log('wrote build/icon.png');
