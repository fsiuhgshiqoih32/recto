import type { BookMeta } from '../../model/book';
import { esc, escAttr } from '../../render/html';
import { type AccessibilityMetadata, accessibilityMetaLines } from './accessibility';

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
  /** Included in the reading order (spine), in manifest order. */
  spine?: boolean;
}

export function bookIdentifier(meta: BookMeta, bookId: string): string {
  const isbn = meta.isbnEbook.replace(/[^0-9Xx]/g, '');
  return isbn.length === 10 || isbn.length === 13 ? `urn:isbn:${isbn}` : `urn:uuid:${bookId}`;
}

/** EPUB requires dcterms:modified as CCYY-MM-DDThh:mm:ssZ. */
export function modifiedStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function opfDocument(opts: {
  meta: BookMeta;
  uid: string;
  modified: Date;
  items: ManifestItem[];
  coverImageId?: string;
  /** Right-to-left books turn their pages the other way. */
  dir?: 'ltr' | 'rtl';
  accessibility?: AccessibilityMetadata;
  /** The print edition a page list refers to (dc:source), e.g. urn:isbn:978…. */
  source?: string;
  /** The authors, when they aren't just the book's author (a box set of several authors' books). */
  creators?: string[];
}): string {
  const { meta } = opts;
  const lang = meta.language || 'en';
  const lines = [
    `<dc:identifier id="bookid">${esc(opts.uid)}</dc:identifier>`,
    `<dc:title id="title">${esc(meta.title || 'Untitled')}</dc:title>`,
  ];
  if (meta.subtitle) {
    lines.push(`<dc:title id="subtitle">${esc(meta.subtitle)}</dc:title>`);
    lines.push(`<meta refines="#subtitle" property="title-type">subtitle</meta>`);
    lines.push(`<meta refines="#title" property="title-type">main</meta>`);
  }
  (opts.creators ?? (meta.author ? [meta.author] : [])).forEach((name, i) => {
    const id = i ? `creator-${i + 1}` : 'creator';
    lines.push(`<dc:creator id="${id}">${esc(name)}</dc:creator>`);
    lines.push(`<meta refines="#${id}" property="role" scheme="marc:relators">aut</meta>`);
  });
  lines.push(`<dc:language>${esc(lang)}</dc:language>`);
  if (meta.publisher) lines.push(`<dc:publisher>${esc(meta.publisher)}</dc:publisher>`);
  if (meta.description) lines.push(`<dc:description>${esc(meta.description)}</dc:description>`);
  if (meta.copyrightYear) {
    lines.push(`<dc:rights>Copyright © ${esc(meta.copyrightYear)} ${esc(meta.author)}</dc:rights>`);
  }
  if (opts.source) lines.push(`<dc:source>${esc(opts.source)}</dc:source>`);
  lines.push(`<meta property="dcterms:modified">${modifiedStamp(opts.modified)}</meta>`);
  if (opts.accessibility) lines.push(...accessibilityMetaLines(opts.accessibility, esc));
  // EPUB 2 readers find the cover through this meta.
  if (opts.coverImageId) lines.push(`<meta name="cover" content="${escAttr(opts.coverImageId)}"/>`);

  const manifest = opts.items
    .map(
      (item) =>
        `    <item id="${escAttr(item.id)}" href="${escAttr(item.href)}" media-type="${item.mediaType}"` +
        `${item.properties ? ` properties="${item.properties}"` : ''}/>`,
    )
    .join('\n');
  const spine = opts.items
    .filter((item) => item.spine)
    .map((item) => `    <itemref idref="${escAttr(item.id)}"/>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escAttr(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    ${lines.join('\n    ')}
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine toc="ncx"${opts.dir === 'rtl' ? ' page-progression-direction="rtl"' : ''}>
${spine}
  </spine>
</package>
`;
}
