import type { Book, BookElement } from '../model/book';
import { GENERATED_KINDS, KIND_LABEL } from '../model/book';
import { computeNumbering, elementLabel, themeOf } from '../render/html';
import { Editor } from '../editor/Editor';
import { fontStack } from '../themes/fonts';
import type { BookActions } from './useBook';

interface ElementPaneProps {
  book: Book;
  element: BookElement;
  actions: BookActions;
  onShowBookDetails: () => void;
  active?: boolean;
}

const HEADLESS = new Set(['copyright', 'dedication', 'epigraph']);

export function ElementPane({ book, element, actions, onShowBookDetails, active = true }: ElementPaneProps) {
  const theme = themeOf(book);
  const label = elementLabel(computeNumbering(book).get(element.id), theme, book.meta.language);
  const isChapterLike = element.kind === 'chapter' || element.kind === 'part';
  const update = (patch: Partial<BookElement>) => actions.updateElement(element.id, patch);

  return (
    <div className="element-pane">
      <div className="element-head">
        <div className="element-kind">
          {label || KIND_LABEL[element.kind]}
          {isChapterLike && element.numbered === false && <span> · unnumbered</span>}
        </div>
        <input
          className="title-input"
          style={{ fontFamily: fontStack(theme.fonts.heading, book.meta.language) }}
          lang={book.meta.language}
          dir="auto"
          value={element.title}
          placeholder={isChapterLike ? 'Untitled (number only)' : KIND_LABEL[element.kind]}
          aria-label={HEADLESS.has(element.kind) ? 'Name in the navigator' : 'Title'}
          onChange={(e) => update({ title: e.target.value })}
        />
        {element.kind === 'chapter' && (
          <input
            className="subtitle-input"
            lang={book.meta.language}
            dir="auto"
            value={element.subtitle ?? ''}
            placeholder="Subtitle (optional)"
            aria-label="Subtitle"
            onChange={(e) => update({ subtitle: e.target.value })}
          />
        )}
        <div className="element-options">
          {isChapterLike && (
            <label className="check">
              <input type="checkbox" checked={element.numbered !== false} onChange={(e) => update({ numbered: e.target.checked })} />
              Numbered
            </label>
          )}
          {element.kind !== 'title-page' && (
            <label className="check">
              <input type="checkbox" checked={element.includeInToc} onChange={(e) => update({ includeInToc: e.target.checked })} />
              Listed in contents
            </label>
          )}
          {HEADLESS.has(element.kind) && <span className="hint">This page prints without a heading.</span>}
        </div>
      </div>
      {GENERATED_KINDS.has(element.kind) ? (
        <div className="generated-note">
          <p>
            {element.kind === 'toc'
              ? 'The contents page is generated from the elements marked “Listed in contents”. In print it shows page numbers; in ebooks the entries are links.'
              : 'The title page is generated from the book’s title, subtitle, author and publisher.'}
          </p>
          {element.kind === 'title-page' && (
            <button type="button" className="btn" onClick={onShowBookDetails}>
              Edit book details
            </button>
          )}
        </div>
      ) : (
        <Editor
          key={element.id}
          elementId={element.id}
          content={element.content}
          theme={theme}
          lang={book.meta.language}
          placeholder={element.kind === 'chapter' ? 'Start writing your chapter…' : 'Write here…'}
          onChange={(content) => update({ content })}
          active={active}
        />
      )}
    </div>
  );
}
