import type { CSSProperties, ReactNode } from 'react';
import { chapterLabel } from '../i18n/labels';
import { languageInfo } from '../i18n/languages';
import { LanguagePicker } from './LanguagePicker';
import type { Binding, Book, BookElement, BookMeta, Edition, TrimId } from '../model/book';
import { GENERATED_KINDS, KIND_LABEL, wordCount } from '../model/book';
import { Icon } from './icons';
import { TRIMS, estimatePages, kdpMinInside, trimLabel } from '../export/print/pageCss';
import { TRIM_GROUPS, type Units, pageRange, printersFor } from '../export/print/trims';
import { usePreference } from './preferences';
import { THEME_LIST } from '../themes';
import { fontStack } from '../themes/fonts';
import { ORNAMENTS } from '../themes/ornaments';
import type { BookActions } from './useBook';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

const UNITS = [{ id: 'in', label: 'in' }, { id: 'mm', label: 'mm' }] as const;

/** The allowed trim closest in size to `id`, for when a binding doesn't offer it. */
function nearestTrim(id: TrimId, allowed: TrimId[]): TrimId {
  const area = (t: TrimId) => TRIMS[t].width * TRIMS[t].height;
  return allowed.reduce((best, t) => (Math.abs(area(t) - area(id)) < Math.abs(area(best) - area(id)) ? t : best));
}

