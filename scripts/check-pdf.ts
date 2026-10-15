// Renders the sample book to PDF and checks what a printer cares about:
// exact trim size, chapters opening on right-hand pages, no running heads or
// folios on openers, running heads and correct folios on ordinary pages, page
// numbers in the contents that match the folios, pure black ink, no link
// annotations, and no paragraph leaving a single line behind at a page break.
//
//   npm run test:pdf [-- --all]

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument } from '@pdfme/pdf-lib';
import { renderCoverPdf, renderPdf } from '../cli/pdf';
import { coverWrap } from '../src/export/cover/wrap';
import { richBook } from './fixtures';
import type { ThemeId, TrimId } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { TRIMS, pageMargins, trimLabel } from '../src/export/print/pageCss';
import { languageInfo } from '../src/i18n/languages';
import { paragraphs } from '../src/model/book';
import { createElement, newBook } from '../src/model/defaults';

interface PageInfo {
  width: number;
  height: number;
  /** Text items with their vertical position as a fraction of page height from the top. */
  items: { str: string; y: number }[];
  /** Link and other annotations on the page. */
  annotations: number;
  /** Every fill and stroke color the page paints with, as #rrggbb. */
  colors: Set<string>;
}

// pdf.js hands colors over as typed arrays, whose map() would coerce the hex strings back to numbers.
const hex = (rgb: ArrayLike<number>) => `#${Array.from(rgb).map((v) => Math.round(v <= 1 ? v * 255 : v).toString(16).padStart(2, '0')).join('')}`;

/** #000 → #000000, so colors compare as one form. */
const longHex = (color: string) => color.toLowerCase().replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3');

/** Colors set by the page's drawing operators (images aside). */
function paintColors(fnArray: number[], argsArray: unknown[][]): Set<string> {
  const colors = new Set<string>();
  fnArray.forEach((fn, i) => {
    const args = argsArray[i] ?? [];
    if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) {
      colors.add(typeof args[0] === 'string' ? longHex(args[0]) : hex(args as unknown as ArrayLike<number>));
    } else if (fn === OPS.setFillGray || fn === OPS.setStrokeGray) {
      const gray = args[0] as number;
      colors.add(hex([gray, gray, gray]));
    } else if (fn === OPS.setFillCMYKColor || fn === OPS.setStrokeCMYKColor) {
      colors.add(`cmyk(${(args as number[]).join(',')})`);
    }
  });
  return colors;
}

