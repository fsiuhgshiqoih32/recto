import { useCallback, useMemo, useState } from 'react';
import type { Book, BookElement, BookMeta, BookStyle, ElementKind } from '../model/book';
import { normalizeOrder } from '../model/book';
import { copyrightDoc, createElement, defaultTitle } from '../model/defaults';
import { updateVolume, volumeFromBook, withVolume } from '../model/boxset';

export interface BookActions {
  replace(book: Book): void;
  updateMeta(patch: Partial<BookMeta>): void;
  updateStyle(patch: Partial<BookStyle>): void;
  updateElement(id: string, patch: Partial<BookElement>): void;
  /** Adds an element after `afterId` when it is in the same group, else at the end of its group. */
  addElement(kind: ElementKind, afterId?: string): BookElement;
  removeElement(id: string): void;
  /** Moves an element before `beforeId` (same group only), or to the end of its group when null. */
  moveElement(id: string, beforeId: string | null): void;
  moveBy(id: string, delta: -1 | 1): void;
  /** Adds a book from the library as the box set's next volume; throws if that book is a box set itself. */
  addVolume(source: Book): BookElement;
  /** Replaces a volume's chapters with its source book's current ones. */
  updateVolume(volumeId: string, source: Book): void;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useBook(initial: Book): [Book, BookActions] {
  const [book, setBook] = useState(initial);

  const change = useCallback((fn: (book: Book) => Book) => {
    setBook((prev) => ({ ...fn(prev), updatedAt: Date.now() }));
  }, []);

  const addElement = useCallback(
    (kind: ElementKind, afterId?: string) => {
      const element = createElement(kind, book.meta);
      change((prev) => {
        const elements = [...prev.elements];
        const after = afterId ? elements.findIndex((el) => el.id === afterId) : -1;
        if (after >= 0 && elements[after].matter === element.matter) elements.splice(after + 1, 0, element);
        else elements.push(element);
        return { ...prev, elements: normalizeOrder(elements) };
      });
      return element;
    },
    [book.meta, change],
  );

  const actions = useMemo<BookActions>(
    () => ({
      replace: (next) => setBook(next),
      updateMeta: (patch) =>
        change((prev) => {
          const meta = { ...prev.meta, ...patch };
          const relabel = meta.language !== prev.meta.language;
          const elements = prev.elements.map((el) => {
            let next = el;
            // Keep a generated copyright page in step with the details it was generated from.
            if (el.kind === 'copyright' && sameJson(el.content, copyrightDoc(prev.meta))) next = { ...next, content: copyrightDoc(meta) };
            // Default titles follow the book's language ("Contents" → "Índice"); titles the author typed stay.
            if (relabel && el.title === defaultTitle(el.kind, prev.meta.language)) next = { ...next, title: defaultTitle(el.kind, meta.language) };
            return next;
          });
          return { ...prev, meta, elements };
        }),
      updateStyle: (patch) => change((prev) => ({ ...prev, style: { ...prev.style, ...patch } })),
      updateElement: (id, patch) =>
        change((prev) => ({ ...prev, elements: prev.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)) })),
      addElement,
      removeElement: (id) => change((prev) => ({ ...prev, elements: prev.elements.filter((el) => el.id !== id) })),
      moveElement: (id, beforeId) =>
        change((prev) => {
          const moving = prev.elements.find((el) => el.id === id);
          if (!moving || id === beforeId) return prev;
          const rest = prev.elements.filter((el) => el.id !== id);
          const target = beforeId ? rest.findIndex((el) => el.id === beforeId) : -1;
          if (target >= 0 && rest[target].matter !== moving.matter) return prev;
          if (target >= 0) rest.splice(target, 0, moving);
          else rest.push(moving);
          return { ...prev, elements: normalizeOrder(rest) };
        }),
      moveBy: (id, delta) =>
        change((prev) => {
          const i = prev.elements.findIndex((el) => el.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= prev.elements.length || prev.elements[j].matter !== prev.elements[i].matter) return prev;
          const elements = [...prev.elements];
          [elements[i], elements[j]] = [elements[j], elements[i]];
          return { ...prev, elements };
        }),
      addVolume: (source) => {
        const added = volumeFromBook(source);
        change((prev) => withVolume(prev, added));
        return added[0];
      },
      updateVolume: (volumeId, source) => change((prev) => updateVolume(prev, volumeId, source)),
    }),
    [addElement, change],
  );

  return [book, actions];
}

/** Kinds offered by each navigator group's "Add" menu. */
export const ADDABLE: Record<'front' | 'body' | 'back', ElementKind[]> = {
  front: ['title-page', 'copyright', 'dedication', 'epigraph', 'toc'],
  body: ['chapter', 'part', 'volume'],
  back: ['acknowledgments', 'about-author', 'also-by', 'other'],
};
