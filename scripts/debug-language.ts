// Debug helper: screenshots the first spreads of a small book in another
// language, laid out by paged.js exactly as for the PDF.
//
//   npx tsx scripts/debug-language.ts ar "نص الفقرة…"

import { join } from 'node:path';
import { launch } from '../cli/pdf';
import { printDocument } from '../src/export/print/paged';
import { loadHyphenator } from '../src/i18n/hyphenate';
import { paragraphs } from '../src/model/book';
import { createElement, newBook } from '../src/model/defaults';
import { packageOf } from '../src/themes/fonts';

const [lang = 'ar', text = 'Text.'] = process.argv.slice(2);
const book = newBook({ language: lang, title: 'Harrow Point', author: 'Mara Quill' });
book.elements = book.elements.filter((el) => el.kind !== 'chapter' && el.kind !== 'about-author');
const body = Array.from({ length: 6 }, () => text);
book.elements.push(
  createElement('chapter', book.meta, { title: '', content: paragraphs(...body) }),
  createElement('chapter', book.meta, { title: '', content: paragraphs(...body) }),
);
const html = printDocument(book, {
  fontUrl: (file) => `http://recto.local/fonts/${file}`,
  pagedUrl: 'http://recto.local/vendor/paged.polyfill.js',
  spreads: true,
  hyphenate: (await loadHyphenator(lang)) ?? undefined,
});
const root = join(import.meta.dirname, '..');
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.route('http://recto.local/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/book.html') return route.fulfill({ body: html, contentType: 'text/html; charset=utf-8' });
  const file = url.pathname.replace('/fonts/', '');
  const pkg = packageOf(file);
  if (pkg) return route.fulfill({ path: join(root, 'node_modules/@fontsource', pkg, 'files', file) });
  return route.fulfill({ path: join(root, 'node_modules/pagedjs/dist/paged.polyfill.js') });
});
await page.goto('http://recto.local/book.html');
await page.waitForFunction(() => (window as unknown as { __rectoPages?: number }).__rectoPages);
// The first chapter opener and the page after it.
const pages = page.locator('.pagedjs_page');
const opener = await pages.evaluateAll((els) => els.findIndex((el) => el.querySelector('.chapter-heading')));
for (const [suffix, index] of [['opener', opener], ['next', opener + 1]] as const) {
  const out = join(root, 'out', `lang-${lang}-${suffix}.png`);
  await pages.nth(index).screenshot({ path: out });
  console.log(out);
}
console.log('opener is physical page', opener + 1);
await browser.close();
