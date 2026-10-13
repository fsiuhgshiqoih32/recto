// The .recto file format: one JSON document, images embedded as data: URLs.

import type { Book } from '../model/book';
import { normalizeOrder } from '../model/book';
import { newBook } from '../model/defaults';

interface RectoFile {
  format: 'recto';
  version: 1;
  book: Book;
}

export function serializeBook(book: Book): string {
  const file: RectoFile = { format: 'recto', version: 1, book };
  return JSON.stringify(file, null, 2);
}

/** Parses a .recto file, filling in any settings added since it was saved. */
export function parseBook(text: string): Book {
  const data = JSON.parse(text) as Partial<RectoFile>;
  if (data.format !== 'recto' || !data.book || !Array.isArray(data.book.elements)) {
    throw new Error('This is not a Recto book file.');
  }
  const defaults = newBook();
  const book = data.book;
  return {
    ...book,
    version: 1,
    meta: { ...defaults.meta, ...book.meta },
    style: { ...defaults.style, ...book.style },
    elements: normalizeOrder(book.elements),
  };
}

export function fileNameFor(book: Book, ext: string): string {
  const slug = (book.meta.title || 'book')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);
  return `${slug || 'book'}.${ext}`;
}
