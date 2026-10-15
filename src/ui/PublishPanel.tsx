import { useEffect, useMemo, useState } from 'react';
import type { Book, BookMeta } from '../model/book';
import { EXEMPTIONS, accessibilityFacts, accessibilityMetadata, storeAnswers } from '../export/epub/accessibility';
import { AREA_LABEL, type Area, type Finding, SEVERITY_RANK, type Severity, checkBook, checkEpub, checkLayout } from '../preflight/checks';
import { estimatePages } from '../export/print/pageCss';
import { PAPER_LABEL, type Paper, coverWrap } from '../export/cover/wrap';
import { downloadStoreCover, downloadTemplate, edgeColor, printCover } from './covers';
import { measurePrintLayout, validateEpub } from './exporters';
import { Icon, type IconName } from './icons';
import type { BookActions } from './useBook';

const AREAS: Area[] = ['details', 'text', 'print', 'ebook', 'accessibility'];
const SEVERITY_ICON: Record<Severity, IconName> = { error: 'error', warning: 'alert', info: 'info', ok: 'check' };
const SEVERITY_TEXT: Record<Severity, string> = { error: 'Must fix', warning: 'Review', info: 'Note', ok: 'OK' };

interface FullCheck {
  findings: Finding[];
  /** The book revision the check ran against. */
  updatedAt: number;
  /** Pages in the laid-out print edition. */
  pages: number;
}

