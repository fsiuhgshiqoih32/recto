import { generateJSON } from '@tiptap/html';
import mammoth from 'mammoth';
import MarkdownIt from 'markdown-it';
import type { Book, BookElement, Doc } from '../model/book';
import { emptyDoc, normalizeOrder } from '../model/book';
import { createElement, newBook } from '../model/defaults';
import { bookExtensions } from '../editor/extensions';
import { decodeText, detectLanguage, htmlCharset } from '../i18n/detect';
import { type ImportedElement, splitManuscript, textToHtml } from './split';

export type ManuscriptFormat = 'docx' | 'markdown' | 'text' | 'html';

export function formatOf(fileName: string): ManuscriptFormat | null {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'docx') return 'docx';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'txt') return 'text';
  if (ext === 'html' || ext === 'htm') return 'html';
  return null;
}

export async function docxToHtml(data: ArrayBuffer): Promise<{ html: string; warnings: string[] }> {
  // mammoth's browser build reads `arrayBuffer`, its Node build reads `buffer`.
  const input = { arrayBuffer: data, buffer: data } as unknown as { arrayBuffer: ArrayBuffer };
  const result = await mammoth.convertToHtml(input, {
    styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", 'small-caps => span.sc'],
  });
  return { html: result.value, warnings: result.messages.map((m) => m.message) };
}

export function markdownToHtml(text: string): string {
  return new MarkdownIt({ html: false, typographer: true }).render(text);
}

export interface Manuscript {
  html: string;
  /** The text encoding a text file was read with (not set for .docx, which is always Unicode). */
  encoding?: string;
}

/**
 * Converts a manuscript of any supported format to HTML. Text formats are
 * decoded with `encoding`, or with the detected one when it is "auto".
 */
export async function manuscriptToHtml(format: ManuscriptFormat, data: ArrayBuffer | string, encoding = 'auto'): Promise<Manuscript> {
  if (format === 'docx') {
    if (typeof data === 'string') throw new Error('A .docx file must be read as binary data.');
    return { html: (await docxToHtml(data)).html };
  }
  let text: string;
  let used: string | undefined;
  if (typeof data === 'string') {
    text = data;
  } else {
    const bytes = new Uint8Array(data);
    const declared = format === 'html' && encoding === 'auto' ? htmlCharset(bytes) : null;
    ({ text, encoding: used } = decodeText(bytes, declared ?? encoding));
  }
  const html = format === 'markdown' ? markdownToHtml(text) : format === 'text' ? textToHtml(text) : text;
  return { html, encoding: used };
}

/** Guesses a manuscript's language from its text. */
export function detectManuscriptLanguage(html: string): string {
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
  return detectLanguage(text).code;
}

export function htmlToDoc(html: string): Doc {
  const doc = generateJSON(html || '<p></p>', bookExtensions) as Doc;
  return doc.content?.length ? doc : emptyDoc();
}

function toElement(imported: ImportedElement, book: Book): BookElement {
  return createElement(imported.kind, book.meta, {
    title: imported.title,
    subtitle: imported.subtitle,
    numbered: imported.kind === 'chapter' || imported.kind === 'part' ? imported.numbered : undefined,
    content: htmlToDoc(imported.html),
  });
}

/** Builds a new book around an imported manuscript, with standard front and back matter in its language. */
export function bookFromManuscript(html: string, title: string, author = '', language = 'en'): Book {
  const book = newBook({ title, author, language });
  const imported = splitManuscript(html).map((el) => toElement(el, book));
  const hasAbout = imported.some((el) => el.kind === 'about-author');
  book.elements = normalizeOrder([
    createElement('title-page', book.meta),
    createElement('copyright', book.meta),
    createElement('toc', book.meta),
    ...imported,
    ...(hasAbout ? [] : [createElement('about-author', book.meta)]),
  ]);
  return book;
}

export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Untitled';
}
