// Vertical text for Japanese and Chinese ebooks: top to bottom, columns right
// to left, pages turning to the left, and short numbers set upright across a
// column (tate-chū-yoko). Ebook only: paged.js lays print pages out in
// horizontal geometry, so the print edition stays horizontal.

import type { Book } from '../../model/book';
import { languageInfo } from '../../i18n/languages';

/** Whether the book's language is set vertically by tradition (Japanese, Chinese). */
export function canBeVertical(lang: string): boolean {
  const { script } = languageInfo(lang);
  return script === 'japanese' || script === 'han-traditional' || script === 'han-simplified';
}

export function isVertical(book: Book): boolean {
  return !!book.style.verticalText && canBeVertical(book.meta.language);
}

/** One or two half-width digits (or !? pairs) on their own read across the column: 12月, 第3章. */
const SHORT_RUN = /(?<![0-9A-Za-z])([0-9]{1,2}|[!?]{2})(?![0-9A-Za-z])/g;

/** Wraps short runs of digits in text (never in tags or attributes) for tate-chū-yoko. */
export function tateChuYoko(html: string): string {
  return html.replace(/>([^<]+)</g, (_match, text: string) => `>${text.replace(SHORT_RUN, '<span class="tcy">$1</span>')}<`);
}

export const VERTICAL_CSS = `
html { -epub-writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; writing-mode: vertical-rl; }
body { margin: 0; }
.tcy { -epub-text-combine: horizontal; -webkit-text-combine: horizontal; text-combine-upright: all; }
.chapter-head, .matter-head { margin: 0; margin-block: 2em 2.4em; }
.part-head, .title-page, .copyright, .dedication, .epigraph { margin: 0; margin-block-start: 15%; }
.el img.figure, .cover img { max-width: 100%; max-height: 100%; }
`;
