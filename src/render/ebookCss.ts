import type { Book } from '../model/book';
import { baseCss, languageCss } from '../themes';
import { bookFonts, fontFaceCss } from '../themes/fonts';
import { themeOf } from './html';

/**
 * Stylesheet for reflowable ebooks (and the ebook preview). Sizes are in em so
 * the reader's font-size setting still works.
 * `fontUrl` embeds the book's fonts (only the script subsets `text` uses); leave
 * it out to let the reading system choose.
 */
export function ebookCss(book: Book, fontUrl?: (file: string) => string, text?: string): string {
  const theme = themeOf(book);
  const lang = book.meta.language;
  const fonts = fontUrl ? `${fontFaceCss(bookFonts([theme.fonts.body, theme.fonts.heading], lang), fontUrl, text)}\n` : '';
  return `${fonts}${baseCss(theme, lang)}
body { margin: 0 3%; line-height: 1.45; widows: 2; orphans: 2; }
.el p { text-align: justify; -webkit-hyphens: auto; hyphens: auto; }
.el p.align-center { text-align: center; }
.el p.align-right { text-align: right; }
.el p.empty { text-indent: 0; }
.chapter-head, .matter-head { margin: 3em 0 2.4em; page-break-after: avoid; break-after: avoid; }
.part-head { margin-top: 30%; }
.title-page { margin-top: 18%; }
.copyright { margin-top: 12%; }
.dedication, .epigraph { margin-top: 28%; }
.cover { margin: 0; padding: 0; text-align: center; }
.cover img { max-width: 100%; max-height: 98vh; }
nav#toc ol { list-style: none; padding-left: 0; padding-right: 0; }
nav#toc ol ol { padding-inline-start: 1.5em; }
${theme.css}
${languageCss(lang)}`;
}
