// @vitest-environment happy-dom
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { sampleBook } from '../../src/model/sample';
import type { Book } from '../../src/model/book';
import { bookCreators, contentsEntries, hasSeveralAuthors, newBoxSet, updateVolume, volumeFromBook, volumeMembers, withVolume } from '../../src/model/boxset';
import { computeNumbering, renderBook, renderElement, themeOf } from '../../src/render/html';
import { buildEpub } from '../../src/export/epub/package';
import { printCss } from '../../src/export/print/pageCss';
import { buildDocx } from '../../src/export/docx/docx';

function twoBooks(secondAuthor = 'Mara Quill'): [Book, Book] {
  const first = sampleBook();
  const second = sampleBook();
  second.meta = { ...second.meta, title: 'The Second Lamp', subtitle: '', author: secondAuthor };
  second.elements.splice(1, 0, { id: 'ded', kind: 'dedication', matter: 'front', title: 'Dedication', includeInToc: false, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'For the keepers.' }] }] } });
  return [first, second];
}

const chapterCount = (book: Book) => book.elements.filter((el) => el.kind === 'chapter').length;

async function openEpub(book: Book) {
  const bytes = await buildEpub(book, { modified: new Date('2026-01-02T03:04:05Z'), loadFont: async () => new Uint8Array([0x77, 0x4f, 0x46, 0x32]) });
  return JSZip.loadAsync(bytes);
}

