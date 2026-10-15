import { useEffect, useId, useRef, useState } from 'react';
import type { Book } from '../model/book';
import { type BookSummary, listBooks, loadBook } from '../store/db';
import { Icon } from './icons';
import { useModal } from './useModal';
import { t, uiLanguage } from '../i18n/ui';

interface LibraryPickerProps {
  title: string;
  intro: string;
  confirmLabel: string;
  /** Pick several books, in the order they are ticked (a new box set), or just one (another volume). */
  multiple: boolean;
  /** The open book, which can't be a volume of itself. */
  excludeId?: string;
  onPick: (books: Book[]) => void;
  onClose: () => void;
}

/** Chooses books from the library on this device, for a box set's volumes. */
export function LibraryPicker({ title, intro, confirmLabel, multiple, excludeId, onPick, onClose }: LibraryPickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useModal(dialog);
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void listBooks().then((all) => setBooks(all.filter((b) => b.id !== excludeId)), () => setBooks([]));
  }, [excludeId]);

  const toggle = (bookId: string) => {
    setError('');
    if (!multiple) setChosen([bookId]);
    else setChosen((prev) => (prev.includes(bookId) ? prev.filter((x) => x !== bookId) : [...prev, bookId]));
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      const loaded = await Promise.all(chosen.map((bookId) => loadBook(bookId)));
      if (loaded.some((b) => !b)) throw new Error(t('One of those books could not be found.'));
      onPick(loaded as Book[]);
      dialog.current?.close();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Those books could not be opened.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="dialog library-picker" onClose={onClose} aria-labelledby={`${id}-title`}>
      <header className="dialog-head">
        <h2 id={`${id}-title`}>{title}</h2>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={() => dialog.current?.close()}><Icon name="close" /></button>
      </header>
      <p className="dialog-intro">{intro}</p>
      {books === null && <p className="dialog-status">{t('Loading your books…')}</p>}
      {books?.length === 0 && <p className="dialog-status">{t('There are no other books on this device yet. Open or import a book first, then come back.')}</p>}
      {!!books?.length && (
        <fieldset className="picker-list">
          <legend className="sr-only">{t('Books on this device')}</legend>
          {books.map((entry) => {
            const position = chosen.indexOf(entry.id);
            return (
              <label key={entry.id} className={`picker-row${position >= 0 ? ' is-chosen' : ''}`}>
                <input type={multiple ? 'checkbox' : 'radio'} name={`${id}-book`} checked={position >= 0} onChange={() => toggle(entry.id)} />
                <span className="picker-text">
                  <span className="picker-title">{entry.title || t('Untitled')}</span>
                  <small>{t('Edited {date}', { date: new Date(entry.updatedAt).toLocaleDateString(uiLanguage()) })}</small>
                </span>
                {multiple && position >= 0 && <span className="picker-order" aria-label={t('Volume {number}', { number: position + 1 })}>{position + 1}</span>}
              </label>
            );
          })}
        </fieldset>
      )}
      {multiple && chosen.length > 1 && <p className="field-hint">{t('Volumes follow the order you ticked them in. You can reorder chapters afterwards.')}</p>}
      {error && <p className="dialog-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>{t('Cancel')}</button>
        <button type="button" className="btn btn-primary" disabled={!chosen.length || busy} onClick={() => void confirm()}>{busy ? t('Working…') : confirmLabel}</button>
      </div>
    </dialog>
  );
}
