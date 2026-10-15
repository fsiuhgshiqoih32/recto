// Where each printed page begins, so the ebook can carry the print edition's
// page numbers (an EPUB page list, which Kindle shows as "real page numbers").

/** The start of one printed page. */
export interface PageStart {
  /** The number printed on the page. Front matter, which prints no folio, gets roman numerals. */
  label: string;
  /** The book element the page begins in, or null for a blank page. */
  elementId: string | null;
  /** The page's first words, without soft hyphens or line breaks. */
  text: string;
}

/**
 * Reads where each page of a laid-out paged.js document starts. It runs inside
 * that document (the CLI hands it to Playwright as source text), so it uses
 * only the DOM: no imports, nothing from the enclosing module.
 */
export function readPageStarts(doc: Document = document): PageStart[] {
  const numerals: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  const roman = (n: number) => numerals.reduce((out, [value, numeral]) => {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
    return out;
  }, '');
  const pages = Array.from(doc.querySelectorAll('.pagedjs_page'));
  const start = doc.querySelector('.pagedjs_page .body-start')?.closest('.pagedjs_page');
  const startIndex = start ? pages.indexOf(start) : 0;
  return pages.map((page, i) => {
    const label = i >= startIndex ? String(i - startIndex + 1) : roman(i + 1);
    const content = page.querySelector('.pagedjs_page_content');
    let elementId: string | null = null;
    let text = '';
    if (content) {
      // Text filter 4 is NodeFilter.SHOW_TEXT; the constant keeps this free of globals.
      const walker = doc.createTreeWalker(content, 4);
      for (let node = walker.nextNode(); node && text.length < 120; node = walker.nextNode()) {
        const parent = node.parentElement;
        // Footnotes print at the foot of the page but belong to the text that cites them.
        if (!parent || parent.closest('.footnote, .pagedjs_footnote_area, svg, [aria-hidden="true"]')) continue;
        const value = (node.nodeValue ?? '').replace(/­/g, '');
        if (!text && !value.trim()) continue;
        // paged.js keeps an element's id as data-id on the pages it continues onto.
        const section = parent.closest('section[data-id^="el-"], section[id^="el-"]');
        const id = (section?.getAttribute('data-id') || section?.id || '').replace(/^el-/, '') || null;
        if (!text) elementId = id;
        else if (id !== elementId) break;
        text += value;
      }
    }
    return { label, elementId, text: text.replace(/\s+/g, ' ').trim().slice(0, 80) };
  });
}
