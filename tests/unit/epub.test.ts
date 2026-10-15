import { XMLParser, XMLValidator } from 'fast-xml-parser';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { sampleBook } from '../../src/model/sample';
import { buildEpub, decodeDataUrl } from '../../src/export/epub/package';
import { accessibilityFacts, accessibilityMetadata, storeAnswers } from '../../src/export/epub/accessibility';
import type { Book } from '../../src/model/book';

// 1×1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function open(book: Book) {
  const bytes = await buildEpub(book, {
    modified: new Date('2026-01-02T03:04:05.678Z'),
    loadFont: async () => new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
  });
  return { bytes, zip: await JSZip.loadAsync(bytes) };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

describe('EPUB package', () => {
  it('starts with an uncompressed mimetype entry', async () => {
    const { bytes } = await open(sampleBook());
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
    expect(view.getUint16(8, true)).toBe(0); // compression: stored
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    expect(extraLength).toBe(0);
    const decoder = new TextDecoder();
    expect(decoder.decode(bytes.slice(30, 30 + nameLength))).toBe('mimetype');
    expect(decoder.decode(bytes.slice(30 + nameLength, 30 + nameLength + 20))).toBe('application/epub+zip');
  });

  it('has a manifest that matches the files and a spine that matches the manifest', async () => {
    const { zip } = await open(sampleBook());
    const container = await zip.file('META-INF/container.xml')!.async('string');
    expect(container).toContain('full-path="OEBPS/content.opf"');

    const opf = parser.parse(await zip.file('OEBPS/content.opf')!.async('string'));
    const items: { id: string; href: string; 'media-type': string; properties?: string }[] = opf.package.manifest.item;
    const ids = new Set(items.map((i) => i.id));
    for (const item of items) expect(zip.file(`OEBPS/${item.href}`), item.href).not.toBeNull();
    const spine: { idref: string }[] = opf.package.spine.itemref;
    for (const ref of spine) expect(ids.has(ref.idref), ref.idref).toBe(true);
    expect(items.filter((i) => i.properties === 'nav')).toHaveLength(1);

    // Every file in the zip (except the container and the package files) is in the manifest.
    const hrefs = new Set(items.map((i) => `OEBPS/${i.href}`));
    zip.forEach((path, entry) => {
      if (entry.dir || path === 'mimetype' || path.startsWith('META-INF/') || path === 'OEBPS/content.opf') return;
      expect(hrefs.has(path), path).toBe(true);
    });
  });

  it('writes well-formed XML everywhere', async () => {
    const { zip } = await open(sampleBook());
    const xmlFiles = Object.keys(zip.files).filter((p) => /\.(xhtml|opf|ncx|xml|svg)$/.test(p));
    expect(xmlFiles.length).toBeGreaterThan(15);
    for (const path of xmlFiles) {
      expect(XMLValidator.validate(await zip.file(path)!.async('string')), path).toBe(true);
    }
  });

  it('records metadata, the modified stamp and an ISBN identifier', async () => {
    const book = sampleBook();
    book.meta.isbnEbook = '978-1-23456-789-7';
    const { zip } = await open(book);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<dc:identifier id="bookid">urn:isbn:9781234567897</dc:identifier>');
    expect(opf).toContain('<dc:title id="title">The Lamp at Harrow Point</dc:title>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-01-02T03:04:05Z</meta>');
    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(ncx).toContain('<meta name="dtb:uid" content="urn:isbn:9781234567897"/>');
  });

  it('nests chapters under parts in the navigation', async () => {
    const { zip } = await open(sampleBook());
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
    expect(nav).toMatch(/Part One: The Ledger<\/a>\s*<ol>\s*<li><a href="text\/\d+-chapter.xhtml">Chapter One: The Inventory/);
    expect(nav).toContain('epub:type="bodymatter"');
    const ncx = await zip.file('OEBPS/toc.ncx')!.async('string');
    expect(ncx).toContain('<meta name="dtb:depth" content="2"/>');
  });

  it('packages the cover, figures and embedded fonts', async () => {
    const book = sampleBook();
    book.meta.cover = PNG;
    book.style.embedFonts = true;
    const chapter = book.elements.find((el) => el.kind === 'chapter')!;
    chapter.content.content.push({ type: 'image', attrs: { src: PNG, alt: 'A map' } });
    const { zip } = await open(book);
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('<meta name="cover" content="cover-image"/>');
    expect(opf).toMatch(/<itemref idref="cover"\/>\s*<itemref idref="x001"\/>/);
    expect(zip.file('OEBPS/images/cover.png')).not.toBeNull();
    expect(zip.file('OEBPS/images/figure-1.png')).not.toBeNull();
    expect(zip.file('OEBPS/fonts/eb-garamond-latin-400-normal.woff2')).not.toBeNull();
    const css = await zip.file('OEBPS/styles/book.css')!.async('string');
    expect(css).toContain('url("../fonts/eb-garamond-latin-400-normal.woff2")');
  });

  it('declares accessibility metadata derived from the book', async () => {
    const { zip } = await open(sampleBook());
    const opf = await zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<meta property="schema:accessMode">textual</meta>');
    expect(opf).toContain('<meta property="schema:accessModeSufficient">textual</meta>');
    for (const feature of ['tableOfContents', 'structuralNavigation', 'readingOrder', 'displayTransformability']) {
      expect(opf).toContain(`<meta property="schema:accessibilityFeature">${feature}</meta>`);
    }
    expect(opf).toContain('<meta property="schema:accessibilityHazard">none</meta>');
    expect(opf).toMatch(/<meta property="schema:accessibilitySummary">This ebook has a table of contents/);
    expect(opf).not.toContain('dcterms:conformsTo');
    // Sections carry DPUB-ARIA roles alongside their epub:type.
    const chapterFile = Object.keys(zip.files).find((p) => p.endsWith('-chapter.xhtml'))!;
    expect(await zip.file(chapterFile)!.async('string')).toContain('epub:type="chapter" role="doc-chapter"');
  });

  it('tells readers when images have no text description', async () => {
    const book = sampleBook();
    book.meta.cover = PNG;
    const chapter = book.elements.find((el) => el.kind === 'chapter')!;
    chapter.content.content.push({ type: 'image', attrs: { src: PNG, alt: '' } });
    let opf = await (await open(book)).zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<meta property="schema:accessMode">visual</meta>');
    expect(opf).not.toContain('<meta property="schema:accessModeSufficient">textual</meta>');
    expect(opf).toContain('<meta property="schema:accessModeSufficient">textual,visual</meta>');
    expect(opf).not.toContain('alternativeText');
    expect(opf).toContain('1 of its 2 images has no text description.');

    (chapter.content.content.at(-1) as { attrs: { alt: string } }).attrs.alt = 'A map of Harrow Point';
    opf = await (await open(book)).zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<meta property="schema:accessibilityFeature">alternativeText</meta>');
    expect(opf).toContain('<meta property="schema:accessModeSufficient">textual</meta>');
    expect(opf).toContain('All 2 of its images have text descriptions.');
  });

  it('declares an EAA exemption and a conformance claim the author makes', async () => {
    const book = sampleBook();
    book.meta.accessibility = { exemption: 'eaa-microenterprise', conformance: true };
    const opf = await (await open(book)).zip.file('OEBPS/content.opf')!.async('string');
    expect(opf).toContain('<meta property="a11y:exemption">eaa-microenterprise</meta>');
    expect(opf).toContain('<meta property="dcterms:conformsTo" id="conformance">EPUB Accessibility 1.1 - WCAG 2.2 Level AA</meta>');
    expect(opf).toContain('<meta property="a11y:certifiedBy" refines="#conformance">Recto Sample Press</meta>');
  });

  it('phrases the same facts as answers for store forms', () => {
    const book = sampleBook();
    const facts = accessibilityFacts(book);
    const answers = storeAnswers(accessibilityMetadata(book, facts), facts);
    const answer = (question: RegExp) => answers.find((a) => question.test(a.question))!.answer;
    expect(answer(/screen reader/)).toBe('Yes');
    expect(answer(/text descriptions/)).toBe('Not applicable (no images)');
    expect(answer(/Conformance/)).toBe('Not claimed');
  });

  it('decodes data URLs', () => {
    const decoded = decodeDataUrl(PNG)!;
    expect(decoded.mediaType).toBe('image/png');
    expect([...decoded.bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });
});
