// Renders the sample book to PDF and checks what a printer cares about:
// exact trim size, chapters opening on right-hand pages, no running heads or
// folios on openers, running heads and correct folios on ordinary pages, and
// page numbers in the contents that match the folios.
//
//   npm run test:pdf [-- --all]

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderPdf } from '../cli/pdf';
import type { ThemeId, TrimId } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { TRIMS } from '../src/export/print/pageCss';
import { languageInfo } from '../src/i18n/languages';
import { paragraphs } from '../src/model/book';
import { createElement, newBook } from '../src/model/defaults';

interface PageInfo {
  width: number;
  height: number;
  /** Text items with their vertical position as a fraction of page height from the top. */
  items: { str: string; y: number }[];
}

/**
 * Letterspaced text comes out of PDFs as "M A R A", so compare without spaces.
 * NFKC folds the look-alike code points PDFs use for some CJK characters
 * (Kangxi radical ⼆ for 二) back to the real ones.
 */
const squash = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toUpperCase();

async function readPdf(path: string): Promise<PageInfo[]> {
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  const pages: PageInfo[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [, , width, height] = page.view;
    const content = await page.getTextContent();
    const items = content.items
      .filter((it): it is typeof it & { str: string; transform: number[] } => 'str' in it && !!it.str.trim())
      .map((it) => ({ str: it.str, y: 1 - it.transform[5] / height }));
    pages.push({ width, height, items });
  }
  return pages;
}

