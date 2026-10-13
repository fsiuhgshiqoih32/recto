// Debug helper: dumps per-page text of a PDF, or screenshots the paged.js
// spread layout of the sample book.
//
//   npx tsx scripts/debug-print.ts text out/sample.pdf
//   npx tsx scripts/debug-print.ts shot [theme] [trim] [elementTitle]

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { launch } from '../cli/pdf';
import type { ThemeId, TrimId } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { printDocument } from '../src/export/print/paged';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [mode, ...rest] = process.argv.slice(2);

if (mode === 'text') {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(rest[0])) }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const height = page.view[3];
    const lines = content.items
      .filter((it) => 'str' in it && it.str.trim())
      .map((it) => {
        const t = it as { str: string; transform: number[] };
        return `${(1 - t.transform[5] / height).toFixed(2)} ${t.str}`;
      });
    console.log(`--- page ${i} (${lines.length} items)`);
    console.log([...lines.slice(0, 4), lines.length > 6 ? '…' : '', ...lines.slice(-2)].filter(Boolean).join('\n'));
  }
} else {
  const [theme = 'octavo', trim = '5.5x8.5', only] = rest;
  const book = sampleBook();
  book.style.theme = theme as ThemeId;
  book.style.trim = trim as TrimId;
  const ids = only ? book.elements.filter((el) => el.title === only || el.kind === only).map((el) => el.id) : undefined;
  const html = printDocument(book, {
    fontUrl: (file) => `http://recto.local/fonts/${file}`,
    pagedUrl: 'http://recto.local/vendor/paged.polyfill.js',
    spreads: true,
    elementIds: ids,
  });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: mode === 'opener' ? 2 : 1 });
  await page.route('http://recto.local/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/book.html') return route.fulfill({ body: html, contentType: 'text/html' });
    const font = /^\/fonts\/(([a-z0-9-]+?)-latin-[\w-]+\.woff2)$/.exec(url.pathname);
    if (font) return route.fulfill({ path: join(root, 'node_modules/@fontsource', font[2], 'files', font[1]) });
    return route.fulfill({ path: join(root, 'node_modules/pagedjs/dist/paged.polyfill.js') });
  });
  await page.goto('http://recto.local/book.html');
  await page.waitForFunction(() => (window as unknown as { __rectoPages?: number }).__rectoPages);
  const out = join(root, 'out', `shot-${theme}-${trim}${only ? `-${only.replace(/\W+/g, '_')}` : ''}.png`);
  if (mode === 'opener') {
    // Just the top of the first page, at 2× for a close look at headings and drop caps.
    const box = (await page.locator('.pagedjs_page').first().boundingBox())!;
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.screenshot({ path: out, clip: { x: box.x, y: box.y + box.height * 0.18, width: box.width, height: box.height * 0.42 } });
  } else {
    await page.screenshot({ path: out, fullPage: true });
  }
  console.log(out);
  await browser.close();
}
