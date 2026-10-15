import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { coverDocument, inkFor } from '../../src/export/cover/document';
import { coverWrap, templateSvg } from '../../src/export/cover/wrap';
import { sampleBook } from '../../src/model/sample';

describe('paperback cover wrap', () => {
  it('sizes the wrap the way KDP does', () => {
    const book = sampleBook();
    book.style.trim = '6x9';
    // KDP's worked example: 300 pages of 6 × 9 on white paper is 12.926 × 9.25 in.
    const wrap = coverWrap(book, 300, 'white');
    expect(wrap.spine).toBe(0.676);
    expect(wrap.width).toBe(12.926);
    expect(wrap.height).toBe(9.25);
    expect(wrap.spineText).toBe(true);
    expect(wrap.front.x).toBe(0.125 + 6 + 0.676);
    // The barcode box sits a quarter inch inside the back cover's bottom corner by the spine.
    expect(wrap.barcode).toEqual({ x: 0.125 + 6 - 0.25 - 2, y: 0.125 + 9 - 0.25 - 1.2, width: 2, height: 1.2 });
  });

  it('uses thicker cream paper and allows no spine text on thin books', () => {
    const book = sampleBook();
    expect(coverWrap(book, 200, 'cream').spine).toBe(0.5);
    expect(coverWrap(book, 60, 'white').spineText).toBe(false);
  });

  it('draws a well-formed SVG template at the cover’s exact size', () => {
    const book = sampleBook();
    const svg = templateSvg(book, coverWrap(book, 120, 'white'));
    expect(XMLValidator.validate(svg)).toBe(true);
    expect(svg).toContain('width="11.52in" height="8.75in"');
    expect(svg).toContain('Barcode area');
  });

  it('lays the cover out at the wrap size with the description on the back', () => {
    const book = sampleBook();
    book.meta.description = 'A lighthouse keeper inherits a ledger.\n\nNobody has read it in ninety years.';
    const html = coverDocument(book, coverWrap(book, 120, 'white'), { fontUrl: (f) => f, background: '#203040' });
    expect(html).toContain('@page { size: 11.52in 8.75in; margin: 0; }');
    expect(html).toContain('<p>Nobody has read it in ninety years.</p>');
    expect(html).toContain('<div class="spine">');
    expect(html).toMatch(/\.wrap \{[^}]*color: #ffffff/);
  });

  it('picks black or white text for the background', () => {
    expect(inkFor('#203040')).toBe('#ffffff');
    expect(inkFor('#f4e9d0')).toBe('#000000');
  });
});