export function StylePanel({ book, actions }: { book: Book; actions: BookActions }) {
  const { style } = book;
  const pages = estimatePages(book);
  const [units, setUnits] = usePreference<Units>('recto:units', 'in');
  const binding: Binding = style.binding ?? 'paperback';
  const trim = TRIMS[style.trim];
  const range = pageRange(binding);
  const printers = printersFor(trim, binding);
  const trimHint =
    `About ${pages} pages. ` +
    (printers.length ? `${printers.join(' and ')} print${printers.length === 1 ? 's' : ''} this size` : `KDP doesn't offer this size as a ${binding}`) +
    `; ${range.printer} takes ${range.min}–${range.max} pages. The inside margin grows with the page count (at least ${kdpMinInside(pages)} in here).`;
  const changeBinding = (next: Binding) => {
    const allowed = (Object.keys(TRIMS) as TrimId[]).filter((id) => (next === 'hardcover' ? TRIMS[id].printers.includes('kdp-hardcover') : TRIMS[id].printers.some((p) => p !== 'kdp-hardcover')));
    actions.updateStyle({ binding: next, trim: allowed.includes(style.trim) ? style.trim : nearestTrim(style.trim, allowed) });
  };
  const lang = book.meta.language;
  const { dir } = languageInfo(lang);
  const sampleTitle = book.elements.find((el) => el.kind === 'chapter' && el.numbered !== false && el.title.trim())?.title ?? 'The Inventory';
  return (
    <div className="panel-body">
      <h3 className="panel-heading">Book style</h3>
      <div className="theme-grid" role="radiogroup" aria-label="Book style">
        {THEME_LIST.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={style.theme === theme.id}
            tabIndex={style.theme === theme.id ? 0 : -1}
            className={`theme-card${style.theme === theme.id ? ' is-selected' : ''}`}
            onClick={() => actions.updateStyle({ theme: theme.id })}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const index = THEME_LIST.indexOf(theme);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? THEME_LIST.length - 1 : (index + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + THEME_LIST.length) % THEME_LIST.length;
              actions.updateStyle({ theme: THEME_LIST[next].id });
              (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
            }}
          >
            <span className="theme-sample" lang={lang} dir={dir} style={{ fontFamily: fontStack(theme.fonts.heading, lang) }}>
              <span className={`theme-sample-label theme-${theme.id}`}>{chapterLabel(theme.chapterLabel, lang, 1)}</span>
              <span className={`theme-sample-title theme-${theme.id}`}>{sampleTitle}</span>
              <span className="theme-sample-orn" dangerouslySetInnerHTML={{ __html: ORNAMENTS[theme.ornament] }} />
            </span>
            <span className="theme-description"><span className="theme-name">{theme.name}</span><span className="theme-blurb">{theme.blurb}</span></span>
            <span className="style-check" aria-hidden="true"><Icon name="check" size={13} /></span>
          </button>
        ))}
      </div>

      <h3 className="panel-heading">Print</h3>
      <Field label="Binding">
        <select value={binding} onChange={(e) => changeBinding(e.target.value as Binding)}>
          <option value="paperback">Paperback</option>
          <option value="hardcover">Hardcover (case laminate)</option>
        </select>
      </Field>
      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="trim-size">Trim size</label>
          <div className="segmented segmented-small units-switch" role="radiogroup" aria-label="Units"
            style={{ '--tab-count': UNITS.length, '--tab-index': UNITS.findIndex((u) => u.id === units) } as CSSProperties}>
            <span className="tab-indicator" aria-hidden="true" />
            {UNITS.map((u) => (
              <button key={u.id} type="button" role="radio" aria-checked={units === u.id} className={units === u.id ? 'is-active' : ''} onClick={() => setUnits(u.id)}>{u.label}</button>
            ))}
          </div>
        </div>
        <select id="trim-size" value={style.trim} onChange={(e) => actions.updateStyle({ trim: e.target.value as TrimId })}>
          {TRIM_GROUPS.map((group) => {
            const ids = group.ids.filter((id) => binding === 'paperback' ? !TRIMS[id].printers.every((p) => p === 'kdp-hardcover') : TRIMS[id].printers.includes('kdp-hardcover'));
            return ids.length ? (
              <optgroup key={group.label} label={group.label}>
                {ids.map((id) => <option key={id} value={id}>{trimLabel(TRIMS[id], units)}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <span className="field-hint">{trimHint}</span>
      </div>
      <Field label="Right-hand running head">
        <select value={style.rectoHeader} onChange={(e) => actions.updateStyle({ rectoHeader: e.target.value as 'title' | 'chapter' })}>
          <option value="title">Book title</option>
          <option value="chapter">Chapter title</option>
        </select>
      </Field>
      <Toggle
        checked={style.startOnRecto}
        onChange={(startOnRecto) => actions.updateStyle({ startOnRecto })}
        label="Chapters start on a right-hand page"
        hint="Blank left-hand pages are added where needed."
      />

      <h3 className="panel-heading">Text</h3>
      <Toggle checked={style.dropCaps} onChange={(dropCaps) => actions.updateStyle({ dropCaps })} label="Drop caps" hint="Used by styles that have them." />
      <Toggle
        checked={!!style.largePrint}
        onChange={(largePrint) => actions.updateStyle({ largePrint })}
        label="Large-print edition"
        hint="16 pt type, ragged right, no hyphenation; best at 6 × 9 in or larger. A large-print paperback needs its own ISBN."
      />
      <Toggle
        checked={style.embedFonts}
        onChange={(embedFonts) => actions.updateStyle({ embedFonts })}
        label="Embed fonts in the ebook"
        hint="Off lets readers use their own fonts, which most stores prefer."
      />
    </div>
  );
}

export function SectionPanel({ book, element, actions, onEdit, onShowBookDetails }: {
  book: Book; element: BookElement; actions: BookActions; onEdit: () => void; onShowBookDetails: () => void;
}) {
  const update = (patch: Partial<BookElement>) => actions.updateElement(element.id, patch);
  const chapterLike = element.kind === 'chapter' || element.kind === 'part';
  const headless = ['copyright', 'dedication', 'epigraph'].includes(element.kind);
  return <div className="panel-body section-panel">
    <h3 className="panel-heading">{KIND_LABEL[element.kind]} settings</h3>
    <Field label={headless ? 'Name in the navigator' : 'Section title'}>
      <input value={element.title} lang={book.meta.language} dir="auto" onChange={(event) => update({ title: event.target.value })} placeholder="Untitled" />
    </Field>
    {element.kind === 'chapter' && <Field label="Section subtitle"><input value={element.subtitle ?? ''} lang={book.meta.language} dir="auto" onChange={(event) => update({ subtitle: event.target.value })} placeholder="Optional" /></Field>}
    {chapterLike && <Toggle checked={element.numbered !== false} onChange={(numbered) => update({ numbered })} label="Numbered" hint="Chapter numbers update automatically." />}
    {element.kind !== 'title-page' && <Toggle checked={element.includeInToc} onChange={(includeInToc) => update({ includeInToc })} label="Listed in contents" />}
    <Field label="Include in" hint={element.include === 'ebook' ? 'Left out of the print edition: a newsletter sign-up or store links, for example.' : element.include === 'print' ? 'Left out of the ebook: an order form or a printed-edition note, for example.' : undefined}>
      <select value={element.include ?? 'both'} onChange={(event) => update({ include: event.target.value === 'both' ? undefined : (event.target.value as Edition) })}>
        <option value="both">Ebook and print</option>
        <option value="ebook">Ebook only</option>
        <option value="print">Print only</option>
      </select>
    </Field>
    {headless && <p className="field-hint">This page prints without a heading.</p>}
    {GENERATED_KINDS.has(element.kind) ? <div className="section-note">
      <p>{element.kind === 'toc' ? 'Recto generates this page from sections listed in contents. Print editions include page numbers; ebooks include links.' : 'Recto generates this page from your book details.'}</p>
      {element.kind === 'title-page' && <button className="btn" type="button" onClick={onShowBookDetails}>Edit book details</button>}
    </div> : <button className="btn section-edit" type="button" onClick={onEdit}><Icon name="edit" />Edit section text</button>}
  </div>;
}

export function BookPanel({ book, actions, spellcheckNote }: { book: Book; actions: BookActions; spellcheckNote?: string }) {
  const { meta } = book;
  const set = (key: keyof BookMeta) => (e: { target: { value: string } }) => actions.updateMeta({ [key]: e.target.value });
  const words = wordCount(book);

  const setCover = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => actions.updateMeta({ cover: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return (
    <div className="panel-body">
      <h3 className="panel-heading">Book details</h3>
      <Field label="Title">
        <input value={meta.title} onChange={set('title')} />
      </Field>
      <Field label="Subtitle">
        <input value={meta.subtitle} onChange={set('subtitle')} />
      </Field>
      <Field label="Author">
        <input value={meta.author} onChange={set('author')} />
      </Field>
      <Field label="Publisher" hint="Optional. Shown at the foot of the title page.">
        <input value={meta.publisher} onChange={set('publisher')} />
      </Field>
      <LanguagePicker label="Language" value={meta.language} onChange={(language) => actions.updateMeta({ language })} hint={spellcheckNote} />
      <Field label="Copyright year">
        <input value={meta.copyrightYear} inputMode="numeric" onChange={set('copyrightYear')} />
      </Field>
      <div className="field-row">
        <Field label="Ebook ISBN">
          <input value={meta.isbnEbook} onChange={set('isbnEbook')} placeholder="Optional" />
        </Field>
        <Field label="Paperback ISBN">
          <input value={meta.isbnPrint} onChange={set('isbnPrint')} placeholder="Optional" />
        </Field>
      </div>
      <Field label="Description" hint="Goes into the ebook's metadata.">
        <textarea rows={3} value={meta.description} onChange={set('description')} />
      </Field>

      <h3 className="panel-heading">Ebook cover</h3>
      <div className="cover-row">
        {meta.cover ? <img className="cover-thumb" src={meta.cover} alt="Cover" /> : <div className="cover-thumb is-empty">No cover</div>}
        <div className="cover-actions">
          <label className="btn">
            {meta.cover ? 'Replace…' : 'Choose image…'}
            <input
              type="file"
              accept="image/jpeg,image/png"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setCover(file);
                e.target.value = '';
              }}
            />
          </label>
          {meta.cover && (
            <button type="button" className="btn btn-quiet" onClick={() => actions.updateMeta({ cover: undefined })}>
              Remove
            </button>
          )}
          <span className="field-hint">JPEG or PNG, ideally 1600 × 2560 px. Used for the ebook only.</span>
        </div>
      </div>

      <p className="stats">
        {words.toLocaleString()} words · {book.elements.length} elements
      </p>
    </div>
  );
}
