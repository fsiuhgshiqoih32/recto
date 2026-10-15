// Builds the HTML document that paged.js lays out into print pages. The same
// document drives the in-app spread preview, "Save as PDF" and the headless CLI.

import type { Book } from '../../model/book';
import { anchorId, esc, escAttr, renderBook, themeOf } from '../../render/html';
import { ORNAMENTS } from '../../themes/ornaments';
import { languageInfo } from '../../i18n/languages';
import { breaksScript } from './breaks';
import { estimatePages, printCss, spreadScreenCss } from './pageCss';

export interface PrintDocumentOptions {
  /** Absolute URL for a font file. */
  fontUrl: (file: string) => string;
  /** Absolute URL of paged.polyfill.js. */
  pagedUrl: string;
  /** Page count used to size the gutter. Defaults to an estimate. */
  pages?: number;
  /** Render only these elements (previews). Defaults to the whole book. */
  elementIds?: string[];
  /** Show pages as two-page spreads on screen. */
  spreads?: boolean;
  /** Identifies this render in the message posted to the parent window. */
  renderId?: string;
  /** Hyphenator for the book's language (see i18n/hyphenate). */
  hyphenate?: (text: string) => string;
}

/** Message posted to the parent window once paged.js has finished. */
export interface PagedMessage {
  type: 'recto:paged';
  renderId: string;
  pages: number;
}

export function printDocument(book: Book, opts: PrintDocumentOptions): string {
  const theme = themeOf(book);
  const { dir } = languageInfo(book.meta.language);
  const pages = opts.pages ?? estimatePages(book);
  const rendered = renderBook({
    book,
    theme,
    target: 'print',
    hrefFor: (el) => `#${anchorId(el)}`,
    ornament: (id) => ORNAMENTS[id],
    hyphenate: opts.hyphenate,
    links: false,
  });
  const firstBody = book.elements.find((el) => el.matter === 'body');
  const wanted = opts.elementIds ? new Set(opts.elementIds) : null;
  const sections = rendered
    .filter(({ element }) => !wanted || wanted.has(element.id))
    .map(({ element, html }) => (element === firstBody ? html.replace('class="el ', 'class="el body-start ') : html))
    .join('\n');

  // paged.js resets the page counter with a CSS counter-reset on the page that
  // holds .body-start, but current Chromium does not carry that reset to the
  // following pages. So folios are numbered here instead: count from the page
  // that starts the body, and only on pages whose folio box is not suppressed.
  const afterScript = `
function rectoNumberFolios() {
  var pages = Array.prototype.slice.call(document.querySelectorAll('.pagedjs_page'));
  var start = document.querySelector('.pagedjs_page .body-start');
  var startIndex = start ? pages.indexOf(start.closest('.pagedjs_page')) : 0;
  pages.forEach(function (page, i) {
    var boxes = page.querySelectorAll('.pagedjs_margin-content');
    for (var j = 0; j < boxes.length; j++) {
      var content = getComputedStyle(boxes[j], '::after').content || '';
      if (content.indexOf('counter(page') !== -1 && i >= startIndex) {
        boxes[j].setAttribute('data-folio', String(i - startIndex + 1));
      }
    }
  });
  var style = document.createElement('style');
  style.textContent = '.pagedjs_margin-content[data-folio]::after { content: attr(data-folio) !important; }';
  document.head.appendChild(style);
}
window.PagedConfig = {
  auto: true,
  after: function (flow) {
    // Layout is final. Stop paged.js watching page sizes, or zooming the
    // preview reads as content underflow and it tries to re-flow pages.
    (flow.pages || []).forEach(function (page) { if (page.removeListeners) page.removeListeners(); });
    rectoNumberFolios();
    window.__rectoPages = flow.total;
    ${
      opts.spreads
        ? `var style = document.createElement('style');
    style.textContent = ${JSON.stringify(spreadScreenCss(dir === 'rtl'))};
    document.head.appendChild(style);
    var fit = function () {
      var page = document.querySelector('.pagedjs_page');
      if (!page) return;
      var width = page.offsetWidth * 2 + 32;
      document.documentElement.style.setProperty('--recto-zoom', String(Math.min(1, window.innerWidth / width)));
    };
    fit();
    window.addEventListener('resize', fit);`
        : ''
    }
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'recto:paged', renderId: ${JSON.stringify(opts.renderId ?? '')}, pages: flow.total }, '*');
    }
  }
};`;

  return `<!DOCTYPE html>
<html lang="${escAttr(book.meta.language || 'en')}"${dir === 'rtl' ? ' dir="rtl"' : ''}>
<head>
<meta charset="utf-8"/>
<title>${esc(book.meta.title)}</title>
<style>
${printCss(book, { pages, fontUrl: opts.fontUrl, text: `${book.meta.title} ${book.meta.author} ${sections}` })}
</style>
<script>${afterScript}</script>
<script src="${escAttr(opts.pagedUrl)}"></script>
<script>${breaksScript}</script>
</head>
<body>
${sections}
</body>
</html>
`;
}
