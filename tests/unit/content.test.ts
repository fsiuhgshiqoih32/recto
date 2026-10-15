// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { BlockNode, Book, InlineNode } from '../../src/model/book';
import { sampleBook } from '../../src/model/sample';
import { renderBook, themeOf } from '../../src/render/html';
import type { RenderContext } from '../../src/render/html';
import { ORNAMENTS } from '../../src/themes/ornaments';
import { printCss } from '../../src/export/print/pageCss';
import { htmlToDoc, markdownToHtml } from '../../src/import';
import { extractNotes } from '../../src/import/notes';

const text = (t: string): InlineNode => ({ type: 'text', text: t });
const para = (...nodes: InlineNode[]): BlockNode => ({ type: 'paragraph', content: nodes });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function withContent(blocks: BlockNode[], edit: (book: Book) => void = () => {}): Book {
  const book = sampleBook();
  const chapter = book.elements.find((el) => el.kind === 'chapter' && el.numbered !== false)!;
  chapter.content = { type: 'doc', content: [para(text('Opening line.')), ...blocks] };
  edit(book);
  return book;
}

function render(book: Book, target: RenderContext['target'], extra: Partial<RenderContext> = {}) {
  return renderBook({
    book,
    theme: themeOf(book),
    target,
    hrefFor: (el) => `#el-${el.id}`,
    ornament: (id) => ORNAMENTS[id],
    links: target !== 'print',
    ...extra,
  });
}

const chapterHtml = (book: Book, target: RenderContext['target'], extra: Partial<RenderContext> = {}) =>
  render(book, target, extra).find((r) => r.element.kind === 'chapter' && r.element.numbered !== false)!.html;

describe('rich content', () => {
  it('renders lists, verse, callouts and tables', () => {
    const book = withContent([
      { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('Oil'))] }, { type: 'listItem', content: [para(text('Wick'))] }] },
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [para(text('Third'))] }] },
      { type: 'verse', content: [para(text('The lamp is lit,'), { type: 'hardBreak' }, text('the fog comes in.'))] },
      { type: 'callout', attrs: { tone: 'warning' }, content: [para(text('Mind the stairs.'))] },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('Date'))] }, { type: 'tableHeader', content: [para(text('Wind'))] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('Oct. 12'))] }, { type: 'tableCell', content: [para(text('NNE'))] }] },
        ],
      },
    ]);
    const html = chapterHtml(book, 'epub');
    expect(html).toContain('<ul>\n<li><p>Oil</p>\n</li>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<div class="verse">\n<p class="stanza"><span class="line">The lamp is lit,</span><span class="line">the fog comes in.</span></p>');
    expect(html).toContain('<aside class="callout callout-warning" role="note">');
    expect(html).toMatch(/<thead><tr><th scope="col"><p>Date<\/p>\n<\/th>/);
    expect(html).toContain('<td><p>Oct. 12</p>\n</td>');
  });

  it('groups text messages into a conversation', () => {
    const book = withContent([
      { type: 'textMessage', attrs: { side: 'received', sender: 'Bea' }, content: [text('Fog by six.')] },
      { type: 'textMessage', attrs: { side: 'sent' }, content: [text('Lamp’s lit.')] },
      para(text('She put the phone away.')),
    ]);
    const html = chapterHtml(book, 'epub');
    expect(html).toContain('<div class="messages">\n<p class="message message-received"><span class="sender">Bea</span>Fog by six.</p>\n<p class="message message-sent">Lamp’s lit.</p>\n</div>');
    expect(html.match(/class="messages"/g)).toHaveLength(1);
  });

  it('points store links at the edition’s store, and prints the universal one as text', () => {
    const block: BlockNode = { type: 'storeLinks', attrs: { label: 'Read book two', links: { kobo: 'https://kobo.com/b2', universal: 'https://books2read.com/b2' } } };
    const book = withContent([block]);
    expect(chapterHtml(book, 'epub', { store: 'kobo' })).toContain('<a href="https://kobo.com/b2">Read book two</a>');
    expect(chapterHtml(book, 'epub', { store: 'apple' })).toContain('<a href="https://books2read.com/b2">Read book two</a>');
    const print = chapterHtml(book, 'print');
    expect(print).toContain('<p class="store-link">Read book two <span class="store-url">books2read.com/b2</span></p>');
    expect(print).not.toContain('<a ');
  });

  it('lays images out for print by layout, and keeps them in the flow of an ebook', () => {
    const image = (layout: 'page' | 'bleed' | 'spread'): BlockNode => ({ type: 'image', attrs: { src: PNG, alt: 'Map', layout, caption: layout === 'page' ? 'The coast' : null } });
    const book = withContent([image('page'), image('bleed'), image('spread')], (b) => {
      b.elements.find((el) => el.kind === 'chapter' && el.numbered !== false)!.headingImage = PNG;
    });
    const print = chapterHtml(book, 'print');
    expect(print).toContain('<figure class="figure-page"><img class="figure"');
    expect(print).toContain('<figcaption>The coast</figcaption>');
    expect(print).toContain('<div class="figure-bleed">');
    expect(print).toContain('<div class="figure-spread figure-spread-left">');
    expect(print).toContain('<div class="figure-spread figure-spread-right">');
    expect(print).toContain('<div class="heading-image"><img src="data:image/png');
    const epub = chapterHtml(book, 'epub');
    expect(epub).toContain('<figure class="figure-block figure-full">');
    expect(epub).not.toContain('figure-spread');
  });

  it('gives bleed pages KDP’s size: 0.125 in wider and 0.25 in taller', () => {
    const book = sampleBook();
    book.style.trim = '6x9';
    book.style.bleed = true;
    const css = printCss(book, { pages: 200, fontUrl: (f) => f });
    expect(css).toContain('size: 6.125in 9.25in;');
    expect(css).toMatch(/\.figure-bleed, \.figure-spread \{[^}]*width: 6\.125in; height: 9\.25in;/);
  });
});

