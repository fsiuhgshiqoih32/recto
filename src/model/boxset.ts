// Box sets and omnibus editions: whole books gathered as the volumes of one book.
// A volume element opens each book; its chapters and parts follow it in the body.

import type { Book, BookElement } from './book';
import { emptyDoc, newId } from './book';
import { createElement, newBook } from './defaults';

export function isBoxSet(book: Book): boolean {
  return book.elements.some((el) => el.kind === 'volume');
}

/** The chapters and parts in a volume: the body elements after it, up to the next volume. */
export function volumeMembers(book: Book, volumeId: string): BookElement[] {
  const start = book.elements.findIndex((el) => el.id === volumeId);
  if (start < 0) return [];
  const members: BookElement[] = [];
  for (const el of book.elements.slice(start + 1)) {
    if (el.matter !== 'body' || el.kind === 'volume') break;
    members.push(el);
  }
  return members;
}

/** The chapters and parts that sit inside a volume (not those before the first one). */
export function elementsInVolumes(book: Book): Set<string> {
  const inside = new Set<string>();
  let open = false;
  for (const el of book.elements) {
    if (el.kind === 'volume') open = true;
    else if (el.matter !== 'body') open = false;
    else if (open) inside.add(el.id);
  }
  return inside;
}

/** What the contents page lists: everything marked for it, or just the volumes when the author chose that. */
export function contentsEntries(book: Book): BookElement[] {
  const hidden = book.style.contentsVolumesOnly ? elementsInVolumes(book) : new Set<string>();
  return book.elements.filter((e) => e.includeInToc && e.kind !== 'toc' && e.kind !== 'title-page' && !hidden.has(e.id));
}

/** Who wrote a volume: its own author, else the box set's. */
export function volumeAuthor(book: Book, volume: BookElement): string {
  return volume.volume?.author?.trim() || book.meta.author.trim();
}

function volumeAuthors(book: Book): string[] {
  const names = book.elements.filter((el) => el.kind === 'volume').map((el) => el.volume?.author?.trim() ?? '');
  return [...new Set(names.filter(Boolean))];
}

/** Whether the volumes are by someone other than the box set's author, so each volume's pages carry its own author. */
export function hasSeveralAuthors(book: Book): boolean {
  const names = volumeAuthors(book);
  return names.length > 1 || (names.length === 1 && names[0] !== book.meta.author.trim());
}

/**
 * The authors for the ebook's metadata: the book's author, or for an anthology
 * each volume's author. A box set author that just joins those names ("Mara
 * Quill and Ada Wren") gives way to the names themselves.
 */
export function bookCreators(book: Book): string[] {
  const own = book.meta.author.trim();
  if (!hasSeveralAuthors(book)) return own ? [own] : [];
  const names = volumeAuthors(book);
  const joined = !!own && names.every((name) => own.includes(name));
  return [...new Set([...(own && !joined ? [own] : []), ...names])];
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A book's chapters and parts, copied with new ids so the same book can sit in several box sets. */
function bodyOf(source: Book): BookElement[] {
  return source.elements.filter((el) => el.matter === 'body').map((el) => ({ ...copy(el), id: newId() }));
}

/**
 * A book as a volume: the volume page (title, subtitle, author and the book's
 * dedication) followed by its chapters. Its other front and back matter stays
 * behind: a box set has one copyright page and one set of back matter.
 */
export function volumeFromBook(source: Book): BookElement[] {
  if (isBoxSet(source)) throw new Error(`“${source.meta.title || 'Untitled'}” is already a box set.`);
  const dedication = source.elements.find((el) => el.kind === 'dedication');
  const volume = createElement('volume', undefined, {
    title: source.meta.title,
    subtitle: source.meta.subtitle || undefined,
    content: dedication ? copy(dedication.content) : emptyDoc(),
    volume: { author: source.meta.author, source: { bookId: source.id, title: source.meta.title, syncedAt: source.updatedAt } },
  });
  return [volume, ...bodyOf(source)];
}

/** Adds a volume (from volumeFromBook) after the last one, before the back matter. */
export function withVolume(book: Book, added: BookElement[]): Book {
  const elements = [...book.elements];
  const firstBack = elements.findIndex((el) => el.matter === 'back');
  elements.splice(firstBack < 0 ? elements.length : firstBack, 0, ...added);
  return { ...book, elements };
}

/**
 * Replaces a volume's chapters with the current ones from its source book. The
 * volume page keeps whatever the author set for the box set.
 */
export function updateVolume(book: Book, volumeId: string, source: Book): Book {
  if (isBoxSet(source)) throw new Error(`“${source.meta.title || 'Untitled'}” is now a box set itself.`);
  const members = new Set(volumeMembers(book, volumeId).map((el) => el.id));
  const elements: BookElement[] = [];
  for (const el of book.elements) {
    if (members.has(el.id)) continue;
    if (el.id !== volumeId) {
      elements.push(el);
      continue;
    }
    elements.push({ ...el, volume: { ...el.volume, source: { bookId: source.id, title: source.meta.title, syncedAt: source.updatedAt } } }, ...bodyOf(source));
  }
  return { ...book, elements };
}

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * A new box set from books in the library, in order. It takes the first book's
 * language, style and back matter (about the author, also by); the title,
 * subtitle and author are a starting point for the author to edit.
 */
export function newBoxSet(sources: Book[]): Book {
  if (!sources.length) throw new Error('Choose at least one book.');
  const [first] = sources;
  const authors = [...new Set(sources.map((s) => s.meta.author.trim()).filter(Boolean))];
  const shell = newBook({
    title: 'Box Set',
    subtitle: sources.length > 1 ? `Books 1–${sources.length}` : '',
    author: joinNames(authors),
    publisher: first.meta.publisher,
    language: first.meta.language,
  });
  const front = shell.elements.filter((el) => el.matter === 'front');
  const backKinds = new Set(['about-author', 'also-by']);
  const back = first.elements.filter((el) => backKinds.has(el.kind)).map((el) => ({ ...copy(el), id: newId() }));
  return {
    ...shell,
    style: { ...first.style },
    elements: [
      ...front,
      ...sources.flatMap((source) => volumeFromBook(source)),
      ...(back.length ? back : shell.elements.filter((el) => el.matter === 'back')),
    ],
  };
}