describe('box sets', () => {
  it('gathers books as volumes, with one set of front and back matter', () => {
    const [first, second] = twoBooks();
    const book = newBoxSet([first, second]);
    const kinds = book.elements.map((el) => el.kind);
    expect(kinds.filter((k) => k === 'volume')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'copyright')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'about-author')).toHaveLength(1);
    expect(chapterCount(book)).toBe(chapterCount(first) + chapterCount(second));
    expect(book.meta.author).toBe('Mara Quill');
    expect(book.style).toEqual(first.style);
    // Front matter, then volumes with their chapters, then back matter.
    expect(kinds.indexOf('volume')).toBeGreaterThan(kinds.lastIndexOf('toc'));
    expect(kinds.lastIndexOf('chapter')).toBeLessThan(kinds.indexOf('about-author'));
    // Each volume remembers its source, and the second carries its book's dedication.
    const [one, two] = book.elements.filter((el) => el.kind === 'volume');
    expect(one.volume?.source).toMatchObject({ bookId: first.id, title: first.meta.title });
    expect(JSON.stringify(two.content)).toContain('For the keepers.');
    // New ids: the same book can go into the box set twice.
    const ids = book.elements.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(first.elements.find((el) => el.kind === 'chapter')!.id);
  });

  it('numbers chapters from one in each volume', () => {
    const book = newBoxSet(twoBooks());
    const numbering = computeNumbering(book);
    const [one, two] = book.elements.filter((el) => el.kind === 'volume');
    expect(numbering.get(one.id)).toEqual({ volume: 1 });
    expect(numbering.get(two.id)).toEqual({ volume: 2 });
    const firstChapterOf = (volumeId: string) => volumeMembers(book, volumeId).find((el) => el.kind === 'chapter' && el.numbered !== false)!;
    expect(numbering.get(firstChapterOf(one.id).id)).toEqual({ chapter: 1 });
    expect(numbering.get(firstChapterOf(two.id).id)).toEqual({ chapter: 1 });

    const ctx = { book, theme: themeOf(book), target: 'print' as const, ornament: () => '', hrefFor: (el: { id: string }) => `#el-${el.id}` };
    const html = renderElement(two, ctx);
    expect(html).toContain('epub:type="volume"');
    expect(html).toContain('<span class="part-label">Book Two</span>');
    expect(html).toContain('The Second Lamp');
    expect(html).toContain('For the keepers.');
    expect(html).not.toContain('volume-author'); // one author: the volume page doesn't repeat it
  });

  it('nests each volume’s chapters in the ebook navigation', async () => {
    const book = newBoxSet(twoBooks());
    const zip = await openEpub(book);
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(XMLValidator.validate(nav)).toBe(true);
    const doc = new DOMParser().parseFromString(nav, 'application/xhtml+xml');
    const top = Array.from(doc.querySelectorAll('nav#toc > ol > li'));
    const volumes = top.filter((li) => /^Book (One|Two)/.test(li.querySelector('a')!.textContent ?? ''));
    expect(volumes).toHaveLength(2);
    expect(volumes[1].querySelector('a')!.textContent).toBe('Book Two: The Second Lamp');
    expect(volumes[1].querySelectorAll('ol > li').length).toBe(volumeMembers(book, book.elements.filter((el) => el.kind === 'volume')[1].id).length);
    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(Number(/dtb:depth" content="(\d)/.exec(ncx)![1])).toBeGreaterThanOrEqual(2);
  });

  it('names each author when the volumes have different authors', async () => {
    const book = newBoxSet(twoBooks('Ada Wren'));
    expect(book.meta.author).toBe('Mara Quill and Ada Wren');
    expect(hasSeveralAuthors(book)).toBe(true);
    expect(bookCreators(book)).toEqual(['Mara Quill', 'Ada Wren']);
    const opf = await (await openEpub(book)).file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:creator id="creator">Mara Quill</dc:creator>');
    expect(opf).toContain('<dc:creator id="creator-2">Ada Wren</dc:creator>');
    expect(opf).toContain('<meta refines="#creator-2" property="role" scheme="marc:relators">aut</meta>');

    const rendered = renderBook({ book, theme: themeOf(book), target: 'print', links: false, ornament: () => '', hrefFor: (el) => `#el-${el.id}` });
    const second = rendered.find((r) => r.element.kind === 'volume' && r.element.title === 'The Second Lamp')!;
    expect(second.html).toContain('<p class="volume-author">Ada Wren</p>');
    // Print heads name the volume and its author.
    const css = printCss(book, { pages: 400, fontUrl: (f) => f });
    expect(css).toContain('content: string(volumeauthor)');
    expect(css).toContain('content: string(volume)');
    expect(css).toContain('.volume-title { string-set: volume content(text); }');
  });

  it('keeps one author in the metadata for a one-author box set', () => {
    const book = newBoxSet(twoBooks());
    expect(hasSeveralAuthors(book)).toBe(false);
    expect(bookCreators(book)).toEqual(['Mara Quill']);
    expect(printCss(book, { pages: 400, fontUrl: (f) => f })).toContain('content: "Mara Quill"');
  });

  it('can list only the volumes on the contents page', () => {
    const book = newBoxSet(twoBooks());
    const all = contentsEntries(book);
    book.style.contentsVolumesOnly = true;
    const short = contentsEntries(book);
    expect(short.filter((el) => el.matter === 'body').map((el) => el.kind)).toEqual(['volume', 'volume']);
    expect(short.length).toBeLessThan(all.length);
    expect(short.some((el) => el.kind === 'about-author')).toBe(true);
  });

  it('updates a volume from its source book, keeping the volume page', () => {
    const [first, second] = twoBooks();
    let book = newBoxSet([first, second]);
    const volume = book.elements.filter((el) => el.kind === 'volume')[1];
    book = { ...book, elements: book.elements.map((el) => (el.id === volume.id ? { ...el, title: 'Lamp II' } : el)) };
    const edited = { ...second, updatedAt: second.updatedAt + 1000, elements: [...second.elements, { id: 'new', kind: 'chapter' as const, matter: 'body' as const, title: 'A New Chapter', numbered: true, includeInToc: true, content: { type: 'doc' as const, content: [] } }] };
    const before = volumeMembers(book, volume.id).length;
    const firstVolume = book.elements.find((el) => el.kind === 'volume')!;
    const firstMembers = volumeMembers(book, firstVolume.id).map((el) => el.id);
    book = updateVolume(book, volume.id, edited);
    const members = volumeMembers(book, volume.id);
    expect(members).toHaveLength(before + 1);
    expect(members[members.length - 1].title).toBe('A New Chapter');
    const updated = book.elements.find((el) => el.id === volume.id)!;
    expect(updated.title).toBe('Lamp II');
    expect(updated.volume?.source?.syncedAt).toBe(edited.updatedAt);
    // The first volume is untouched.
    expect(volumeMembers(book, firstVolume.id).map((el) => el.id)).toEqual(firstMembers);
  });

  it('adds a volume before the back matter, and refuses a box set as a volume', () => {
    const [first, second] = twoBooks();
    const book = withVolume(newBoxSet([first]), volumeFromBook(second));
    const kinds = book.elements.map((el) => el.kind);
    expect(kinds.filter((k) => k === 'volume')).toHaveLength(2);
    expect(kinds.lastIndexOf('volume')).toBeLessThan(kinds.indexOf('about-author'));
    expect(() => volumeFromBook(book)).toThrow(/already a box set/);
  });

  it('exports a box set to Word with each volume heading', async () => {
    const book = newBoxSet(twoBooks('Ada Wren'));
    const zip = await JSZip.loadAsync(await buildDocx(book));
    const document = await zip.file('word/document.xml')!.async('string');
    expect(XMLValidator.validate(document)).toBe(true);
    expect(document).toContain('Book Two: The Second Lamp');
    expect(document).toContain('Ada Wren');
  });
});
