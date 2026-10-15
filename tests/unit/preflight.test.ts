import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkBook, checkEpub, checkLayout, deliveryFee, printPpi } from '../../src/preflight/checks';
import { imageInfo } from '../../src/preflight/images';
import { isbn13, isbnProblem } from '../../src/preflight/isbn';
import { paragraphs } from '../../src/model/book';
import { sampleBook } from '../../src/model/sample';

const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
const icon = dataUrl('image/png', readFileSync('build/icon.png'));

describe('ISBNs', () => {
  it('checks the check digit of ISBN-13s and ISBN-10s', () => {
    expect(isbnProblem('978-1-23456-789-7')).toBeNull();
    expect(isbnProblem('978-1-23456-789-6')).toBe('checksum');
    expect(isbnProblem('0-306-40615-2')).toBeNull();
    expect(isbnProblem('0-8044-2957-X')).toBeNull();
    expect(isbnProblem('12345')).toBe('length');
  });
  it('treats an ISBN-10 and its ISBN-13 as the same number', () => {
    expect(isbn13('0-306-40615-2')).toBe('9780306406157');
  });
});

describe('image headers', () => {
  it('reads PNG, JPEG and GIF dimensions', () => {
    expect(imageInfo(icon)).toMatchObject({ mediaType: 'image/png', width: 1024, height: 1024 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0a, 0x00, 0x06, 0x40, 0x03, 0x01, 0x22, 0x00]);
    expect(imageInfo(dataUrl('image/jpeg', jpeg))).toMatchObject({ width: 1600, height: 2560 });
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02, 0, 0, 0]);
    expect(imageInfo(dataUrl('image/gif', gif))).toMatchObject({ width: 800, height: 600 });
  });
});

describe('preflight', () => {
  it('finds nothing wrong with the sample book’s text and details', () => {
    const findings = checkBook(sampleBook()).filter((f) => f.severity === 'error' || f.severity === 'warning');
    expect(findings.map((f) => f.title)).toEqual(['No ebook cover']);
  });

  it('catches mistyped and shared ISBNs, placeholders, empty chapters and undescribed images', () => {
    const book = sampleBook();
    book.meta.isbnEbook = '978-1-23456-789-6';
    const chapters = book.elements.filter((el) => el.kind === 'chapter');
    chapters[0].content = paragraphs('The ledger said TK about the barometer.');
    chapters[1].content = { type: 'doc', content: [{ type: 'paragraph' }] };
    chapters[2].content.content.push({ type: 'image', attrs: { src: icon, alt: '' } });
    const titles = checkBook(book).map((f) => f.title);
    expect(titles).toContain("The ebook ISBN isn't valid");
    expect(titles.some((t) => t.startsWith('Placeholder text in'))).toBe(true);
    expect(titles.some((t) => t.endsWith('is empty'))).toBe(true);
    expect(titles.some((t) => t.includes('has no description'))).toBe(true);

    book.meta.isbnEbook = '0-306-40615-2';
    book.meta.isbnPrint = '978-0-306-40615-7';
    expect(checkBook(book).map((f) => f.title)).toContain('The ebook and paperback share an ISBN');
  });

  it('works out the resolution an image prints at', () => {
    const block = { width: 4, height: 7 };
    expect(printPpi(1200, 800, block)).toBe(300); // 12.5 in wide at 96 px/in, shrunk to the 4 in text block
    expect(printPpi(300, 200, block)).toBe(96); // small enough to print at its CSS size
  });

  it('checks cover size against KDP’s minimum', () => {
    const book = sampleBook();
    book.meta.cover = icon;
    expect(checkBook(book).find((f) => f.area === 'ebook')!.title).toBe('The cover is wider than most');
  });

  it('checks the laid-out pages against KDP’s limits', () => {
    const book = sampleBook();
    const short = checkLayout(book, { pages: 19, blankRuns: [{ start: 4, length: 6 }], images: [{ width: 300, ppi: 120 }], inside: 0.675 });
    expect(short.map((f) => [f.severity, f.title])).toEqual([
      ['error', '19 pages is too short for a paperback'],
      ['info', 'Odd page count'],
      ['warning', '6 blank pages in a row from page 4'],
      ['warning', 'An image prints at 120 PPI'],
    ]);
    expect(checkLayout(book, { pages: 240, blankRuns: [], images: [], inside: 0.8 })[0].severity).toBe('ok');
  });

  it('reports EPUBCheck messages and the KDP delivery fee', () => {
    expect(deliveryFee(3 * 1024 * 1024)).toBe(0.45);
    const findings = checkEpub([{ severity: 'error', id: 'RSC-005', message: 'Bad markup', path: 'OEBPS/text/001.xhtml' }], 2 * 1024 * 1024);
    expect(findings[0]).toMatchObject({ severity: 'error', title: 'EPUBCheck RSC-005' });
    expect(findings[1].title).toBe('The EPUB is 2.0 MB');
    expect(findings[1].detail).toContain('$0.30 per sale');
  });
});
