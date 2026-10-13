// Local-first library: every book autosaves to IndexedDB in this browser.
import Dexie, { type Table } from 'dexie';
import type { Book } from '../model/book';
import { parseBook, serializeBook } from './file';

interface BookRow {
  id: string;
  title: string;
  updatedAt: number;
  /** Serialized .recto JSON. */
  data: string;
}

export interface BookSummary {
  id: string;
  title: string;
  updatedAt: number;
}

class RectoDB extends Dexie {
  books!: Table<BookRow, string>;
  constructor() {
    super('recto');
    this.version(1).stores({ books: 'id, updatedAt' });
  }
}

let db: RectoDB | null = null;
function open(): RectoDB {
  db ??= new RectoDB();
  return db;
}

export async function saveBook(book: Book): Promise<void> {
  await open().books.put({ id: book.id, title: book.meta.title, updatedAt: book.updatedAt, data: serializeBook(book) });
}

export async function loadBook(id: string): Promise<Book | undefined> {
  const row = await open().books.get(id);
  return row ? parseBook(row.data) : undefined;
}

export async function loadLatestBook(): Promise<Book | undefined> {
  const row = await open().books.orderBy('updatedAt').last();
  return row ? parseBook(row.data) : undefined;
}

// Which book was open last is a per-browser convenience, not part of the library:
// opening a book shouldn't count as editing it (updatedAt drives the library's order).
const LAST_OPEN_KEY = 'recto:last-open-book';

export function rememberOpenBook(id: string): void {
  try {
    localStorage.setItem(LAST_OPEN_KEY, id);
  } catch {
    // Storage unavailable: startup falls back to the most recently edited book.
  }
}

/** The book that was open when Recto last closed, else the most recently edited one. */
export async function loadStartupBook(): Promise<Book | undefined> {
  let id: string | null = null;
  try {
    id = localStorage.getItem(LAST_OPEN_KEY);
  } catch {
    // Fall through to the most recent book.
  }
  return (id ? await loadBook(id) : undefined) ?? loadLatestBook();
}

export async function listBooks(): Promise<BookSummary[]> {
  const rows = await open().books.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
}

export async function deleteBook(id: string): Promise<void> {
  await open().books.delete(id);
}
