// Preflight: the checks stores and printers apply on upload, run before the
// author uploads. Static checks look at the book; layout checks look at the
// laid-out print pages; EPUB checks look at the built file.

import type { BlockNode, Book, BookElement } from '../model/book';
import { GENERATED_KINDS, KIND_LABEL, docText } from '../model/book';
import { TRIMS, pageMargins, trimLabel } from '../export/print/pageCss';
import { pageRange, printersFor } from '../export/print/trims';
import { imageInfo } from './images';
import { isbn13, isbnProblem } from './isbn';
import { nameVariants } from './names';
import { N_, t } from '../i18n/ui';

export type Severity = 'error' | 'warning' | 'info' | 'ok';
export type Area = 'details' | 'text' | 'print' | 'ebook' | 'accessibility';

export interface Finding {
  area: Area;
  severity: Severity;
  title: string;
  detail?: string;
  /** The element to open to fix it. */
  elementId?: string;
}

export const AREA_LABEL: Record<Area, string> = {
  details: N_('Book details'),
  text: N_('Text'),
  print: N_('Print edition'),
  ebook: N_('Ebook'),
  accessibility: N_('Image descriptions'),
};

/** KDP's recommended image resolution, and the point below which prints look soft. */
export const GOOD_PPI = 300;
export const POOR_PPI = 200;
/** KDP charges this per megabyte of ebook (US store, 70% royalty). */
export const KDP_DELIVERY_PER_MB = 0.15;

const PLACEHOLDERS: [RegExp, string][] = [
  [/\blorem ipsum\b/i, 'Lorem ipsum'],
  [/\bTK\b/, 'TK'],
  [/\bTODO\b/, 'TODO'],
  [/\bXXX+\b/, 'XXX'],
  [/\[(?:insert|add|tbd|todo|placeholder)\b[^\]]*\]/i, '[insert …]'],
  [/\?{3,}/, '???'],
];

export function elementName(el: BookElement): string {
  return el.title.trim() || t(KIND_LABEL[el.kind]);
}

function images(blocks: BlockNode[] | undefined, out: Extract<BlockNode, { type: 'image' }>[] = []) {
  for (const block of blocks ?? []) {
    if (block.type === 'image') out.push(block);
    else if ('content' in block && Array.isArray(block.content)) images(block.content as BlockNode[], out);
  }
  return out;
}

/** Width and height of the print text block, in inches. */
export function textBlock(book: Book, pages = 200): { width: number; height: number } {
  const trim = TRIMS[book.style.trim];
  const m = pageMargins(trim, pages);
  return { width: trim.width - m.inside - m.outside, height: trim.height - m.top - m.bottom };
}

/**
 * The resolution an image prints at. Print CSS shows images at their CSS pixel
 * size (96 per inch), shrunk to fit the text block's width and 60% of its height.
 */
export function printPpi(width: number, height: number, block: { width: number; height: number }): number {
  const printedWidth = Math.min(width / 96, block.width, ((block.height * 0.6) / height) * width);
  return Math.round(width / printedWidth);
}

