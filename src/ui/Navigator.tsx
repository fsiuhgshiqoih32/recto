import { useState } from 'react';
import type { Book, BookElement, ElementKind, Matter } from '../model/book';
import { KIND_LABEL } from '../model/book';
import { toRoman } from '../model/numbers';
import { computeNumbering, elementLabel, themeOf } from '../render/html';
import { Icon } from './icons';
import { ADDABLE, type BookActions } from './useBook';
import { DropdownMenu } from './DropdownMenu';

const GROUPS: { matter: Matter; title: string }[] = [
  { matter: 'front', title: 'Front matter' },
  { matter: 'body', title: 'Chapters' },
  { matter: 'back', title: 'Back matter' },
];

interface NavigatorProps {
  book: Book;
  actions: BookActions;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Navigator({ book, actions, selectedId, onSelect }: NavigatorProps) {
  const numbering = computeNumbering(book);
  const theme = themeOf(book);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const dragMatter = book.elements.find((el) => el.id === dragId)?.matter;

  const rowText = (el: BookElement) => {
    const label = elementLabel(numbering.get(el.id), theme, book.meta.language);
    const title = el.title.trim();
    if (el.kind === 'chapter' || el.kind === 'part') {
      const kind = el.numbered === false ? `Unnumbered ${KIND_LABEL[el.kind].toLowerCase()}` : KIND_LABEL[el.kind];
      return { primary: title || label || 'Untitled', secondary: title ? label || kind : kind };
    }
    return { primary: title || KIND_LABEL[el.kind], secondary: title && title !== KIND_LABEL[el.kind] ? KIND_LABEL[el.kind] : '' };
  };

  const remove = (el: BookElement) => {
    const name = rowText(el).primary;
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    const index = book.elements.findIndex((e) => e.id === el.id);
    actions.removeElement(el.id);
    const next = book.elements[index + 1] ?? book.elements[index - 1];
    if (next && next.id !== el.id) onSelect(next.id);
  };

  return (
    <nav className="navigator" aria-label="Book contents">
      {GROUPS.map(({ matter, title }) => {
        const items = book.elements.filter((el) => el.matter === matter);
        return (
          <section key={matter} className="nav-group">
            <header className="nav-group-head">
              <h2>{title}</h2>
              <AddMenu
                kinds={ADDABLE[matter]}
                onAdd={(kind) => {
                  const afterId = book.elements.find((el) => el.id === selectedId)?.matter === matter ? selectedId! : undefined;
                  onSelect(actions.addElement(kind, afterId).id);
                }}
              />
            </header>
            <ol
              className="nav-list"
              onDragOver={(e) => {
                if (dragMatter === matter) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragMatter === matter) actions.moveElement(dragId, dropTarget);
                setDragId(null);
                setDropTarget(null);
              }}
            >
              {items.map((el, i) => {
                const { primary, secondary } = rowText(el);
                return (
                  <li
                    key={el.id}
                    className={[
                      'nav-item',
                      el.id === selectedId && 'is-selected',
                      el.id === dragId && 'is-dragging',
                      dropTarget === el.id && dragId !== el.id && 'is-drop-target',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', el.id);
                      setDragId(el.id);
                    }}
                    onDragOver={() => dragMatter === matter && setDropTarget(el.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropTarget(null);
                    }}
                  >
                    <button
                      type="button"
                      className="nav-select"
                      data-num={numeral(numbering.get(el.id))}
                      aria-current={el.id === selectedId ? 'true' : undefined}
                      onClick={() => onSelect(el.id)}
                    >
                      <span className="nav-grip" aria-hidden="true">
                        <Icon name="grip" size={14} />
                      </span>
                      <span className="nav-text">
                        <span className="nav-primary">{primary}</span>
                        {secondary && <span className="nav-secondary">{secondary}</span>}
                      </span>
                    </button>
                    <DropdownMenu label={`Actions for ${primary}`} className="icon-btn chapter-menu" align="right" button={<Icon name="more" />}>
                      {(close) => <>
                        <button type="button" role="menuitem" disabled={i === 0} onClick={() => { close(); actions.moveBy(el.id, -1); }}><Icon name="up" />Move up</button>
                        <button type="button" role="menuitem" disabled={i === items.length - 1} onClick={() => { close(); actions.moveBy(el.id, 1); }}><Icon name="down" />Move down</button>
                        <div className="menu-sep" />
                        <button type="button" role="menuitem" className="danger" onClick={() => { close(); remove(el); }}><Icon name="trash" />Delete</button>
                      </>}
                    </DropdownMenu>
                  </li>
                );
              })}
              {!items.length && <li className="nav-empty">Nothing here yet.</li>}
            </ol>
          </section>
        );
      })}
    </nav>
  );
}

/** The margin numeral beside a row (1, 2, 3 for chapters, I, II for parts), drawn by CSS so it stays out of the row's text. */
function numeral(num: { chapter?: number; part?: number } | undefined): string {
  if (num?.chapter) return String(num.chapter);
  if (num?.part) return toRoman(num.part);
  return '';
}

function AddMenu({ kinds, onAdd }: { kinds: ElementKind[]; onAdd: (kind: ElementKind) => void }) {
  if (kinds.length === 1) {
    return (
      <button type="button" className="icon-btn" aria-label={`Add ${KIND_LABEL[kinds[0]]}`} title={`Add ${KIND_LABEL[kinds[0]]}`} onClick={() => onAdd(kinds[0])}>
        <Icon name="plus" size={15} />
      </button>
    );
  }
  return (
    <DropdownMenu label="Add element" className="icon-btn" align="right" button={<Icon name="plus" size={15} />}>
      {(close) => <>
          {kinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                onAdd(kind);
              }}
            >
              {KIND_LABEL[kind]}
            </button>
          ))}
      </>}
    </DropdownMenu>
  );
}
