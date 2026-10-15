import JSZip from 'jszip';
import type { Book, BookElement, Store } from '../../model/book';
import { editionOf } from '../../model/book';
import { bookCreators } from '../../model/boxset';
import type { PageStart } from '../print/pageMap';
import { insertPageBreaks, placePageBreaks } from './pageList';
import { decodeDataUrl } from '../../model/dataUrl';

export { decodeDataUrl };
import { ebookCss } from '../../render/ebookCss';
import { esc, escAttr, renderBook, themeOf } from '../../render/html';
import { ORNAMENTS } from '../../themes/ornaments';
import { bookFonts, facesFor } from '../../themes/fonts';
import { bookStrings, languageInfo } from '../../i18n/languages';
import { buildTocTree, type Landmark, navDocument } from './nav';
import { accessibilityFacts, accessibilityMetadata } from './accessibility';
import { ncxDocument } from './ncx';
import { type ManifestItem, bookIdentifier, opfDocument } from './opf';

export interface EpubOptions {
  /** Loads a font file (by name) for embedding. Required when book.style.embedFonts is on. */
  loadFont?: (file: string) => Promise<Uint8Array>;
  /** Fixed timestamp for reproducible builds and tests. */
  modified?: Date;
  /** The store this edition is for: store-link blocks point at its page. */
  store?: Store;
  /** Where each page of the print edition starts: adds the print page numbers (a page list). */
  pageStarts?: PageStart[];
}

/** The print edition the page numbers come from, for dc:source: its ISBN, or a description. */
export function paginationSource(book: Book): string {
  const isbn = book.meta.isbnPrint.replace(/[^0-9Xx]/g, '');
  return isbn.length === 10 || isbn.length === 13 ? `urn:isbn:${isbn}` : `${book.meta.title || 'Untitled'}, print edition`;
}

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};


