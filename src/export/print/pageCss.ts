// Print layout rules: trim sizes, KDP gutter minimums and the CSS Paged Media
// stylesheet that paged.js turns into pages.

import type { Book } from '../../model/book';
import { editionOf, textStats } from '../../model/book';
import { themeOf } from '../../render/html';
import { languageInfo } from '../../i18n/languages';
import { baseCss, languageCss } from '../../themes';
import { bookFonts, fontFaceCss } from '../../themes/fonts';

import { TRIMS, type Trim, isLarge } from './trims';
import { notePlacement } from '../../render/html';
import { BLEED } from '../cover/wrap';

export { TRIMS, type Trim, trimLabel } from './trims';

/** Minimum inside (gutter-side) margin KDP requires for a given page count, in inches. */
export function kdpMinInside(pages: number): number {
  if (pages <= 150) return 0.375;
  if (pages <= 300) return 0.5;
  if (pages <= 500) return 0.625;
  if (pages <= 700) return 0.75;
  return 0.875;
}

export interface Margins {
  top: number;
  bottom: number;
  inside: number;
  outside: number;
}

export function pageMargins(trim: Trim, pages: number): Margins {
  // Large trims get a little more room above and below the text block.
  const extra = isLarge(trim) ? 0.1 : 0;
  return { top: 0.75 + extra, bottom: 0.8 + extra, outside: trim.outside, inside: +(kdpMinInside(pages) + 0.3).toFixed(3) };
}

/** Large-print editions set body text at 16 pt, the usual minimum for large print. */
export const LARGE_PRINT_SIZE = 16;

/** Body text size in points. */
export function bodySize(book: Book): number {
  return book.style.largePrint ? Math.max(LARGE_PRINT_SIZE, TRIMS[book.style.trim].fontSize) : TRIMS[book.style.trim].fontSize;
}

/** Rough page count before layout, used to pick the first gutter. */
export function estimatePages(source: Book): number {
  const book = editionOf(source, 'print');
  const trim = TRIMS[book.style.trim];
  const size = bodySize(book);
  const m = pageMargins(trim, 100);
  const width = trim.width - m.inside - m.outside;
  const height = trim.height - m.top - m.bottom;
  const wordsPerPage = width * height * 9.5 * (11 / size) ** 2 * (book.style.largePrint ? 0.88 : 1);
  // CJK sets one character per em, on lines 1.8 em apart (see languageCss).
  const em = size / 72;
  const charsPerPage = Math.floor(width / em) * Math.floor(height / (em * 1.8));
  const { words, cjk } = textStats(book);
  // Each element opens on a fresh page and often leaves a blank verso.
  return Math.ceil(words / wordsPerPage + cjk / charsPerPage + book.elements.length * 1.5);
}

/**
 * Notes at the foot of the page, laid out by paged.js's float: footnote. The
 * numbers are Recto's own, written into the text and the note: paged.js's
 * footnote counters repeat numbers (pagedjs #59), resetting them on @page
 * breaks the contents page's references (#91), and its generated call is a
 * link, which print PDFs shouldn't have. So its call and marker are hidden.
 */
const FOOTNOTE_CSS = `
.footnote { float: footnote; font-size: 0.8em; line-height: 1.3; text-indent: 0; text-align: start; hyphens: manual; -webkit-hyphens: manual; }
.footnote::footnote-call { content: none; }
.footnote::footnote-marker { content: none; }
a[data-footnote-call] { display: none; }
.footnote .note-num { margin-inline-end: 0.15em; }
@page { @footnote { float: bottom; border-top: 0.5pt solid #000; padding-top: 0.35em; margin-top: 0.8em; } }
`;

/** Large print: ragged right, no hyphenation, open leading (after the APH and ALLi guidance). */
const LARGE_PRINT_CSS = `
body { line-height: 1.5; }
.el p, .el p.opener, .el p.first { text-align: left; hyphens: manual; -webkit-hyphens: manual; }
.dropcap { font-size: 3.4em; }
`;

function cssString(text: string): string {
  return `"${text.replace(/["\\]/g, '\\$&').replace(/\n/g, ' ')}"`;
}

