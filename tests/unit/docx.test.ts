// @vitest-environment happy-dom
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { describe, expect, it } from 'vitest';
import { buildDocx } from '../../src/export/docx/docx';
import { bookFromManuscript, docxToHtml } from '../../src/import';
import { sampleBook } from '../../src/model/sample';

describe('Word export', () => {
  it('writes a valid .docx at the trim size with footnotes', async () => {
    const book = sampleBook();
    book.style.trim = '6x9';
    const chapter = book.elements.find((el) => el.kind === 'chapter' && el.numbered !== false)!;
    chapter.content.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'The gulls' }, { type: 'note', attrs: { content: [{ type: 'text', text: 'Herring gulls.' }] } }, { type: 'text', text: ' left.' }] });
    const bytes = await buildDocx(book);
    const zip = await JSZip.loadAsync(bytes);
    for (const path of Object.keys(zip.files).filter((p) => p.endsWith('.xml'))) {
      expect(XMLValidator.validate(await zip.file(path)!.async('string')), path).toBe(true);
    }
    const document = await zip.file('word/document.xml')!.async('string');
    expect(document).toContain('<w:pgSz w:w="8640" w:h="12960"'); // 6 × 9 in, in twips
    expect(document).toContain('The Lamp at Harrow Point');
    expect(await zip.file('word/footnotes.xml')!.async('string')).toContain('Herring gulls.');
  });

  it('reads back in through Recto’s own importer with its chapters and notes', async () => {
    const book = sampleBook();
    const chapter = book.elements.find((el) => el.kind === 'chapter' && el.numbered !== false)!;
    chapter.content.content.push({ type: 'paragraph', content: [{ type: 'text', text: 'The gulls' }, { type: 'note', attrs: { content: [{ type: 'text', text: 'Herring gulls.' }] } }, { type: 'text', text: ' left.' }] });
    const bytes = await buildDocx(book);
    const { html } = await docxToHtml(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const imported = bookFromManuscript(html, 'Harrow', 'Mara Quill');
    const titles = imported.elements.filter((el) => el.kind === 'chapter').map((el) => el.title);
    expect(titles).toEqual(expect.arrayContaining(['The Inventory', 'Fog Season', 'What the Ledger Knew']));
    expect(JSON.stringify(imported.elements)).toContain('Herring gulls.');
  });
});
