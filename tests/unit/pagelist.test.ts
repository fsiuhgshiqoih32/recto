// @vitest-environment happy-dom
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { insertPageBreaks, placePageBreaks, textIndex } from '../../src/export/epub/pageList';
import { buildEpub } from '../../src/export/epub/package';
import { renderBook, themeOf } from '../../src/render/html';
import { sampleBook } from '../../src/model/sample';
import type { PageStart } from '../../src/export/print/pageMap';

const chapter = (id: string, body: string) =>
  `<section class="el chapter" id="el-${id}" data-matter="body" epub:type="chapter" role="doc-chapter">\n<header class="chapter-head"><h1 class="chapter-heading"><span class="chapter-label">Chapter One</span><span class="chapter-title running">The Lamp</span></h1></header>\n<div class="body">\n${body}</div>\n</section>\n`;

describe('print page numbers in the ebook', () => {
  it('indexes the visible text of markup, decoding entities and skipping whitespace', () => {
    const { text, at } = textIndex('<p class="x">Fish &amp; chips</p>\n<p>“Yes”</p>');
    expect(text).toBe('Fish&chips“Yes”');
    expect(at[4]).toBe('<p class="x">Fish '.length); // the & of &amp;
  });

  it('marks where each printed page starts, with blank pages before the next page', () => {
    const elements = [
      { id: 'a', html: chapter('a', '<p>The lamp was lit at a quarter past five, which the ledger would have noted.</p>\n<p>Ada read it three times. Then she went down to the storeroom and found a fresh notebook.</p>\n') },
      { id: 'b', html: chapter('b', '<p>The fog comes in October, Bea said, and it does not ask.</p>\n') },
    ];
    const pages: PageStart[] = [
      { label: '1', elementId: 'a', text: 'Chapter OneThe Lamp The lamp was lit at a quarter past five' },
      { label: '2', elementId: 'a', text: 'ledger would have noted. Ada read it three' },
      { label: '3', elementId: null, text: '' }, // a blank left-hand page
      { label: '4', elementId: 'b', text: 'Chapter OneThe Lamp The fog comes in October' },
    ];
    const plan = placePageBreaks(pages, elements);
    expect(plan.pages.map((p) => `${p.label}@${p.elementId}`)).toEqual(['1@a', '2@a', '3@b', '4@b']);
    const a = insertPageBreaks(elements[0].html, plan.markers.get('a')!);
    expect(XMLValidator.validate(`<root xmlns:epub="x">${a}</root>`)).toBe(true);
    // Page 1 opens the section; page 2 falls mid-paragraph, before "ledger".
    expect(a).toMatch(/role="doc-chapter"><span epub:type="pagebreak" role="doc-pagebreak" id="page-1" aria-label="1"><\/span>/);
    expect(a).toContain('which the <span epub:type="pagebreak" role="doc-pagebreak" id="page-2" aria-label="2"></span>ledger would');
    const b = insertPageBreaks(elements[1].html, plan.markers.get('b')!);
    expect(b.indexOf('id="page-3"')).toBeLessThan(b.indexOf('id="page-4"'));
  });

  it('still marks a page whose text differs between editions', () => {
    const elements = [{ id: 'a', html: chapter('a', '<p>One.</p>\n') }, { id: 'b', html: chapter('b', '<p>Two.</p>\n') }];
    // Print shows a store link's address, the ebook a link: the start of the section is the best place.
    const plan = placePageBreaks([{ label: '1', elementId: 'a', text: 'One.' }, { label: '2', elementId: 'b', text: 'books2read.com/example' }], elements);
    expect(plan.markers.get('b')).toEqual([{ label: '2', offset: -1 }]);
  });

  it('adds a page list, the print source and the accessibility features to the EPUB', async () => {
    const book = sampleBook();
    book.meta.isbnPrint = '978-1-23456-789-7';
    const rendered = renderBook({ book, theme: themeOf(book), target: 'epub', hrefFor: () => '', ornament: () => '' });
    const body = rendered.filter((r) => r.element.matter === 'body');
    // Two pages per body element, the second starting 40 characters in.
    const pageStarts: PageStart[] = body.flatMap((r, i) => {
      const text = textIndex(r.html).text;
      return [
        { label: String(2 * i + 1), elementId: r.element.id, text: text.slice(0, 50) },
        { label: String(2 * i + 2), elementId: r.element.id, text: text.slice(40, 90) },
      ];
    });
    const zip = await JSZip.loadAsync(await buildEpub(book, { pageStarts, modified: new Date('2026-01-02T03:04:05Z') }));
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(XMLValidator.validate(nav)).toBe(true);
    expect(nav).toContain('<nav epub:type="page-list" id="page-list" hidden="hidden">');
    expect(nav.match(/#page-\d+"/g)).toHaveLength(pageStarts.length);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:source id="pagination-source">urn:isbn:9781234567897</dc:source>');
    expect(opf).toContain('<meta refines="#pagination-source" property="source-of">pagination</meta>');
    expect(opf).toContain('<meta property="schema:accessibilityFeature">printPageNumbers</meta>');
    let markers = 0;
    for (const name of Object.keys(zip.files).filter((n) => n.startsWith('OEBPS/text/') && n.endsWith('.xhtml'))) {
      const xhtml = await zip.file(name)!.async('string');
      expect(XMLValidator.validate(xhtml), name).toBe(true);
      markers += (xhtml.match(/epub:type="pagebreak"/g) ?? []).length;
    }
    expect(markers).toBe(pageStarts.length);
  });
});
