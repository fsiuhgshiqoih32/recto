// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bookFromManuscript, docxToHtml, htmlToDoc, markdownToHtml, titleFromFileName } from '../../src/import';
import { splitManuscript, textToHtml } from '../../src/import/split';
import { computeNumbering } from '../../src/render/html';

describe('splitManuscript', () => {
  it('splits on Heading 1 and reads chapter numbers and titles', () => {
    const parts = splitManuscript(
      '<h1>Prologue</h1><p>Before.</p>' +
        '<h1>Part One: The Ledger</h1>' +
        '<h1>Chapter 1: The Inventory</h1><p>One.</p>' +
        '<h1>CHAPTER TWO</h1><h2>Fog Season</h2><p>Two.</p>' +
        '<h1>3</h1><p>Three.</p>' +
        '<h1>The Lighthouse</h1><p>Four.</p>' +
        '<h1>Acknowledgments</h1><p>Thanks.</p>',
    );
    expect(parts.map((p) => [p.kind, p.title, p.numbered])).toEqual([
      ['chapter', 'Prologue', false],
      ['part', 'The Ledger', true],
      ['chapter', 'The Inventory', true],
      ['chapter', 'Fog Season', true],
      ['chapter', '', true],
      ['chapter', 'The Lighthouse', true],
      ['acknowledgments', 'Acknowledgments', false],
    ]);
    expect(parts[2].html).toBe('<p>One.</p>');
  });

  it('finds "Chapter N" paragraphs when the manuscript has no heading styles', () => {
    const parts = splitManuscript('<p>Chapter XII</p><p>It rained.</p><p>Chapter two was boring, she said.</p>');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ kind: 'chapter', title: '', numbered: true });
    expect(parts[0].html).toContain('Chapter two was boring');
  });

  it('normalizes scene breaks and trims them at element edges', () => {
    const [chapter] = splitManuscript('<h1>One</h1><p>* * *</p><p>A.</p><p>#</p><p>B.</p><p>⁂</p><hr><p>C.</p><p>***</p>');
    expect(chapter.html).toBe('<p>A.</p><hr><p>B.</p><hr><hr><p>C.</p>');
  });

  it('keeps text before the first heading', () => {
    const parts = splitManuscript('<p>A note first.</p><h1>Chapter 1</h1><p>Body.</p>');
    expect(parts.map((p) => [p.kind, p.numbered])).toEqual([
      ['chapter', false],
      ['chapter', true],
    ]);
  });

  it('treats a manuscript without headings as one chapter', () => {
    const parts = splitManuscript(textToHtml('First paragraph.\n\nSecond paragraph.'));
    expect(parts).toHaveLength(1);
    expect(parts[0].numbered).toBe(true);
    expect(parts[0].html).toBe('<p>First paragraph.</p><p>Second paragraph.</p>');
  });
});

describe('importers', () => {
  it('turns HTML into editor JSON with marks, alignment and scene breaks', () => {
    const doc = htmlToDoc('<p>Plain <em>slanted</em> <span class="sc">caps</span></p><hr><p style="text-align: center">Mid</p>');
    expect(doc.content.map((b) => b.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
    const first = doc.content[0];
    expect(first.type === 'paragraph' && first.content?.map((n) => (n.type === 'text' ? n.marks?.[0]?.type : null))).toEqual([
      undefined,
      'italic',
      undefined,
      'smallCaps',
    ]);
    expect(doc.content[2]).toMatchObject({ attrs: { textAlign: 'center' } });
  });

  it('imports Markdown with smart quotes', () => {
    const book = bookFromManuscript(markdownToHtml('# Chapter 1: Start\n\n"Hello," she said.\n\n***\n\nLater.'), 'Md');
    const chapter = book.elements.find((el) => el.kind === 'chapter')!;
    expect(chapter.title).toBe('Start');
    expect(JSON.stringify(chapter.content)).toContain('“Hello,” she said.');
    expect(chapter.content.content.map((b) => b.type)).toEqual(['paragraph', 'sceneBreak', 'paragraph']);
  });

  it('imports the sample Word manuscript', async () => {
    const data = readFileSync('samples/the-lamp-at-harrow-point.docx');
    const { html } = await docxToHtml(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    const book = bookFromManuscript(html, titleFromFileName('the-lamp-at-harrow-point.docx'), 'Mara Quill');
    expect(book.meta.title).toBe('The Lamp At Harrow Point');
    expect(book.elements.map((el) => el.kind)).toEqual([
      'title-page', 'copyright', 'toc',
      'chapter', 'part', 'chapter', 'chapter', 'part', 'chapter', 'chapter',
      'acknowledgments', 'about-author', 'also-by',
    ]);
    const numbering = computeNumbering(book);
    const inventory = book.elements.find((el) => el.title === 'The Inventory')!;
    expect(numbering.get(inventory.id)?.chapter).toBe(1);
    const types = inventory.content.content.map((b) => b.type);
    expect(types).toContain('sceneBreak');
    expect(JSON.stringify(inventory.content)).toContain('"smallCaps"');
    expect(JSON.stringify(inventory.content)).toContain('"italic"');
  });
});

describe('chapter lines are told apart from prose', () => {
  it('needs a break between a closing label word and the title', () => {
    const parts = splitManuscript(
      '<p>第一章 归来</p><p>她回来了。</p>' +
        '<p>第一部电影很好看。</p>' +
        '<p>第三章：雾</p><p>雾来了。</p>' +
        '<p>第三章で説明したように、灯台は古い。</p>' +
        '<p>1. lukuisat laivat palasivat.</p>',
    );
    expect(parts.map((p) => [p.kind, p.title])).toEqual([
      ['chapter', '归来'],
      ['chapter', '雾'],
    ]);
    expect(parts[0].html).toContain('第一部电影很好看。');
    expect(parts[1].html).toContain('第三章で説明したように');
    expect(parts[1].html).toContain('1. lukuisat laivat');
  });
});