export function checkBook(book: Book): Finding[] {
  const findings: Finding[] = [];
  const { meta } = book;

  if (!meta.title.trim() || meta.title.trim() === 'Untitled') findings.push({ area: 'details', severity: 'warning', title: t('The book has no title yet'), detail: t('Stores show it, and it runs across the top of right-hand pages.') });
  if (!meta.author.trim()) findings.push({ area: 'details', severity: 'warning', title: t('No author name'), detail: t('Running heads, the title page and the ebook metadata use it.') });
  const isbnCheck = (value: string, edition: string) => {
    if (!value.trim()) return;
    const problem = isbnProblem(value);
    if (problem) {
      findings.push({
        area: 'details',
        severity: 'error',
        title: edition === 'ebook' ? t('The ebook ISBN isn\'t valid') : t('The paperback ISBN isn\'t valid'),
        detail: problem === 'length' ? t('“{isbn}” should have 10 or 13 digits.', { isbn: value }) : t('“{isbn}” has the wrong check digit, so a digit is probably mistyped.', { isbn: value }),
      });
    }
  };
  isbnCheck(meta.isbnEbook, 'ebook');
  isbnCheck(meta.isbnPrint, 'paperback');
  const ebookIsbn = isbn13(meta.isbnEbook);
  if (ebookIsbn && ebookIsbn === isbn13(meta.isbnPrint)) {
    findings.push({ area: 'details', severity: 'error', title: t('The ebook and paperback share an ISBN'), detail: t('Each edition needs its own ISBN.') });
  }

  const binding = book.style.binding ?? 'paperback';
  const trim = TRIMS[book.style.trim];
  const printers = printersFor(trim, binding);
  if (!printers.includes('KDP')) {
    findings.push({
      area: 'print',
      severity: printers.length ? 'info' : 'error',
      title: binding === 'hardcover' ? t('KDP doesn\'t print {size} hardcovers', { size: trimLabel(trim) }) : t('KDP doesn\'t print {size} paperbacks', { size: trimLabel(trim) }),
      detail: printers.length ? t('{printers} does. For KDP, pick another trim size in the Style tab.', { printers: printers.join(t(' and ')) }) : t('Pick another trim size or binding in the Style tab.'),
    });
  }

  const times = (n: number) => (n === 1 ? t('once') : n === 2 ? t('twice') : t('{count} times', { count: n }));
  for (const v of nameVariants(book).slice(0, 12)) {
    findings.push({
      area: 'text',
      severity: 'info',
      title: t('“{variant}” ({variantTimes}) or “{name}” ({nameTimes})?', { variant: v.variant, variantTimes: times(v.variantCount), name: v.name, nameTimes: times(v.count) }),
      detail: t('A name spelled two ways. If both are right, ignore this.'),
      elementId: v.elementId,
    });
  }
  const block = textBlock(book);
  let undescribed = 0;
  for (const el of book.elements) {
    const text = docText(el.content);
    for (const [pattern, label] of PLACEHOLDERS) {
      if (pattern.test(text) || pattern.test(el.title)) {
        findings.push({ area: 'text', severity: 'warning', title: t('Placeholder text in “{section}”', { section: elementName(el) }), detail: t('Found “{text}”.', { text: label }), elementId: el.id });
        break;
      }
    }
    const figures = images(el.content.content);
    // Part and volume pages are often just a title.
    if (!GENERATED_KINDS.has(el.kind) && el.kind !== 'part' && el.kind !== 'volume' && !text.trim() && !figures.length) {
      findings.push({ area: 'text', severity: 'warning', title: t('“{section}” is empty', { section: elementName(el) }), elementId: el.id });
    }
    const missing = figures.filter((img) => !img.attrs.alt?.trim()).length;
    if (missing) {
      undescribed += missing;
      findings.push({
        area: 'accessibility',
        severity: 'warning',
        title: missing === 1 ? t('An image in “{section}” has no description', { section: elementName(el) }) : t('{count} images in “{section}” have no description', { count: missing, section: elementName(el) }),
        detail: t('Screen readers read the description aloud. Select the image in the editor to add one.'),
        elementId: el.id,
      });
    }
    for (const img of figures) {
      const info = imageInfo(img.attrs.src);
      if (!info) continue;
      const ppi = printPpi(info.width, info.height, block);
      if (ppi < GOOD_PPI) {
        findings.push({
          area: 'print',
          severity: ppi < POOR_PPI ? 'warning' : 'info',
          title: t('An image in “{section}” prints at {ppi} PPI', { section: elementName(el), ppi }),
          detail: ppi < POOR_PPI
            ? t('It is {width} × {height} px. Printers recommend {good} PPI; at this size it will look soft.', { width: info.width, height: info.height, good: GOOD_PPI })
            : t('It is {width} × {height} px. Printers recommend {good} PPI; it will look slightly soft.', { width: info.width, height: info.height, good: GOOD_PPI }),
          elementId: el.id,
        });
      }
    }
  }
  const anyImages = book.elements.some((el) => images(el.content.content).length > 0);
  if (anyImages && !undescribed) findings.push({ area: 'accessibility', severity: 'ok', title: t('Every image has a description') });

  if (!meta.cover) {
    findings.push({ area: 'ebook', severity: 'warning', title: t('No ebook cover'), detail: t('Apple Books and Kobo expect the cover inside the EPUB. KDP and Google Play also take it separately.') });
  } else {
    const cover = imageInfo(meta.cover);
    if (cover) {
      if (cover.width < 625 || cover.height < 1000) {
        findings.push({ area: 'ebook', severity: 'error', title: t('The cover is too small ({width} × {height} px)', { width: cover.width, height: cover.height }), detail: t('KDP needs at least 625 × 1000 px; 1600 × 2560 px is ideal.') });
      } else if (cover.height / cover.width < 1.5) {
        findings.push({ area: 'ebook', severity: 'info', title: t('The cover is wider than most'), detail: t('It is {width} × {height} px. Stores display covers at about 1.6:1 (1600 × 2560 px).', { width: cover.width, height: cover.height }) });
      } else {
        findings.push({ area: 'ebook', severity: 'ok', title: t('Cover {width} × {height} px', { width: cover.width, height: cover.height }) });
      }
      if (!/^image\/(jpeg|png)$/.test(cover.mediaType)) findings.push({ area: 'ebook', severity: 'warning', title: t('The cover isn’t a JPEG or PNG'), detail: t('Stores accept JPEG covers everywhere; use JPEG or PNG.') });
    }
  }
  return findings;
}