const failures: string[] = [];
function check(ok: boolean, message: string) {
  if (!ok) failures.push(message);
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${message}`);
}

async function checkBook(trim: TrimId, theme: ThemeId) {
  const book = sampleBook();
  book.style.trim = trim;
  book.style.theme = theme;
  mkdirSync('out', { recursive: true });
  const path = join('out', `sample-${theme}-${trim}.pdf`);
  const { pages: count } = await renderPdf(book, path);
  const pages = await readPdf(path);
  const t = TRIMS[trim];
  console.log(`\n${theme}, ${t.label}: ${count} pages → ${path}`);

  check(pages.length === count, `PDF has the ${count} pages paged.js laid out`);
  const sizes = new Set(pages.map((p) => `${p.width.toFixed(1)}×${p.height.toFixed(1)}`));
  check(
    sizes.size === 1 && Math.abs(pages[0].width - t.width * 72) < 0.6 && Math.abs(pages[0].height - t.height * 72) < 0.6,
    `every page is ${+(t.width * 72).toFixed(1)}×${+(t.height * 72).toFixed(1)}pt (got ${[...sizes].join(', ')})`,
  );

  const all = (p: PageInfo) => squash(p.items.map((it) => it.str).join(''));
  const head = (p: PageInfo) => squash(p.items.filter((it) => it.y < 0.09).map((it) => it.str).join(''));
  const foot = (p: PageInfo) => squash(p.items.filter((it) => it.y > 0.9).map((it) => it.str).join(''));

  const tocIndex = pages.findIndex((p) => all(p).startsWith('CONTENTS'));
  check(tocIndex >= 0, `contents page found (page ${tocIndex + 1})`);

  const topHalf = (p: PageInfo) => squash(p.items.filter((it) => it.y < 0.6).map((it) => it.str).join(''));
  const openerIndex = (title: string) => pages.findIndex((p, i) => i > tocIndex && topHalf(p).includes(squash(title)));
  const openers = ['Prologue', 'The Inventory', 'Fog Season', 'What the Ledger Knew', 'Epilogue', 'Acknowledgments'];
  const bodyStart = openerIndex('Prologue');
  for (const opener of openers) {
    const index = openerIndex(opener);
    check(index > tocIndex, `"${opener}" opens a page after the contents`);
    if (index < 0) continue;
    check(index % 2 === 0, `"${opener}" opens on a right-hand page (page ${index + 1})`);
    check(!head(pages[index]) && !foot(pages[index]), `"${opener}" opener has no running head or folio`);
  }

  const text = pages.map((p, i) => ({ p, i })).filter(({ p }) => !!head(p));
  check(text.length >= 3, `${text.length} pages carry running heads`);
  const title = squash(book.meta.title);
  const author = squash(book.meta.author);
  check(text.filter(({ i }) => i % 2 === 1).every(({ p }) => head(p) === author), 'left-hand pages carry the author running head');
  check(text.filter(({ i }) => i % 2 === 0).every(({ p }) => head(p) === title), 'right-hand pages carry the title running head');
  const wrong = text.filter(({ p, i }) => foot(p) !== String(i - bodyStart + 1));
  check(
    wrong.length === 0,
    `folios count from the first chapter${wrong.length ? ` (page ${wrong[0].i + 1} shows "${foot(wrong[0].p)}", expected ${wrong[0].i - bodyStart + 1})` : ''}`,
  );

  // Contents entries end in the page number where that element opens.
  const listed = /FOGSEASON(\d+)/.exec(all(pages[tocIndex]))?.[1];
  const fog = openerIndex('Fog Season');
  check(listed === String(fog - bodyStart + 1), `contents lists "Fog Season" on page ${fog - bodyStart + 1} (got ${listed})`);

  // Recto hyphenates body text itself; line-end hyphens come out as their own "-" glyph runs.
  const hyphenBreaks = pages.reduce((n, p) => n + p.items.filter((it) => it.str === '-').length, 0);
  check(hyphenBreaks >= 3, `body text is hyphenated (${hyphenBreaks} hyphenated line ends)`);
}

// Short books in other scripts: page size, right-hand openers, localized labels,
// and the right font embedded for the script.
const LANGUAGE_SAMPLES: { lang: string; text: string; label?: string; font: string; script: RegExp }[] = [
  {
    lang: 'es',
    text: 'El faro de Harrow Point se encendía cada tarde a las cinco y cuarto, y Ada anotaba en el libro verde el viento, la niebla y las gaviotas que contaba sobre el rompeolas.',
    label: 'CAPÍTULO2',
    font: 'EBGaramond',
    script: /\p{Script=Latin}/u,
  },
  {
    lang: 'ru',
    text: 'Маяк на мысе Харроу зажигался каждый вечер в четверть шестого, и Ада записывала в зелёную книгу ветер, туман и чаек, которых насчитала на волнорезе.',
    label: 'ГЛАВА2',
    font: 'EBGaramond',
    script: /\p{Script=Cyrillic}/u,
  },
  {
    lang: 'ar',
    text: 'كانت منارة هارو بوينت تضاء كل مساء في الخامسة والربع، وكانت آدا تكتب في الدفتر الأخضر الريح والضباب وعدد النوارس على حاجز الأمواج.',
    font: 'NotoNaskhArabic',
    script: /\p{Script=Arabic}/u,
  },
  {
    lang: 'ja',
    text: 'ハロウ岬の灯台は毎夕五時十五分に灯り、エイダは緑の帳簿に風と霧と、防波堤の上で数えたカモメのことを書き留めた。',
    label: '第二章',
    font: '',
    script: /[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}]/u,
  },
  {
    lang: 'hi',
    text: 'हैरो पॉइंट का प्रकाशस्तंभ हर शाम सवा पाँच बजे जलता था, और एडा हरे बही-खाते में हवा, कोहरा और तटबंध पर गिनी गई समुद्री चिड़ियों के बारे में लिखती थी।',
    font: 'NotoSerifDevanagari',
    script: /\p{Script=Devanagari}/u,
  },
];

async function checkLanguage({ lang, text, label, font, script }: (typeof LANGUAGE_SAMPLES)[number]) {
  const book = newBook({ language: lang, title: 'Harrow Point', author: 'Mara Quill' });
  const body = Array.from({ length: 14 }, () => text);
  book.elements = book.elements.filter((el) => el.kind !== 'chapter' && el.kind !== 'about-author');
  book.elements.push(
    createElement('chapter', book.meta, { title: '', content: paragraphs(...body) }),
    createElement('chapter', book.meta, { title: '', content: paragraphs(...body) }),
  );
  const path = join('out', `language-${lang}.pdf`);
  const { pages: count } = await renderPdf(book, path);
  const pages = await readPdf(path);
  const t = TRIMS[book.style.trim];
  console.log(`\n${languageInfo(lang).name}: ${count} pages → ${path}`);

  check(pages.every((p) => Math.abs(p.width - t.width * 72) < 0.6 && Math.abs(p.height - t.height * 72) < 0.6), 'every page is the trim size');
  const letters = pages.reduce((n, p) => n + [...p.items.map((it) => it.str.normalize('NFKC')).join('')].filter((ch) => script.test(ch)).length, 0);
  // Extraction under-counts some scripts (Chrome doesn't map every contextual Arabic form back to text),
  // so this only asks for several paragraphs' worth.
  check(letters > text.length * 4, `the text is set in its own script (${letters} characters extracted)`);
  if (label) {
    // The contents page lists the label too; the chapter opener is the last page that carries it.
    const index = pages.findLastIndex((p) => squash(p.items.map((it) => it.str).join('')).includes(label));
    check(index >= 0 && index % 2 === 0, `the second chapter is labeled "${label}" and opens on a right-hand page (page ${index + 1})`);
  }
  if (font) {
    const raw = readFileSync(path).toString('latin1');
    check(raw.includes(font), `the PDF embeds ${font}`);
  }
}

const combos: [TrimId, ThemeId][] = process.argv.includes('--all')
  ? [['5x8', 'octavo'], ['5.5x8.5', 'ledger'], ['6x9', 'marginalia'], ['a5', 'broadsheet'], ['5.25x8', 'almanac']]
  : [['5.5x8.5', 'octavo'], ['6x9', 'broadsheet']];
for (const [trim, theme] of combos) await checkBook(trim, theme);
for (const sample of LANGUAGE_SAMPLES) await checkLanguage(sample);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall print checks passed');
