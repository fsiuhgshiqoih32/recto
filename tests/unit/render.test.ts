import { describe, expect, it } from 'vitest';
import { numberToWords, parseChapterNumber, toRoman } from '../../src/model/numbers';
import { sampleBook } from '../../src/model/sample';
import { computeNumbering, renderBook, renderInline, renderOpener, themeOf } from '../../src/render/html';
import { THEMES } from '../../src/themes';
import { chapterLabel } from '../../src/i18n/labels';
import { ORNAMENTS } from '../../src/themes/ornaments';

describe('numbers', () => {
  it('spells chapter numbers', () => {
    expect(numberToWords(1)).toBe('One');
    expect(numberToWords(13)).toBe('Thirteen');
    expect(numberToWords(21)).toBe('Twenty-One');
    expect(numberToWords(40)).toBe('Forty');
    expect(numberToWords(105)).toBe('One Hundred Five');
    expect(toRoman(14)).toBe('XIV');
  });

  it('parses digits, roman numerals and words', () => {
    expect(parseChapterNumber('7')).toBe(7);
    expect(parseChapterNumber('XII')).toBe(12);
    expect(parseChapterNumber('twenty-one')).toBe(21);
    expect(parseChapterNumber('Thirty Two')).toBe(32);
    expect(parseChapterNumber('banana')).toBeNull();
  });
});

describe('render', () => {
  const book = sampleBook();
  const ctx = {
    book,
    theme: themeOf(book),
    target: 'preview' as const,
    hrefFor: () => '#',
    ornament: (id: keyof typeof ORNAMENTS) => ORNAMENTS[id],
  };

  it('numbers chapters but skips unnumbered prologues and epilogues', () => {
    const numbering = computeNumbering(book);
    const chapters = book.elements.filter((el) => el.kind === 'chapter');
    expect(chapters.map((el) => numbering.get(el.id)?.chapter)).toEqual([undefined, 1, 2, 3, undefined]);
    const parts = book.elements.filter((el) => el.kind === 'part');
    expect(parts.map((el) => numbering.get(el.id)?.part)).toEqual([1, 2]);
  });

  it('escapes text and applies marks', () => {
    expect(
      renderInline([
        { type: 'text', text: 'Fish & <chips>' },
        { type: 'text', text: 'loud', marks: [{ type: 'italic' }, { type: 'smallCaps' }] },
        { type: 'hardBreak' },
      ]),
    ).toBe('Fish &amp; &lt;chips&gt;<em><span class="sc">loud</span></em><br/>');
  });

  it('builds a drop cap that keeps an opening quote with its letter', () => {
    const html = renderOpener([{ type: 'text', text: '“You’re the new one,” said the woman.' }], true);
    expect(html).toBe(
      '<span class="dropcap"><span class="dq">“</span>Y</span><span class="lead">ou’re the new</span> one,” said the woman.',
    );
  });

  it('builds a small-caps lead-in without a drop cap', () => {
    expect(renderOpener([{ type: 'text', text: 'She began to notice it.' }], false)).toBe(
      '<span class="lead">She began to</span> notice it.',
    );
  });

  it('renders chapter headings, openers and scene breaks', () => {
    const rendered = renderBook(ctx);
    const one = rendered.find((r) => r.element.title === 'The Inventory')!;
    expect(one.tocText).toBe('Chapter One: The Inventory');
    expect(one.html).toContain('<span class="chapter-label">Chapter One</span>');
    expect(one.html).toContain('<span class="chapter-title running">The Inventory</span>');
    expect(one.html).toContain('<p class="opener"><span class="dropcap">T</span>');
    expect(one.html).toContain('<div class="scene-break" role="separator"><svg');
    expect(one.html).toMatch(/<\/div>\n<p class="first"><span class="lead">/);
    const prologue = rendered.find((r) => r.element.title === 'Prologue')!;
    expect(prologue.html).not.toContain('chapter-label');
  });

  it('uses each theme’s own chapter label style', () => {
    const label = (id: keyof typeof THEMES, lang = 'en') => chapterLabel(THEMES[id].chapterLabel, lang, 3);
    expect(label('octavo')).toBe('Chapter Three');
    expect(label('ledger')).toBe('3');
    expect(label('broadsheet')).toBe('Chapter 3');
    expect(label('almanac')).toBe('Three');
    expect(label('octavo', 'es')).toBe('Capítulo 3');
    expect(label('octavo', 'zh-Hans')).toBe('第三章');
    expect(label('broadsheet', 'ja')).toBe('第3章');
  });

  it('lists TOC entries with links', () => {
    const toc = renderBook(ctx).find((r) => r.element.kind === 'toc')!;
    expect(toc.html).toContain('<span class="toc-label">Part One</span><span class="toc-title">The Ledger</span>');
    expect(toc.html).not.toContain('Title Page');
  });
});
