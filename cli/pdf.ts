// Headless print-PDF export.
//
//   npm run pdf -- path/to/book.recto [-o out.pdf]
//   npm run pdf -- --sample [-o out.pdf]
//
// Uses an installed Chrome or Edge by default (set RECTO_BROWSER=chromium to
// use Playwright's bundled browser). Lays the book out twice when the first
// pass lands in a different KDP gutter tier than the estimate.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from '@playwright/test';
import type { Book } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { printDocument } from '../src/export/print/paged';
import { layoutUntilSettled } from '../src/export/print/layout';
import { loadHyphenator } from '../src/i18n/hyphenate';
import { fileNameFor, parseBook } from '../src/store/file';
import { packageOf } from '../src/themes/fonts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://recto.local';

export async function launch(): Promise<Browser> {
  const wanted = process.env.RECTO_BROWSER;
  const channels = wanted ? [wanted] : ['chrome', 'msedge', 'chromium'];
  let lastError: unknown;
  for (const channel of channels) {
    try {
      return await chromium.launch(channel === 'chromium' ? {} : { channel });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Serves fonts and paged.js from node_modules under a fake origin. */
function assetPath(url: URL): string | null {
  const font = /^\/fonts\/([\w-]+\.woff2)$/.exec(url.pathname);
  const pkg = font && packageOf(font[1]);
  if (font && pkg) return join(root, 'node_modules/@fontsource', pkg, 'files', font[1]);
  if (url.pathname === '/vendor/paged.polyfill.js') return join(root, 'node_modules/pagedjs/dist/paged.polyfill.js');
  return null;
}

export async function renderPdf(book: Book, outPath: string): Promise<{ pages: number; passes: number }> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    let html = '';
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/book.html') return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
      const path = assetPath(url);
      if (!path) return route.fulfill({ status: 404 });
      return route.fulfill({ path });
    });

    const hyphenate = (await loadHyphenator(book.meta.language)) ?? undefined;
    const result = await layoutUntilSettled(book, async (pages) => {
      html = printDocument(book, {
        pages,
        fontUrl: (file) => `${ORIGIN}/fonts/${file}`,
        pagedUrl: `${ORIGIN}/vendor/paged.polyfill.js`,
        hyphenate,
      });
      await page.goto(`${ORIGIN}/book.html`);
      await page.waitForFunction(() => (window as unknown as { __rectoPages?: number }).__rectoPages, null, {
        timeout: 180_000,
      });
      return page.evaluate(() => (window as unknown as { __rectoPages: number }).__rectoPages);
    });
    writeFileSync(outPath, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    return result;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('-o');
  const out = outIndex >= 0 ? args.splice(outIndex, 2)[1] : undefined;
  const input = args.find((a) => !a.startsWith('-'));
  if (!input && !args.includes('--sample')) {
    console.error('usage: npm run pdf -- <book.recto> [-o out.pdf]   |   npm run pdf -- --sample');
    process.exit(1);
  }
  const book = input ? parseBook(readFileSync(input, 'utf8')) : sampleBook();
  const outPath = resolve(out ?? fileNameFor(book, 'pdf'));
  const started = Date.now();
  const { pages, passes } = await renderPdf(book, outPath);
  console.log(`${outPath}: ${pages} pages, ${passes} layout pass(es), ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
