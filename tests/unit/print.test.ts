import { describe, expect, it } from 'vitest';
import { sampleBook } from '../../src/model/sample';
import { estimatePages, kdpMinInside, pageMargins, printCss, TRIMS } from '../../src/export/print/pageCss';
import { printDocument } from '../../src/export/print/paged';

describe('print layout', () => {
  it('follows the KDP gutter table', () => {
    expect(kdpMinInside(24)).toBe(0.375);
    expect(kdpMinInside(150)).toBe(0.375);
    expect(kdpMinInside(151)).toBe(0.5);
    expect(kdpMinInside(300)).toBe(0.5);
    expect(kdpMinInside(301)).toBe(0.625);
    expect(kdpMinInside(600)).toBe(0.75);
    expect(kdpMinInside(800)).toBe(0.875);
    expect(pageMargins(TRIMS['6x9'], 400).inside).toBe(0.925);
  });

  it('sets the page size and mirrored margins', () => {
    const book = sampleBook();
    book.style.trim = '6x9';
    const css = printCss(book, { pages: 200, fontUrl: (f) => `/fonts/${f}` });
    expect(css).toContain('size: 6in 9in;');
    expect(css).toMatch(/@page :left \{\s*margin-left: 0.65in;\s*margin-right: 0.8in;/);
    expect(css).toMatch(/@page :right \{\s*margin-left: 0.8in;\s*margin-right: 0.65in;/);
    expect(css).toContain('content: "Mara Quill"');
    expect(css).toContain('content: "The Lamp at Harrow Point"');
    expect(css).toContain('.el.chapter, .el[data-matter="back"] { page: chapter; break-before: right; }');
  });

  it('can put chapter titles in the recto running head', () => {
    const book = sampleBook();
    book.style.rectoHeader = 'chapter';
    book.style.startOnRecto = false;
    const css = printCss(book, { pages: 100, fontUrl: (f) => f });
    expect(css).toContain('content: string(chapter)');
    expect(css).toContain('break-before: page; }');
  });

  it('estimates a sensible page count for the sample', () => {
    const pages = estimatePages(sampleBook());
    expect(pages).toBeGreaterThan(20);
    expect(pages).toBeLessThan(60);
  });

  it('builds a paged.js document that marks where page numbering starts', () => {
    const book = sampleBook();
    const html = printDocument(book, { fontUrl: (f) => `https://x/${f}`, pagedUrl: 'https://x/paged.js', spreads: true });
    expect(html).toContain('<script src="https://x/paged.js"></script>');
    // Only the first body element (the prologue) starts the page numbering.
    expect(html.match(/class="el body-start /g)).toHaveLength(1);
    expect(html).toMatch(/class="el body-start chapter"[^>]*>\n<header class="chapter-head">\n<h1 class="chapter-heading"><span class="chapter-title running">Prologue/);
    expect(html).toContain('rectoNumberFolios');
    expect(html).toContain('recto:paged');
  });

  it('can render a subset of elements for previews', () => {
    const book = sampleBook();
    const chapter = book.elements.find((el) => el.title === 'Fog Season')!;
    const html = printDocument(book, { fontUrl: (f) => f, pagedUrl: 'p.js', elementIds: [chapter.id] });
    expect(html.match(/<section /g)).toHaveLength(1);
    expect(html).toContain('Fog Season');
  });
});
