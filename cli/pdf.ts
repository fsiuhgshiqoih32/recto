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
import { type Browser, type Page, chromium } from '@playwright/test';
import type { Book } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { pdfFinish, printDocument } from '../src/export/print/paged';
import { finishPdf } from '../src/export/print/finish';
import { layoutUntilSettled } from '../src/export/print/layout';
import { coverDocument } from '../src/export/cover/document';
import type { CoverWrap } from '../src/export/cover/wrap';
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

export interface RenderOptions {
  /** Runs against the laid-out print document, before the PDF is written (tests use it to inspect pages). */
  inspect?: (page: Page) => Promise<void>;
  /** A PDF for reading: live links, bookmarks and tags, no bleed. */
  digital?: boolean;
}

const fontUrl = (file: string) => `${ORIGIN}/fonts/${file}`;

/**
 * Opens a page that serves fonts and paged.js from node_modules under a fake
 * origin. `show(html)` loads a document there and waits until it reports its
 * page count (window.__rectoPages), as Recto's print and cover documents do.
 */
async function withPrintPage<T>(use: (page: Page, show: (html: string) => Promise<number>) => Promise<T>): Promise<T> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    if (process.env.RECTO_DEBUG) page.on('console', (message) => console.log('[print]', message.text()));
    let html = '';
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/book.html') return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
      const path = assetPath(url);
      if (!path) return route.fulfill({ status: 404 });
      return route.fulfill({ path });
    });
    const show = async (next: string) => {
      html = next;
      await page.goto(`${ORIGIN}/book.html`);
      await page.waitForFunction(() => (window as unknown as { __rectoPages?: number }).__rectoPages, null, { timeout: 180_000 });
      return page.evaluate(() => (window as unknown as { __rectoPages: number }).__rectoPages);
    };
    return await use(page, show);
  } finally {
    await browser.close();
  }
}

export function renderPdf(book: Book, outPath: string, options: RenderOptions = {}): Promise<{ pages: number; passes: number }> {
  return withPrintPage(async (page, show) => {
    const hyphenate = (await loadHyphenator(book.meta.language)) ?? undefined;
    const result = await layoutUntilSettled(book, (pages) =>
      show(printDocument(book, { pages, fontUrl, pagedUrl: `${ORIGIN}/vendor/paged.polyfill.js`, hyphenate, digital: options.digital })),
    );
    await options.inspect?.(page);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, outline: !!options.digital, tagged: !!options.digital });
    const finished = options.digital ? { ...book, style: { ...book.style, bleed: false } } : book;
    writeFileSync(outPath, await finishPdf(pdf, pdfFinish(finished, 'interior')));
    return result;
  });
}

/** Prints a paperback wrap cover (see export/cover) to PDF. */
export function renderCoverPdf(book: Book, wrap: CoverWrap, background: string, outPath: string): Promise<void> {
  return withPrintPage(async (page, show) => {
    await show(coverDocument(book, wrap, { fontUrl, background }));
    writeFileSync(outPath, await finishPdf(await page.pdf({ preferCSSPageSize: true, printBackground: true }), pdfFinish(book, 'cover')));
  });
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('-o');
  const out = outIndex >= 0 ? args.splice(outIndex, 2)[1] : undefined;
  const input = args.find((a) => !a.startsWith('-'));
  if (!input && !args.includes('--sample')) {
    console.error('usage: npm run pdf -- <book.recto> [-o out.pdf] [--reading]   |   npm run pdf -- --sample');
    process.exit(1);
  }
  const book = input ? parseBook(readFileSync(input, 'utf8')) : sampleBook();
  const outPath = resolve(out ?? fileNameFor(book, 'pdf'));
  const started = Date.now();
  const { pages, passes } = await renderPdf(book, outPath, { digital: args.includes('--reading') });
  console.log(`${outPath}: ${pages} pages, ${passes} layout pass(es), ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