function xhtmlDocument(opts: { title: string; lang: string; dir: 'ltr' | 'rtl'; body: string; bodyType?: string }): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escAttr(opts.lang)}" lang="${escAttr(opts.lang)}"${opts.dir === 'rtl' ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8"/>
<title>${esc(opts.title)}</title>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/>
</head>
<body${opts.bodyType ? ` epub:type="${opts.bodyType}"` : ''}>
${opts.body}</body>
</html>
`;
}

function fileNameFor(el: BookElement, index: number): string {
  return `${String(index + 1).padStart(3, '0')}-${el.kind}.xhtml`;
}

export interface EpubFile {
  path: string;
  data: string | Uint8Array;
}

/** Builds the list of files that make up the EPUB (everything except `mimetype`). */
export async function epubFiles(source: Book, options: EpubOptions = {}): Promise<EpubFile[]> {
  const book = editionOf(source, 'ebook');
  const theme = themeOf(book);
  const lang = book.meta.language || 'en';
  const { dir } = languageInfo(lang);
  const strings = bookStrings(lang);
  const uid = bookIdentifier(book.meta, book.id);
  const files: EpubFile[] = [];
  const items: ManifestItem[] = [];

  const fileNames = new Map(book.elements.map((el, i) => [el.id, fileNameFor(el, i)]));

  // Images embedded in the manuscript as data: URLs become files.
  const imageFiles = new Map<string, string>();
  const imageSrc = (src: string) => {
    if (!src.startsWith('data:')) return src;
    let path = imageFiles.get(src);
    if (!path) {
      const decoded = decodeDataUrl(src);
      if (!decoded) return src;
      const ext = IMAGE_EXT[decoded.mediaType] ?? 'bin';
      path = `images/figure-${imageFiles.size + 1}.${ext}`;
      imageFiles.set(src, path);
      files.push({ path: `OEBPS/${path}`, data: decoded.bytes });
      items.push({ id: `figure-${imageFiles.size}`, href: path, mediaType: decoded.mediaType });
    }
    return `../${path}`;
  };

  const ornamentPath = `images/ornament-${theme.ornament}.svg`;
  let rendered = renderBook({
    book,
    theme,
    target: 'epub',
    hrefFor: (el) => fileNames.get(el.id) ?? '',
    ornament: () => `<img src="../${ornamentPath}" alt=""/>`,
    imageSrc,
    store: options.store,
  });

  // Print page numbers: a marker where each printed page starts.
  const pagePlan = options.pageStarts?.length ? placePageBreaks(options.pageStarts, rendered.map((r) => ({ id: r.element.id, html: r.html }))) : null;
  if (pagePlan) rendered = rendered.map((r) => ({ ...r, html: insertPageBreaks(r.html, pagePlan.markers.get(r.element.id) ?? []) }));

  // Cover.
  let coverImageId: string | undefined;
  const cover = book.meta.cover ? decodeDataUrl(book.meta.cover) : null;
  if (cover) {
    const coverPath = `images/cover.${IMAGE_EXT[cover.mediaType] ?? 'jpg'}`;
    coverImageId = 'cover-image';
    files.push({ path: `OEBPS/${coverPath}`, data: cover.bytes });
    items.push({ id: coverImageId, href: coverPath, mediaType: cover.mediaType, properties: 'cover-image' });
    files.push({
      path: 'OEBPS/text/cover.xhtml',
      data: xhtmlDocument({
        title: strings.cover,
        lang,
        dir,
        bodyType: 'cover',
        body: `<section class="cover"><img src="../${coverPath}" alt="${escAttr(book.meta.title)}"/></section>\n`,
      }),
    });
    items.push({ id: 'cover', href: 'text/cover.xhtml', mediaType: 'application/xhtml+xml', spine: true });
  }

  // Content documents, in reading order.
  rendered.forEach(({ element, html, tocText }, i) => {
    const name = fileNames.get(element.id)!;
    files.push({
      path: `OEBPS/text/${name}`,
      data: xhtmlDocument({ title: tocText, lang, dir, body: html, bodyType: `${element.matter}matter` }),
    });
    items.push({ id: `x${String(i + 1).padStart(3, '0')}`, href: `text/${name}`, mediaType: 'application/xhtml+xml', spine: true });
  });

  // Fonts: only the script subsets the book's text uses.
  const allText = `${book.meta.title} ${book.meta.subtitle} ${book.meta.author} ${book.meta.publisher} ${rendered.map((r) => r.html).join(' ')}`;
  let fontUrl: ((file: string) => string) | undefined;
  if (book.style.embedFonts && options.loadFont) {
    const faces = facesFor(bookFonts([theme.fonts.body, theme.fonts.heading], lang), allText).map(({ face }) => face);
    for (const face of faces) {
      files.push({ path: `OEBPS/fonts/${face.file}`, data: await options.loadFont(face.file) });
      items.push({ id: `font-${face.file.replace(/\.woff2$/, '')}`, href: `fonts/${face.file}`, mediaType: 'font/woff2' });
    }
    fontUrl = (file) => `../fonts/${file}`;
  }

  files.push({ path: 'OEBPS/styles/book.css', data: ebookCss(book, fontUrl, allText) });
  items.push({ id: 'css', href: 'styles/book.css', mediaType: 'text/css' });
  files.push({ path: `OEBPS/${ornamentPath}`, data: ORNAMENTS[theme.ornament] });
  items.push({ id: 'ornament', href: ornamentPath, mediaType: 'image/svg+xml' });

  // Navigation.
  const tocItems = rendered
    .filter(({ element }) => element.includeInToc && element.kind !== 'title-page')
    .map(({ element, tocText }) => ({
      text: tocText,
      href: `text/${fileNames.get(element.id)}`,
      kind: element.kind,
      matter: element.matter,
    }));
  const toc = buildTocTree(tocItems);
  const landmarks: Landmark[] = [];
  if (cover) landmarks.push({ type: 'cover', href: 'text/cover.xhtml', text: strings.cover });
  const tocElement = book.elements.find((el) => el.kind === 'toc');
  if (tocElement) landmarks.push({ type: 'toc', href: `text/${fileNames.get(tocElement.id)}`, text: strings.contents });
  const firstBody = book.elements.find((el) => el.matter === 'body');
  if (firstBody) landmarks.push({ type: 'bodymatter', href: `text/${fileNames.get(firstBody.id)}`, text: strings.beginReading });

  const pageList = pagePlan?.pages.map(({ label, elementId }) => ({ label, href: `text/${fileNames.get(elementId)}` }));
  files.push({ path: 'OEBPS/nav.xhtml', data: navDocument({ title: book.meta.title, lang, dir, heading: strings.contents, toc, landmarks, pageList }) });
  items.unshift({ id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: 'nav' });
  files.push({ path: 'OEBPS/toc.ncx', data: ncxDocument({ uid, title: book.meta.title, toc }) });
  items.unshift({ id: 'ncx', href: 'toc.ncx', mediaType: 'application/x-dtbncx+xml' });

  files.push({
    path: 'OEBPS/content.opf',
    data: opfDocument({
      meta: book.meta,
      uid,
      modified: options.modified ?? new Date(),
      items,
      coverImageId,
      dir,
      accessibility: accessibilityMetadata(book, accessibilityFacts(book, { pageList: !!pagePlan })),
      creators: bookCreators(book),
      source: pagePlan ? paginationSource(book) : undefined,
    }),
  });
  files.push({ path: 'META-INF/container.xml', data: CONTAINER_XML });
  return files;
}

/** Builds a complete .epub file. */
export async function buildEpub(book: Book, options: EpubOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  // The mimetype entry must come first and be stored uncompressed.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  const files = await epubFiles(book, options);
  const order = (path: string) => (path.startsWith('META-INF/') ? 0 : path.endsWith('.opf') ? 1 : 2);
  for (const file of [...files].sort((a, b) => order(a.path) - order(b.path))) {
    zip.file(file.path, file.data);
  }
  return zip.generateAsync({
    type: 'uint8array',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

export const STORE_EDITIONS: { store: Store; name: string; file: string }[] = [
  { store: 'amazon', name: 'Amazon Kindle', file: 'kindle' },
  { store: 'apple', name: 'Apple Books', file: 'apple' },
  { store: 'kobo', name: 'Kobo', file: 'kobo' },
  { store: 'google', name: 'Google Play Books', file: 'google' },
  { store: 'nook', name: 'Barnes & Noble', file: 'nook' },
  { store: 'universal', name: 'Other stores and aggregators', file: 'universal' },
];

/**
 * One EPUB per store, each linking only to its own store (some stores reject
 * ebooks that link to a competitor), zipped together for download.
 */
export async function buildStoreEditions(book: Book, baseName: string, options: EpubOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const edition of STORE_EDITIONS) {
    zip.file(`${baseName}-${edition.file}.epub`, await buildEpub(book, { ...options, store: edition.store }), { compression: 'STORE' });
  }
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/zip' });
}