/** Pages where a split paragraph leaves fewer than two lines at the foot, or carries fewer than two over. */
async function strandedLines(page: Page): Promise<string[]> {
  // Plain JavaScript: tsx would wrap named functions in a helper the page doesn't have.
  return page.evaluate(`(() => {
    function lineCount(block) {
      var tops = [];
      var walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      var range = document.createRange();
      for (var node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement && node.parentElement.closest('.dropcap')) continue;
        range.selectNodeContents(node);
        Array.from(range.getClientRects()).forEach(function (r) {
          if (r.width > 0 && r.height > 0 && !tops.some(function (t) { return Math.abs(t - r.top) < r.height / 2; })) tops.push(r.top);
        });
      }
      return tops.length;
    }
    var problems = [];
    document.querySelectorAll('.pagedjs_page').forEach(function (page, i) {
      var blocks = Array.from(page.querySelectorAll('.pagedjs_page_content p')).filter(function (p) { return p.textContent.trim(); });
      var first = blocks[0];
      var last = blocks[blocks.length - 1];
      if (first && first.hasAttribute('data-split-from') && lineCount(first) < 2) problems.push('page ' + (i + 1) + ' starts with a single carried-over line');
      if (last && last.hasAttribute('data-split-to') && lineCount(last) < 2) problems.push('page ' + (i + 1) + ' ends with a single line of a new paragraph');
    });
    return problems;
  })()`);
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
    const annotations = (await page.getAnnotations()).length;
    const ops = await page.getOperatorList();
    pages.push({ width, height, items, annotations, colors: paintColors(ops.fnArray, ops.argsArray) });
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
  let stranded: string[] = [];
  const { pages: count } = await renderPdf(book, path, { inspect: async (page) => void (stranded = await strandedLines(page)) });
  const pages = await readPdf(path);
  const t = TRIMS[trim];
  console.log(`\n${theme}, ${trimLabel(t)}: ${count} pages → ${path}`);

  check(pages.length === count, `PDF has the ${count} pages paged.js laid out`);
  check(stranded.length === 0, `no widows or orphans${stranded.length ? ` (${stranded.join('; ')})` : ''}`);
  const annotations = pages.reduce((n, p) => n + p.annotations, 0);
  check(annotations === 0, `the PDF has no link annotations (found ${annotations})`);
  const inks = [...new Set(pages.flatMap((p) => [...p.colors]))].filter((c) => c !== '#000000' && c !== '#ffffff');
  check(inks.length === 0, `text, rules and ornaments are pure black${inks.length ? ` (also found ${inks.join(', ')})` : ''}`);
  const sizes = new Set(pages.map((p) => `${p.width.toFixed(1)}×${p.height.toFixed(1)}`));
  check(
    sizes.size === 1 && Math.abs(pages[0].width - t.width * 72) < 0.6 && Math.abs(pages[0].height - t.height * 72) < 0.6,
    `every page is ${+(t.width * 72).toFixed(1)}×${+(t.height * 72).toFixed(1)}pt (got ${[...sizes].join(', ')})`,
  );

  const all = (p: PageInfo) => squash(p.items.map((it) => it.str).join(''));
  // Running heads and folios sit in the top and bottom margins.
  const margins = pageMargins(t, count);
  const inHead = (y: number) => y < margins.top / t.height;
  const inFoot = (y: number) => y > 1 - margins.bottom / t.height;
  const head = (p: PageInfo) => squash(p.items.filter((it) => inHead(it.y)).map((it) => it.str).join(''));
  const foot = (p: PageInfo) => squash(p.items.filter((it) => inFoot(it.y)).map((it) => it.str).join(''));

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

  // Running heads and folios are drawn once. Chrome 131+ can paint @page margin
  // boxes itself on top of paged.js's own, which would double them.
  const doubled = pages.findIndex((p) => p.items.filter((it) => inFoot(it.y) && /^\d+$/.test(it.str.trim())).length > 1);
  check(doubled < 0, `every page has at most one folio${doubled >= 0 ? ` (page ${doubled + 1} has more)` : ''}`);

  // Contents entries end in the page number where that element opens.
  const contents = all(pages[tocIndex]);
  for (const opener of openers) {
    const index = openerIndex(opener);
    // Number-only chapter labels (Ledger's "2") run straight on from the previous entry's page number.
    const listed = new RegExp(`${squash(opener)}(\\d+)`).exec(contents)?.[1];
    check(!!listed?.startsWith(String(index - bodyStart + 1)), `contents lists "${opener}" on page ${index - bodyStart + 1} (got ${listed})`);
  }

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
  ? [['5x8', 'octavo'], ['5.5x8.5', 'ledger'], ['6x9', 'marginalia'], ['a5', 'broadsheet'], ['5.25x8', 'almanac'], ['6.14x9.21', 'octavo'], ['8.5x11', 'ledger']]
  : [['5.5x8.5', 'octavo'], ['6x9', 'broadsheet']];
for (const [trim, theme] of combos) await checkBook(trim, theme);
for (const sample of LANGUAGE_SAMPLES) await checkLanguage(sample);

// Every kind of block, printed with bleed and notes at the foot of the page.
{
  const book = richBook();
  book.style.bleed = true;
  book.style.notes = 'page';
  const path = join('out', 'rich-bleed.pdf');
  let stranded: string[] = [];
  const { pages: count } = await renderPdf(book, path, { inspect: async (page) => void (stranded = await strandedLines(page)) });
  const pages = await readPdf(path);
  const t = TRIMS[book.style.trim];
  console.log(`
rich content with bleed: ${count} pages → ${path}`);
  check(pages.every((p) => Math.abs(p.width - (t.width + 0.125) * 72) < 0.6 && Math.abs(p.height - (t.height + 0.25) * 72) < 0.6), `every page is the trim plus bleed, ${t.width + 0.125} × ${t.height + 0.25} in`);
  check(pages.reduce((n, p) => n + p.annotations, 0) === 0, 'footnotes, store links and the contents add no link annotations');
  const inks = [...new Set(pages.flatMap((p) => [...p.colors]))].filter((c) => c !== '#000000' && c !== '#ffffff');
  check(inks.length === 0, `rules, borders and bubbles are pure black${inks.length ? ` (also found ${inks.join(', ')})` : ''}`);
  check(stranded.length === 0, `no widows or orphans${stranded.length ? ` (${stranded.join('; ')})` : ''}`);
  const cited = pages.find((p) => squash(p.items.map((it) => it.str).join('')).includes(squash('The ledger recorded the wind')));
  const foot = cited ? squash(cited.items.filter((it) => it.y > 0.7).map((it) => it.str).join('')) : '';
  check(foot.includes(squash('1. In knots, from 1931 on')) && foot.includes(squash('2. Measured by how many')), 'both footnotes sit at the foot of the page that cites them, numbered 1 and 2');

  // The TrimBox marks the cut: bleed on the right of right-hand pages, the left of left-hand ones.
  const pdf = await PDFDocument.load(readFileSync(path));
  const box = (i: number) => pdf.getPage(i).getTrimBox();
  const b = 0.125 * 72;
  const [right, left] = [box(0), box(1)];
  check(Math.abs(right.x) < 0.1 && Math.abs(left.x - b) < 0.1 && Math.abs(right.y - b) < 0.1 && Math.abs(right.width - t.width * 72) < 0.6 && Math.abs(right.height - t.height * 72) < 0.6,
    `TrimBox is the ${t.width} × ${t.height} in trim, offset from the bleed on the outside edge`);
  check(pdf.getTitle() === book.meta.title && pdf.getAuthor() === book.meta.author, 'the PDF carries the title and author');
}

// A PDF for reading: live contents links and bookmarks.
{
  const book = sampleBook();
  const path = join('out', 'sample-reading.pdf');
  await renderPdf(book, path, { digital: true });
  const doc = await getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  let links = 0;
  for (let i = 1; i <= doc.numPages; i++) links += (await (await doc.getPage(i)).getAnnotations()).filter((a: { subtype: string }) => a.subtype === 'Link').length;
  const outline = (await doc.getOutline()) ?? [];
  console.log(`
reading PDF → ${path}`);
  check(links >= 6, `the contents entries are live links (${links} links)`);
  check(outline.length >= 6, `the PDF has bookmarks (${outline.length} top-level)`);
}

// A paperback wrap cover: one page at the exact wrap size, with the spine and back text.
{
  const book = sampleBook();
  book.style.trim = '6x9';
  book.meta.cover = `data:image/png;base64,${readFileSync('build/icon.png').toString('base64')}`;
  book.meta.description = 'A lighthouse keeper inherits a ledger nobody has read in ninety years.';
  const wrap = coverWrap(book, 300, 'white');
  const path = join('out', 'cover-6x9-300.pdf');
  await renderCoverPdf(book, wrap, '#1d3a4a', path);
  const [page, ...rest] = await readPdf(path);
  console.log(`
cover: ${wrap.width} × ${wrap.height} in → ${path}`);
  check(!rest.length, 'the cover is a single page');
  check(Math.abs(page.width - wrap.width * 72) < 0.6 && Math.abs(page.height - wrap.height * 72) < 0.6, `the cover is ${wrap.width} × ${wrap.height} in (got ${(page.width / 72).toFixed(3)} × ${(page.height / 72).toFixed(3)})`);
  const text = squash(page.items.map((it) => it.str).join(''));
  check(text.includes(squash('A lighthouse keeper inherits a ledger')), 'the back cover carries the description');
  check(text.includes(squash(book.meta.title)) && text.includes(squash(book.meta.author)), 'the spine and back carry the title and author');
  const trimBox = (await PDFDocument.load(readFileSync(path))).getPage(0).getTrimBox();
  check(Math.abs(trimBox.x - 9) < 0.1 && Math.abs(trimBox.width - (wrap.width - 0.25) * 72) < 0.6, 'the cover’s TrimBox sits 0.125 in inside the bleed on every side');
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall print checks passed');
