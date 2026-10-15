import { describe, expect, it } from 'vitest';
import { TRIMS, isLarge, pageRange, printersFor, trimLabel } from '../../src/export/print/trims';
import { pageMargins } from '../../src/export/print/pageCss';
import { checkBook, checkLayout } from '../../src/preflight/checks';
import { sampleBook } from '../../src/model/sample';

describe('trim sizes', () => {
  it('labels sizes in inches or millimetres, with their common names', () => {
    expect(trimLabel(TRIMS['6.14x9.21'])).toBe('6.14 × 9.21 in (Royal)');
    expect(trimLabel(TRIMS['6x9'], 'mm')).toBe('152 × 229 mm');
    expect(trimLabel(TRIMS.a5, 'mm')).toBe('148 × 210 mm (A5)');
  });

  it('knows which printers offer each size in each binding', () => {
    expect(printersFor(TRIMS['6x9'], 'paperback')).toEqual(['KDP', 'IngramSpark']);
    expect(printersFor(TRIMS['6x9'], 'hardcover')).toEqual(['KDP', 'IngramSpark']);
    expect(printersFor(TRIMS['5x8'], 'hardcover')).toEqual(['IngramSpark']);
    expect(printersFor(TRIMS.a5, 'paperback')).toEqual(['IngramSpark']);
  });

  it('gives large trims more room above and below the text', () => {
    expect(isLarge(TRIMS['8.5x11'])).toBe(true);
    expect(pageMargins(TRIMS['8.5x11'], 100).top).toBeGreaterThan(pageMargins(TRIMS['6x9'], 100).top);
  });

  it('checks page counts against the binding', () => {
    expect(pageRange('hardcover')).toMatchObject({ min: 75, max: 550 });
    const book = sampleBook();
    book.style.binding = 'hardcover';
    expect(checkLayout(book, { pages: 60, blankRuns: [], images: [], inside: 0.675 })[0].title).toBe('60 pages is too short for a hardcover');
  });

  it('notes sizes KDP does not print', () => {
    const book = sampleBook();
    book.style.trim = 'a5';
    const note = checkBook(book).find((f) => f.title.startsWith("KDP doesn't print"))!;
    expect(note).toMatchObject({ severity: 'info', detail: 'IngramSpark does. For KDP, pick another trim size in the Style tab.' });
  });
});
