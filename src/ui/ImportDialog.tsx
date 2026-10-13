import { useEffect, useId, useRef, useState } from 'react';
import { ENCODING_CHOICES } from '../i18n/detect';
import { languageInfo } from '../i18n/languages';
import type { Book } from '../model/book';
import { Icon } from './icons';
import { LanguagePicker } from './LanguagePicker';

// The importers (mammoth, markdown-it) are large, so they load on first use.
const loadImporters = () => import('../import');

export interface ImportResult {
  book: Book;
  /** What was worked out about the file, for the status line ("Spanish, windows-1252"). */
  summary: string;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (result: ImportResult) => void;
}

export function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const encodingId = useId();
  const [pasted, setPasted] = useState('');
  const [author, setAuthor] = useState('');
  const [language, setLanguage] = useState('auto');
  const [encoding, setEncoding] = useState('auto');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const finish = async (html: string, title: string, usedEncoding?: string) => {
    const { bookFromManuscript, detectManuscriptLanguage } = await loadImporters();
    const detected = language === 'auto';
    const lang = detected ? detectManuscriptLanguage(html) : language;
    const book = bookFromManuscript(html, title, author.trim(), lang);
    const parts = [`${detected ? 'detected ' : ''}${languageInfo(lang).name}`];
    if (usedEncoding && usedEncoding !== 'utf-8') parts.push(`read as ${usedEncoding}`);
    onImport({ book, summary: parts.join(', ') });
  };

  /** Runs an import with the busy state and error message shared by files and pasted text. */
  const run = async (work: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const importFile = (file: File) =>
    run(async () => {
      const { formatOf, manuscriptToHtml, titleFromFileName } = await loadImporters();
      const format = formatOf(file.name);
      if (!format) throw new Error('Recto can import .docx, .md, .txt and .html manuscripts.');
      const { html, encoding: used } = await manuscriptToHtml(format, await file.arrayBuffer(), encoding);
      await finish(html, titleFromFileName(file.name), used);
    }, 'That file could not be read.');

  const importPasted = () =>
    run(async () => {
      const { manuscriptToHtml } = await loadImporters();
      await finish((await manuscriptToHtml('text', pasted)).html, 'Untitled');
    }, 'That text could not be imported.');

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="import-title">
      <header className="dialog-head">
        <h2 id="import-title">Import a manuscript</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <p className="dialog-intro">
        Recto starts a new book from your manuscript, in any language. It splits chapters at <b>Heading 1</b> or chapter lines
        (“Chapter 7”, “Capítulo 7”, “第七章”…), finds parts, prologues and back matter, and turns <code>* * *</code> or{' '}
        <code>#</code> lines into scene breaks.
      </p>
      <label className="field">
        <span className="field-label">Author</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Optional; you can add it later" />
      </label>
      <div className="field-row">
        <LanguagePicker label="Language" value={language} onChange={setLanguage} autoLabel="Detect automatically" />
        <div className="field">
          <label className="field-label" htmlFor={encodingId}>
            Text encoding
          </label>
          <select id={encodingId} value={encoding} onChange={(e) => setEncoding(e.target.value)}>
            <option value="auto">Detect automatically</option>
            {ENCODING_CHOICES.map((enc) => (
              <option key={enc} value={enc}>
                {enc}
              </option>
            ))}
          </select>
          <span className="field-hint">For .txt, .md and .html files. Word files are always read correctly.</span>
        </div>
      </div>
      <label
        className={`dropzone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void importFile(file);
        }}
      >
        <Icon name="upload" size={22} />
        <span>
          <b>Choose a file</b> or drop it here
        </span>
        <span className="field-hint">Word (.docx), Markdown (.md), plain text (.txt) or HTML</span>
        <input
          type="file"
          accept=".docx,.md,.markdown,.txt,.html,.htm"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
      </label>
      <details className="paste">
        <summary>Or paste text</summary>
        <textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'Chapter 1\n\nIt was a dark and stormy night…'} />
        <button
          type="button"
          className="btn"
          disabled={!pasted.trim() || busy}
          onClick={() => void importPasted()}
        >
          Import pasted text
        </button>
      </details>
      {busy && <p className="dialog-status">Reading manuscript…</p>}
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
