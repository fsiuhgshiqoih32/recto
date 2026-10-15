// Print page numbers in the ebook: a page-break marker where each printed page
// begins, and a page list in the navigation document. The positions come from
// the print layout (src/export/print/pageMap.ts) and are found again in the
// ebook's text, which comes from the same renderer.

import { escAttr } from '../../render/html';
import type { PageStart } from '../print/pageMap';

/** A page break in one element: before the character at `offset` (whitespace ignored), at the start (-1) or at the end (Infinity). */
export interface PageMarker {
  label: string;
  offset: number;
}

export interface PagePlan {
  /** Markers per element id, in reading order. */
  markers: Map<string, PageMarker[]>;
  /** Every page, in order, with the element its marker sits in. */
  pages: { label: string; elementId: string }[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The visible text of a markup fragment with whitespace removed, and where each character sits in the markup. */
export function textIndex(html: string): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  for (let i = 0; i < html.length; ) {
    const ch = html[i];
    if (ch === '<') {
      const end = html.indexOf('>', i);
      i = end < 0 ? html.length : end + 1;
      continue;
    }
    let char = ch;
    let next = i + 1;
    if (ch === '&') {
      const end = html.indexOf(';', i);
      if (end > i && end - i < 12) {
        const name = html.slice(i + 1, end);
        char = name.startsWith('#x') ? String.fromCodePoint(parseInt(name.slice(2), 16)) : name.startsWith('#') ? String.fromCodePoint(Number(name.slice(1))) : ENTITIES[name] ?? '?';
        next = end + 1;
      }
    }
    if (!/\s/.test(char) && char !== '­') {
      text += char;
      at.push(i);
    }
    i = next;
  }
  return { text, at };
}

const squash = (s: string) => s.replace(/[\s­]+/g, '');

/**
 * Finds each printed page's first words in the ebook's text. Pages that can't
 * be placed (blank pages, pages in print-only sections, text that differs
 * between editions) take the position of the next page that can, so every
 * page keeps a marker and the list stays in order.
 */
export function placePageBreaks(pages: PageStart[], elements: { id: string; html: string }[]): PagePlan {
  const byId = new Map(elements.map((el) => [el.id, el]));
  const order = new Map(elements.map((el, i) => [el.id, i]));
  const indexes = new Map<string, string>();
  const textOf = (id: string) => {
    let text = indexes.get(id);
    if (text === undefined) {
      text = textIndex(byId.get(id)!.html).text;
      indexes.set(id, text);
    }
    return text;
  };
  const markers = new Map<string, PageMarker[]>();
  const placed: { label: string; elementId: string }[] = [];
  let pending: string[] = [];
  // The reading position reached so far: an element, and a text offset in it.
  let current = { index: -1, offset: -1 };

  const place = (elementId: string, offset: number, labels: string[]) => {
    const list = markers.get(elementId) ?? [];
    for (const label of labels) {
      list.push({ label, offset });
      placed.push({ label, elementId });
    }
    markers.set(elementId, list);
  };

  for (const page of pages) {
    const index = page.elementId ? order.get(page.elementId) : undefined;
    const needle = squash(page.text);
    if (index === undefined || !needle || index < current.index) {
      pending.push(page.label);
      continue;
    }
    const text = textOf(page.elementId!);
    const from = index === current.index ? current.offset + 1 : 0;
    let found = -1;
    for (const length of [48, 24, 12]) {
      found = text.indexOf(needle.slice(0, length), from);
      if (found >= 0 || needle.length <= length) break;
    }
    if (found < 0 && index > current.index) found = 0; // the section is new but its text differs: mark its start
    if (found < 0) {
      pending.push(page.label);
      continue;
    }
    place(page.elementId!, found === 0 ? -1 : found, [...pending, page.label]);
    pending = [];
    current = { index, offset: found };
  }
  // Trailing pages with nothing to place (blank end pages) go at the end of the last section.
  const last = elements[current.index] ?? elements[elements.length - 1];
  if (pending.length && last) place(last.id, Infinity, pending);
  return { markers, pages: placed };
}

export function pageAnchor(label: string): string {
  return `page-${label}`;
}

function marker(label: string): string {
  return `<span epub:type="pagebreak" role="doc-pagebreak" id="${escAttr(pageAnchor(label))}" aria-label="${escAttr(label)}"></span>`;
}

/** Writes the page-break markers into an element's section markup. */
export function insertPageBreaks(html: string, markers: PageMarker[]): string {
  if (!markers.length) return html;
  const { at } = textIndex(html);
  const sectionStart = html.indexOf('>', html.indexOf('<section')) + 1;
  const sectionEnd = html.lastIndexOf('</section>');
  const position = (offset: number) =>
    offset < 0 ? sectionStart : offset === Infinity || offset >= at.length ? (sectionEnd < 0 ? html.length : sectionEnd) : at[offset];
  // Insert from the end so earlier positions stay valid; markers at one spot keep their order.
  const inserts = markers.map((m, i) => ({ at: position(m.offset), html: marker(m.label), i }));
  inserts.sort((a, b) => b.at - a.at || b.i - a.i);
  let out = html;
  for (const insert of inserts) out = out.slice(0, insert.at) + insert.html + out.slice(insert.at);
  return out;
}

/** The page list for the navigation document. */
export function pageListNav(pages: { label: string; href: string }[], heading: string): string {
  return (
    `<nav epub:type="page-list" id="page-list" hidden="hidden">\n<h2>${heading}</h2>\n<ol>\n` +
    pages.map((p) => `  <li><a href="${escAttr(p.href)}#${escAttr(pageAnchor(p.label))}">${p.label}</a></li>`).join('\n') +
    `\n</ol>\n</nav>\n`
  );
}