describe('notes', () => {
  const noted = () =>
    withContent([para(text('The barometer had been reading Change'), { type: 'note', attrs: { content: [text('Since the winter of 1931.')] } }, text('.'))]);

  it('pops up as footnotes in an ebook', () => {
    const html = chapterHtml(noted(), 'epub');
    expect(html).toMatch(/<sup><a class="noteref" epub:type="noteref" role="doc-noteref" id="nref-[\w-]+-1" href="#note-[\w-]+-1">1<\/a><\/sup>/);
    expect(html).toMatch(/<aside class="footnote" epub:type="footnote" role="doc-footnote" id="note-[\w-]+-1"><p><a class="note-back" href="#nref-[\w-]+-1" role="doc-backlink">1\.<\/a> Since the winter of 1931\.<\/p><\/aside>/);
  });

  it('lists notes at the end of the chapter in print by default', () => {
    const html = chapterHtml(noted(), 'print');
    expect(html).toContain('<sup class="noteref">1</sup>');
    expect(html).toContain('<section class="chapter-notes">\n<h2 class="notes-heading">Notes</h2>\n<ol class="notes-list">\n<li value="1">Since the winter of 1931.</li>');
  });

  it('can gather print notes into a Notes section before the back matter', () => {
    const book = noted();
    book.style.notes = 'book';
    const rendered = render(book, 'print');
    const notesAt = rendered.findIndex((r) => r.element.id === 'notes');
    expect(notesAt).toBeGreaterThan(0);
    expect(rendered[notesAt + 1].element.matter).toBe('back');
    expect(rendered[notesAt].html).toContain('<h2 class="notes-group">Chapter One: The Inventory</h2>');
    expect(rendered[notesAt].html).toContain('<li value="1">Since the winter of 1931.</li>');
    // The contents page lists the Notes section.
    expect(rendered.find((r) => r.element.kind === 'toc')!.html).toContain('data-target="#el-notes"');
    expect(chapterHtml(book, 'print')).not.toContain('chapter-notes');
  });

  it('can set notes at the foot of the page', () => {
    const book = noted();
    book.style.notes = 'page';
    expect(chapterHtml(book, 'print')).toContain('Change<sup class="noteref">1</sup><span class="footnote"><span class="note-num">1.</span> Since the winter of 1931.</span>.');
    expect(printCss(book, { pages: 100, fontUrl: (f) => f })).toContain('.footnote { float: footnote;');
  });

  it('imports Word and Markdown footnotes as notes where they are cited', () => {
    const word =
      '<p>It was cold<sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup> that night.</p>' +
      '<ol><li id="footnote-1"><p>Minus four, by <em>the</em> ledger. <a href="#footnote-ref-1">↑</a></p></li></ol>';
    const doc = htmlToDoc(extractNotes(word));
    expect(doc.content).toHaveLength(1);
    const note = (doc.content[0] as { content: InlineNode[] }).content.find((n) => n.type === 'note') as Extract<InlineNode, { type: 'note' }>;
    expect(note.attrs.content).toEqual([text('Minus four, by '), { type: 'text', text: 'the', marks: [{ type: 'italic' }] }, text(' ledger.')]);

    const md = htmlToDoc(extractNotes(markdownToHtml('A gull[^1] landed.\n\n[^1]: A herring gull.')));
    expect(md.content).toHaveLength(1);
    expect(JSON.stringify(md.content[0])).toContain('A herring gull.');
  });
});