export function PublishPanel({ book, actions, onOpen }: { book: Book; actions: BookActions; onOpen: (elementId: string) => void }) {
  const quick = useMemo(() => checkBook(book), [book]);
  const [full, setFull] = useState<FullCheck | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<string>();

  const run = async () => {
    setFailure(undefined);
    try {
      setProgress('Laying out the print edition…');
      const layout = await measurePrintLayout(book);
      setProgress('Building and validating the EPUB…');
      const epub = await validateEpub(book);
      setFull({ findings: [...checkLayout(book, layout), ...checkEpub(epub.messages, epub.bytes)], updatedAt: book.updatedAt, pages: layout.pages });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
    }
  };

  const findings = [...quick, ...(full?.findings ?? [])];
  const count = (severity: Severity) => findings.filter((f) => f.severity === severity).length;
  const stale = !!full && full.updatedAt !== book.updatedAt;
  const summary = !full
    ? 'These checks run as you work. Check the whole book to lay out the print pages and validate the EPUB too.'
    : count('error')
      ? `${count('error')} ${count('error') === 1 ? 'problem' : 'problems'} to fix before uploading${count('warning') ? `, ${count('warning')} to review` : ''}.`
      : count('warning')
        ? `Nothing blocks an upload. ${count('warning')} ${count('warning') === 1 ? 'thing' : 'things'} to review.`
        : 'Ready to upload: the print interior and the EPUB pass every check.';

  return (
    <div className="panel-body publish-panel">
      <h3 className="panel-heading">Check before publishing</h3>
      <p className="field-hint publish-summary" aria-live="polite">{summary}</p>
      <div className="publish-run">
        <button type="button" className="btn" onClick={() => void run()} disabled={!!progress}>
          {progress ? <span className="activity-spinner" aria-hidden="true" /> : <Icon name="check" />}
          {progress ? 'Checking…' : full ? 'Check again' : 'Check the whole book'}
        </button>
        {progress && <span className="field-hint">{progress}</span>}
        {stale && !progress && <span className="field-hint">The book has changed since the last check.</span>}
      </div>
      {failure && <p className="field-hint field-error" role="alert">The check could not finish: {failure}</p>}

      {AREAS.map((area) => {
        const items = findings.filter((f) => f.area === area).sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
        if (!items.length) return null;
        return (
          <section key={area} className="finding-group" aria-label={AREA_LABEL[area]}>
            <h4>{AREA_LABEL[area]}</h4>
            <ul className="findings">
              {items.map((finding, i) => (
                <li key={`${finding.title}-${i}`} className={`finding finding-${finding.severity}`}>
                  <Icon name={SEVERITY_ICON[finding.severity]} size={15} />
                  <div className="finding-text">
                    <span className="finding-title"><span className="sr-only">{SEVERITY_TEXT[finding.severity]}: </span>{finding.title}</span>
                    {finding.detail && <span className="finding-detail">{finding.detail}</span>}
                  </div>
                  {finding.elementId && (
                    <button type="button" className="btn btn-quiet finding-open" onClick={() => onOpen(finding.elementId!)}>Open</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <CoverSection book={book} actions={actions} pages={full?.pages} />
      <AccessibilitySection book={book} actions={actions} />
    </div>
  );
}

function CoverSection({ book, actions, pages: measured }: { book: Book; actions: BookActions; pages?: number }) {
  const pages = measured ?? estimatePages(book);
  const paper: Paper = book.style.paper ?? 'white';
  const wrap = useMemo(() => coverWrap(book, pages, paper), [book, pages, paper]);
  const [fromArt, setFromArt] = useState('#2b2b2b');
  const [background, setBackground] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error?: boolean }>();
  const cover = book.meta.cover;

  useEffect(() => {
    let current = true;
    if (cover) void edgeColor(cover).then((color) => current && setFromArt(color), () => undefined);
    return () => {
      current = false;
    };
  }, [cover]);

  const act = async (label: string, work: () => Promise<string | null | void>) => {
    setBusy(label);
    setNote(undefined);
    try {
      const done = await work();
      if (done) setNote({ text: done });
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : String(error), error: true });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h3 className="panel-heading">Covers</h3>
      <div className="cover-tool">
        <span className="field-label">Ebook cover for stores</span>
        <span className="field-hint">{cover ? 'Stores take the cover as a separate JPEG. Recto saves one no taller than 2560 px, which is KDP’s ideal.' : 'Add a cover image in the Book tab first.'}</span>
        <button type="button" className="btn" disabled={!cover || !!busy} onClick={() => void act('jpeg', async () => {
          const { width, height } = await downloadStoreCover(book);
          return `Saved a ${width} × ${height} px JPEG.`;
        })}><Icon name="download" />Download JPEG</button>
      </div>
      <div className="cover-tool">
        <span className="field-label">Paperback cover</span>
        <dl className="cover-facts">
          <div><dt>Full cover, with bleed</dt><dd>{wrap.width} × {wrap.height} in</dd></div>
          <div><dt>Spine</dt><dd>{wrap.spine} in</dd></div>
          <div><dt>Spine text</dt><dd>{wrap.spineText ? 'Allowed' : 'Not below 80 pages'}</dd></div>
        </dl>
        <span className="field-hint">{measured ? `For the ${pages} laid-out pages.` : `For about ${pages} pages. Check the whole book above for the exact spine width.`}</span>
        <label className="field cover-paper">
          <span className="field-label">Paper</span>
          <select value={paper} onChange={(e) => actions.updateStyle({ paper: e.target.value as Paper })}>
            {(Object.keys(PAPER_LABEL) as Paper[]).map((p) => <option key={p} value={p}>{PAPER_LABEL[p]}</option>)}
          </select>
        </label>
        <div className="cover-actions-row">
          <button type="button" className="btn" disabled={!!busy} onClick={() => { downloadTemplate(book, wrap); setNote({ text: 'Saved the template. Design over it at its full size, then hide the guide layer.' }); }}>
            <Icon name="download" />Template (SVG)
          </button>
        </div>
        <label className="field cover-background">
          <span className="field-label">Spine and back color</span>
          <span className="cover-color">
            <input type="color" value={background ?? fromArt} onChange={(e) => setBackground(e.target.value)} aria-label="Spine and back color" />
            {background && <button type="button" className="btn btn-quiet" onClick={() => setBackground(null)}>Match the cover</button>}
          </span>
          <span className="field-hint">The front shows your ebook cover; the back shows the description from the Book tab, with the barcode area left clear.</span>
        </label>
        <button type="button" className="btn" disabled={!!busy} onClick={() => void act('pdf', async () => {
          const result = await printCover(book, wrap, background ?? fromArt);
          if (result === 'canceled') return 'Cover export canceled.';
          return result === 'printed' ? 'Print dialog opened: choose “Save as PDF”.' : `Saved ${result.path}`;
        })}>
          {busy === 'pdf' ? <span className="activity-spinner" aria-hidden="true" /> : <Icon name="printer" />}Make a paperback cover (PDF)
        </button>
      </div>
      {note && <p className={`field-hint${note.error ? ' field-error' : ''}`} role={note.error ? 'alert' : 'status'}>{note.text}</p>}
    </>
  );
}

function AccessibilitySection({ book, actions }: { book: Book; actions: BookActions }) {
  const a11y = book.meta.accessibility ?? {};
  const facts = useMemo(() => accessibilityFacts(book), [book]);
  const answers = useMemo(() => storeAnswers(accessibilityMetadata(book, facts), facts), [book, facts]);
  const [copied, setCopied] = useState(false);
  const update = (patch: NonNullable<BookMeta['accessibility']>) => actions.updateMeta({ accessibility: { ...a11y, ...patch } });
  const exemption = EXEMPTIONS.find((e) => e.id === a11y.exemption);

  const copy = async () => {
    const text = answers.map((a) => `${a.question} ${a.answer}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <h3 className="panel-heading">Accessibility</h3>
      <p className="field-hint">
        The EPUB describes its own accessibility, worked out from the book: navigation, reflowable text and image descriptions.
      </p>
      <label className="field">
        <span className="field-label">European Accessibility Act exemption</span>
        <select value={a11y.exemption ?? ''} onChange={(e) => update({ exemption: (e.target.value || undefined) as typeof a11y.exemption })}>
          <option value="">None</option>
          {EXEMPTIONS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <span className="field-hint">{exemption ? exemption.hint : 'Books sold in the EU must be accessible unless an exemption applies.'}</span>
      </label>
      <label className="toggle">
        <input type="checkbox" role="switch" checked={!!a11y.conformance} onChange={(e) => update({ conformance: e.target.checked })} />
        <span className="toggle-track" aria-hidden="true" />
        <span>
          <span className="toggle-label">Claim WCAG 2.2 AA conformance</span>
          <span className="field-hint">Only after checking the book yourself, for example with DAISY Ace. The claim names you as the one who checked it.</span>
        </span>
      </label>
      <div className="store-answers">
        <div className="store-answers-head">
          <span className="field-label">Answers for store forms</span>
          <button type="button" className="btn btn-quiet" onClick={() => void copy()}>
            <Icon name={copied ? 'check' : 'copy'} />{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="field-hint">KDP, Google Play and Draft2Digital ask these questions when you upload; their forms don’t read the file.</p>
        <dl>
          {answers.map((a) => (
            <div key={a.question}><dt>{a.question}</dt><dd>{a.answer}</dd></div>
          ))}
        </dl>
      </div>
    </>
  );
}
