import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { buildEpub } from '../../src/export/epub/package';
import { canBeVertical, isVertical, tateChuYoko } from '../../src/export/epub/vertical';
import { paragraphs } from '../../src/model/book';
import { createElement, newBook } from '../../src/model/defaults';
import { printCss } from '../../src/export/print/pageCss';

function japanese(vertical: boolean) {
  const book = newBook({ language: 'ja', title: 'ハロウ岬', author: 'マラ・クイル' });
  book.style.verticalText = vertical;
  book.elements.splice(3, 1, createElement('chapter', book.meta, { title: '灯台', content: paragraphs('灯台は毎夕5時15分に灯り、2026年10月の霧は深かった。本当に!?') }));
  return book;
}

describe('vertical ebooks', () => {
  it('is offered for Japanese and Chinese only', () => {
    expect(canBeVertical('ja')).toBe(true);
    expect(canBeVertical('zh-Hant')).toBe(true);
    expect(canBeVertical('ko')).toBe(false);
    expect(canBeVertical('en')).toBe(false);
    const book = japanese(true);
    book.meta.language = 'en';
    expect(isVertical(book)).toBe(false);
  });

  it('sets short numbers upright, and only in text', () => {
    expect(tateChuYoko('<p id="p12">5時15分、2026年!?</p>')).toBe('<p id="p12"><span class="tcy">5</span>時<span class="tcy">15</span>分、2026年<span class="tcy">!?</span></p>');
  });

  it('writes a vertical, right-to-left EPUB, and leaves print horizontal', async () => {
    const zip = await JSZip.loadAsync(await buildEpub(japanese(true), { modified: new Date('2026-01-02T03:04:05Z') }));
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<spine toc="ncx" page-progression-direction="rtl">');
    expect(opf).toContain('<meta name="primary-writing-mode" content="vertical-rl"/>');
    const css = await zip.file('OEBPS/styles/book.css')!.async('string');
    expect(css).toContain('writing-mode: vertical-rl;');
    expect(css).toContain('text-combine-upright: all;');
    const chapter = Object.keys(zip.files).find((name) => name.endsWith('-chapter.xhtml'))!;
    const xhtml = await zip.file(chapter)!.async('string');
    expect(XMLValidator.validate(xhtml)).toBe(true);
    expect(xhtml).toContain('<span class="tcy">15</span>分');
    expect(printCss(japanese(true), { pages: 100, fontUrl: (f) => f })).not.toContain('vertical-rl');

    const horizontal = await JSZip.loadAsync(await buildEpub(japanese(false)));
    expect(await horizontal.file('OEBPS/content.opf')!.async('string')).not.toContain('primary-writing-mode');
    expect(await horizontal.file('OEBPS/styles/book.css')!.async('string')).not.toContain('vertical-rl');
  });
});