describe('editor schema', () => {
  it('parses lists, verse, callouts, tables and messages from HTML', () => {
    const doc = htmlToDoc(
      '<ul><li><p>Oil</p></li></ul><div class="verse"><p>One<br>Two</p></div>' +
        '<aside class="callout callout-tip"><p>Trim the wick.</p></aside>' +
        '<table><tr><th>A</th></tr><tr><td>B</td></tr></table>' +
        '<p class="message message-sent" data-sender="Ada">Hello</p>',
    );
    expect(doc.content.map((b) => b.type)).toEqual(['bulletList', 'verse', 'callout', 'table', 'textMessage']);
    expect(doc.content[2]).toMatchObject({ attrs: { tone: 'tip' } });
    expect(doc.content[4]).toMatchObject({ attrs: { side: 'sent', sender: 'Ada' } });
  });
});

describe('store editions', () => {
  it('builds one EPUB per store, each linking to its own store', async () => {
    const JSZip = (await import('jszip')).default;
    const { buildStoreEditions } = await import('../../src/export/epub/package');
    const book = withContent([{ type: 'storeLinks', attrs: { label: 'Book two', links: { amazon: 'https://amazon.com/b2', universal: 'https://books2read.com/b2' } } }]);
    const zip = await JSZip.loadAsync(await buildStoreEditions(book, 'harrow', { modified: new Date(0) }));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['harrow-apple.epub', 'harrow-google.epub', 'harrow-kindle.epub', 'harrow-kobo.epub', 'harrow-nook.epub', 'harrow-universal.epub']);
    const chapterOf = async (name: string) => {
      const epub = await JSZip.loadAsync(await zip.file(name)!.async('uint8array'));
      const files = await Promise.all(Object.keys(epub.files).filter((p) => p.endsWith('.xhtml')).map((p) => epub.file(p)!.async('string')));
      return files.join('\n');
    };
    expect(await chapterOf('harrow-kindle.epub')).toContain('href="https://amazon.com/b2"');
    expect(await chapterOf('harrow-kobo.epub')).toContain('href="https://books2read.com/b2"');
    expect(await chapterOf('harrow-kobo.epub')).not.toContain('amazon.com');
  });
});