export function printCss(book: Book, opts: { pages: number; fontUrl: (file: string) => string; text?: string }): string {
  const theme = themeOf(book);
  const lang = book.meta.language;
  // Right-to-left books bind on the right: odd (recto) pages put the gutter on their right edge.
  const rtl = languageInfo(lang).dir === 'rtl';
  const trim = TRIMS[book.style.trim];
  const m = pageMargins(trim, opts.pages);
  const contentHeight = trim.height - m.top - m.bottom;
  const opener = book.style.startOnRecto ? 'right' : 'page';
  // Printers want text in 100% black: grey would be screened into a dot pattern.
  const head = `font-family: var(--heading-font); ${theme.runningHead} color: #000;`;
  const folio = 'font-family: var(--body-font); font-size: 0.85em; color: #000;';
  const verso = cssString(book.meta.author || book.meta.title);
  const recto = book.style.rectoHeader === 'chapter' ? 'string(chapter)' : cssString(book.meta.title);
  const blank = '@top-center { content: none; } @bottom-center { content: none; }';
  const sink = (fraction: number) => `${(contentHeight * fraction).toFixed(2)}in`;

  // Bleed adds 0.125 in at the top, bottom and outside edge (not the spine): KDP's
  // bleed page is the trim plus 0.125 in wide and 0.25 in tall. Margins grow to match.
  const bleed = book.style.bleed ? BLEED : 0;
  const pageWidth = +(trim.width + bleed).toFixed(3);
  const pageHeight = +(trim.height + 2 * bleed).toFixed(3);
  const top = +(m.top + bleed).toFixed(3);
  const bottom = +(m.bottom + bleed).toFixed(3);
  const outside = +(m.outside + bleed).toFixed(3);
  const [evenLeft, evenRight] = rtl ? [m.inside, outside] : [outside, m.inside];
  return `${fontFaceCss(bookFonts([theme.fonts.body, theme.fonts.heading], lang), opts.fontUrl, opts.text)}
${baseCss(theme, lang)}
${theme.css}
@page {
  size: ${pageWidth}in ${pageHeight}in;
  margin: ${top}in ${outside}in ${bottom}in ${m.inside}in;
}
@page :left {
  margin-left: ${evenLeft}in;
  margin-right: ${evenRight}in;
  @top-center { content: ${verso}; ${head} }
  @bottom-center { content: counter(page); ${folio} }
}
@page :right {
  margin-left: ${evenRight}in;
  margin-right: ${evenLeft}in;
  @top-center { content: ${recto}; ${head} }
  @bottom-center { content: counter(page); ${folio} }
}
@page front { ${blank} }
@page part { ${blank} }
@page :blank { ${blank} }
@page chapter:first { ${blank} }
html { font-size: ${bodySize(book)}pt; }
body { margin: 0; color: #000; line-height: 1.42; font-family: var(--body-font); }
.el p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; widows: 2; orphans: 2; }
.el p.align-center { text-align: center; }
.el p.align-right { text-align: right; }
.el h2, .el h3, .chapter-head, .matter-head { break-after: avoid; }
.el[data-matter="front"] { page: front; break-before: right; }
.el.copyright { break-before: page; }
.el.title-page { break-before: auto; padding-top: ${sink(0.18)}; }
.el.copyright { display: flex; flex-direction: column; justify-content: flex-end; min-height: ${(contentHeight - 0.1).toFixed(2)}in; }
.el.dedication, .el.epigraph { padding-top: ${sink(0.28)}; }
.el.toc .matter-head { padding-top: ${sink(0.12)}; }
.el.chapter, .el[data-matter="back"] { page: chapter; break-before: ${opener}; }
.el.part { page: part; break-before: right; }
.el.part .part-head { padding-top: ${sink(0.32)}; }
.chapter-head, .el[data-matter="back"] .matter-head { padding-top: ${sink(0.2)}; margin-bottom: 2.4em; }
.body-start { counter-reset: page 1; }
.running { string-set: chapter content(text); }
.toc-list .toc-entry { display: flex; align-items: baseline; gap: 0.5em; }
.toc-list .toc-entry .toc-title { flex: 1; }
.toc-list span.toc-entry::after { content: target-counter(attr(data-target), page); margin-inline-start: auto; }
.toc-list a.toc-entry::after { content: target-counter(attr(href), page); margin-inline-start: auto; }
img.figure { max-height: ${(contentHeight * 0.6).toFixed(2)}in; }
.heading-image img { max-height: ${(contentHeight * 0.3).toFixed(2)}in; }
.el .callout, .el .message, .el .verse .stanza, .el .table tr, .el figure { break-inside: avoid; }
.el .table thead { display: table-header-group; }
.figure-page { break-before: page; break-after: page; height: ${(contentHeight - 0.05).toFixed(2)}in; margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.figure-page img.figure { max-width: 100%; max-height: ${(contentHeight * 0.9).toFixed(2)}in; }
@page fullbleed { margin: 0; ${blank} }
.figure-bleed, .figure-spread { page: fullbleed; break-before: page; break-after: page; width: ${pageWidth}in; height: ${pageHeight}in; overflow: hidden; margin: 0; }
.figure-bleed img.figure, .figure-spread img.figure { display: block; height: 100%; max-width: none; max-height: none; margin: 0; object-fit: cover; }
.figure-bleed img.figure { width: 100%; }
.figure-spread img.figure { width: 200%; }
.figure-spread-left { break-before: left; }
.figure-spread-right img.figure { margin-left: -100%; }
${notePlacement(book) === 'page' ? FOOTNOTE_CSS : ''}
${book.style.largePrint ? LARGE_PRINT_CSS : ''}
${languageCss(lang)}
`;
}

/**
 * Spread view for on-screen previews, injected after paged.js has laid out the
 * pages. Page one sits alone on the recto side: the right for left-to-right
 * books, the left for right-to-left ones, whose spreads also read right to left.
 */
export function spreadScreenCss(rtl: boolean): string {
  return `
@media screen {
  html, body { background: transparent; margin: 0; }
  html { scrollbar-width: thin; scrollbar-color: rgba(60, 45, 25, 0.3) transparent; }
  .pagedjs_pages { display: flex; flex-wrap: wrap; flex-direction: ${rtl ? 'row-reverse' : 'row'}; width: calc(var(--pagedjs-width) * 2); margin: 16px auto; zoom: var(--recto-zoom, 1); }
  .pagedjs_page { background: #fff; box-shadow: 0 1px 4px rgba(40, 30, 10, 0.22); margin-bottom: 18px; flex: none; }
  .pagedjs_first_page { ${rtl ? 'margin-right' : 'margin-left'}: var(--pagedjs-width); }
}
`;
}
