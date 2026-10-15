// Paperback cover geometry. A print cover is one wrap-around image: back
// cover, spine and front cover side by side, with bleed on every outer edge.
// KDP's figures (help topic G201953020): spine width is the page count times
// the paper's thickness per page; text needs a safe margin; the barcode sits
// low on the back cover.

import type { Book } from '../../model/book';
import { TRIMS } from '../print/trims';

export type Paper = 'white' | 'cream' | 'color';

/** Inches of spine per page. */
export const PAPER_THICKNESS: Record<Paper, number> = { white: 0.002252, cream: 0.0025, color: 0.002347 };
export const PAPER_LABEL: Record<Paper, string> = { white: 'White paper', cream: 'Cream paper', color: 'Premium color' };

/** Bleed beyond the trim on every outer edge, in inches. */
export const BLEED = 0.125;
/** Keep text this far inside the trim and away from the spine folds. */
export const SAFE = 0.125;
export const SPINE_SAFE = 0.0625;
/** KDP only allows spine text on books with more than this many pages. */
export const SPINE_TEXT_MIN_PAGES = 80;
/** KDP's barcode area, in inches, and its distance from the spine and the bottom trim. */
export const BARCODE = { width: 2, height: 1.2, inset: 0.25 };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoverWrap {
  pages: number;
  paper: Paper;
  /** Whole cover including bleed, inches. */
  width: number;
  height: number;
  spine: number;
  spineText: boolean;
  trim: { width: number; height: number };
  /** Areas within the wrap, in inches from its top left corner. */
  back: Rect;
  spineArea: Rect;
  front: Rect;
  barcode: Rect;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function coverWrap(book: Book, pages: number, paper: Paper = book.style.paper ?? 'white'): CoverWrap {
  const trim = TRIMS[book.style.trim];
  const spine = round(pages * PAPER_THICKNESS[paper]);
  const width = round(BLEED + trim.width + spine + trim.width + BLEED);
  const height = round(BLEED + trim.height + BLEED);
  const back = { x: BLEED, y: BLEED, width: trim.width, height: trim.height };
  const spineArea = { x: BLEED + trim.width, y: BLEED, width: spine, height: trim.height };
  const front = { x: BLEED + trim.width + spine, y: BLEED, width: trim.width, height: trim.height };
  const barcode = {
    x: round(back.x + back.width - BARCODE.inset - BARCODE.width),
    y: round(back.y + back.height - BARCODE.inset - BARCODE.height),
    width: BARCODE.width,
    height: BARCODE.height,
  };
  return { pages, paper, width, height, spine, spineText: pages >= SPINE_TEXT_MIN_PAGES, trim: { width: trim.width, height: trim.height }, back, spineArea, front, barcode };
}

/** A rectangle shrunk by `by` on every side. */
export function inset(rect: Rect, by: number, byX = by): Rect {
  return { x: round(rect.x + byX), y: round(rect.y + by), width: round(rect.width - 2 * byX), height: round(rect.height - 2 * by) };
}

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A cover template to design over (Affinity, Illustrator, Inkscape, Canva):
 * bleed, trim and fold lines, text-safe areas and the barcode box, at the
 * cover's exact size. Units are points (72 per inch).
 */
export function templateSvg(book: Book, wrap: CoverWrap): string {
  const pt = (n: number) => +(n * 72).toFixed(2);
  const rect = (r: Rect, attrs: string) => `<rect x="${pt(r.x)}" y="${pt(r.y)}" width="${pt(r.width)}" height="${pt(r.height)}" ${attrs}/>`;
  const label = (x: number, y: number, text: string, attrs = '') =>
    `<text x="${pt(x)}" y="${pt(y)}" ${attrs}>${esc(text)}</text>`;
  const W = wrap.width;
  const H = wrap.height;
  const safe = 'fill="none" stroke="#1f6fd1" stroke-width="0.75" stroke-dasharray="4 3"';
  const fold = `M${pt(wrap.spineArea.x)} 0V${pt(H)}M${pt(wrap.spineArea.x + wrap.spineArea.width)} 0V${pt(H)}`;
  const spineSafe = inset(wrap.spineArea, SAFE, Math.min(SPINE_SAFE, wrap.spineArea.width / 2));
  const spineLabel = `${book.meta.title || 'Title'}${book.meta.author ? ` · ${book.meta.author}` : ''}`;
  const cx = wrap.spineArea.x + wrap.spineArea.width / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}in" height="${H}in" viewBox="0 0 ${pt(W)} ${pt(H)}" font-family="Helvetica, Arial, sans-serif">
<title>${esc(`${book.meta.title || 'Book'} cover template: ${W} × ${H} in, ${wrap.pages} pages, ${PAPER_LABEL[wrap.paper].toLowerCase()}`)}</title>
<rect width="${pt(W)}" height="${pt(H)}" fill="#fde8e8"/>
${rect({ x: BLEED, y: BLEED, width: W - 2 * BLEED, height: H - 2 * BLEED }, 'fill="#ffffff" stroke="#c0392b" stroke-width="0.75"')}
<path d="${fold}" stroke="#7f8c8d" stroke-width="0.75" stroke-dasharray="2 2"/>
${rect(inset(wrap.back, SAFE), safe)}
${rect(inset(wrap.front, SAFE), safe)}
${wrap.spineText ? rect(spineSafe, safe) : ''}
${rect(wrap.barcode, 'fill="#fff6cc" stroke="#b7950b" stroke-width="0.75"')}
<g fill="#5d6d7e" font-size="9" text-anchor="middle">
${label(wrap.back.x + wrap.back.width / 2, wrap.back.y + 0.5, 'BACK COVER')}
${label(wrap.front.x + wrap.front.width / 2, wrap.front.y + 0.5, 'FRONT COVER')}
${label(wrap.barcode.x + wrap.barcode.width / 2, wrap.barcode.y + wrap.barcode.height / 2, 'Barcode area')}
${label(wrap.front.x + wrap.front.width / 2, H - 0.32, `Trim ${wrap.trim.width} × ${wrap.trim.height} in · bleed ${BLEED} in · keep text inside the blue lines`)}
${label(wrap.back.x + wrap.back.width / 2, H - 0.32, `Full cover ${W} × ${H} in · spine ${wrap.spine} in (${wrap.pages} pages, ${PAPER_LABEL[wrap.paper].toLowerCase()})`)}
</g>
<text transform="translate(${pt(cx)} ${pt(H / 2)}) rotate(90)" fill="#5d6d7e" font-size="${Math.min(9, pt(wrap.spine) * 0.6).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${esc(wrap.spineText ? spineLabel : 'Spine: no text below 80 pages')}</text>
</svg>
`;
}