/** Facts gathered from a laid-out print document. */
export interface LayoutStats {
  pages: number;
  /** Runs of consecutive blank pages, by first page number (1-based), ignoring the last pages. */
  blankRuns: { start: number; length: number }[];
  /** Images as printed. */
  images: { elementId?: string; width: number; ppi: number }[];
  /** The gutter (inside margin) the layout used, in inches. */
  inside: number;
}

export function checkLayout(book: Book, stats: LayoutStats): Finding[] {
  const findings: Finding[] = [];
  const trim = TRIMS[book.style.trim];
  const binding = book.style.binding ?? 'paperback';
  const range = pageRange(binding);
  if (stats.pages < range.min) {
    findings.push({ area: 'print', severity: 'error', title: binding === 'hardcover' ? t('{pages} pages is too short for a hardcover', { pages: stats.pages }) : t('{pages} pages is too short for a paperback', { pages: stats.pages }), detail: t('{printer} needs at least {min} pages. A larger body size or a smaller trim adds pages.', { printer: t(range.printer), min: range.min }) });
  } else if (stats.pages > range.max) {
    findings.push({ area: 'print', severity: 'error', title: binding === 'hardcover' ? t('{pages} pages is too long for one hardcover', { pages: stats.pages }) : t('{pages} pages is too long for one paperback', { pages: stats.pages }), detail: t('{printer} takes at most {max} pages. A larger trim size fits more on each page.', { printer: t(range.printer), max: range.max }) });
  } else {
    findings.push({ area: 'print', severity: 'ok', title: t('{pages} pages at {size}', { pages: stats.pages, size: trimLabel(trim) }), detail: t('Inside margin {inside} in, which meets KDP\'s minimum for this page count.', { inside: stats.inside }) });
  }
  if (stats.pages % 2) findings.push({ area: 'print', severity: 'info', title: t('Odd page count'), detail: t('Printers add a blank page at the end to make it even.') });
  for (const run of stats.blankRuns) {
    if (run.length > 4) {
      findings.push({ area: 'print', severity: 'warning', title: t('{count} blank pages in a row from page {page}', { count: run.length, page: run.start }), detail: t('KDP rejects interiors with more than four consecutive blank pages mid-book.') });
    }
  }
  for (const img of stats.images) {
    if (img.ppi < GOOD_PPI) {
      const el = book.elements.find((e) => e.id === img.elementId);
      findings.push({
        area: 'print',
        severity: img.ppi < POOR_PPI ? 'warning' : 'info',
        title: el ? t('An image in “{section}” prints at {ppi} PPI', { section: elementName(el), ppi: img.ppi }) : t('An image prints at {ppi} PPI', { ppi: img.ppi }),
        detail: t('Printers recommend {good} PPI.', { good: GOOD_PPI }),
        elementId: img.elementId,
      });
    }
  }
  return findings;
}

/** What KDP charges per sale to deliver an ebook of this size (US store, 70% royalty). */
export function deliveryFee(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * KDP_DELIVERY_PER_MB * 100) / 100;
}

/** "about $0.21", or "under a cent" for small books. */
export function feeText(bytes: number): string {
  const fee = deliveryFee(bytes);
  return fee < 0.01 ? t('under a cent') : t('about ${fee}', { fee: fee.toFixed(2) });
}

export function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface EpubMessage {
  severity: string;
  id: string;
  message: string;
  path?: string;
}

export function checkEpub(messages: EpubMessage[], bytes: number): Finding[] {
  const findings: Finding[] = [];
  const problems = messages.filter((m) => m.severity === 'fatal' || m.severity === 'error' || m.severity === 'warning');
  for (const m of problems) {
    findings.push({ area: 'ebook', severity: m.severity === 'warning' ? 'warning' : 'error', title: `EPUBCheck ${m.id}`, detail: `${m.message}${m.path ? ` (${m.path})` : ''}` });
  }
  if (!problems.length) findings.push({ area: 'ebook', severity: 'ok', title: t('The EPUB passes validation'), detail: t('Checked with epubcheck-ts, a port of the official EPUBCheck that stores use.') });
  findings.push({
    area: 'ebook',
    severity: 'info',
    title: t('The EPUB is {size}', { size: formatSize(bytes) }),
    detail: t('At KDP’s 70% royalty, delivery costs {fee} per sale in the US store (${rate} per MB).', { fee: feeText(bytes), rate: KDP_DELIVERY_PER_MB.toFixed(2) }),
  });
  return findings;
}

export const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2, ok: 3 };
