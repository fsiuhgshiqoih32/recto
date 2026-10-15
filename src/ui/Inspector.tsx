import { type CSSProperties, useEffect, useState } from 'react';
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
import { isBoxSet, volumeMembers } from '../model/boxset';
import { listBooks, loadBook } from '../store/db';
import { Field, Toggle } from './fields';
import { StyleBuilder } from './StyleBuilder';
import { canBeVertical } from '../export/epub/vertical';
import { t, uiLanguage } from '../i18n/ui';

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
  const printerNote = !printers.length
    ? binding === 'hardcover' ? t('KDP doesn’t offer this size as a hardcover') : t('KDP doesn’t offer this size as a paperback')
    : printers.length === 1 ? t('{printer} prints this size', { printer: printers[0] }) : t('{printers} print this size', { printers: printers.join(t(' and ')) });
  const trimHint = `${t('About {pages} pages.', { pages })} ${printerNote}; ${t('{printer} takes {min}–{max} pages. The inside margin grows with the page count (at least {inside} in here).', { printer: t(range.printer), min: range.min, max: range.max, inside: kdpMinInside(pages) })}`;
  const changeBinding = (next: Binding) => {
    const allowed = (Object.keys(TRIMS) as TrimId[]).filter((id) => (next === 'hardcover' ? TRIMS[id].printers.includes('kdp-hardcover') : TRIMS[id].printers.some((p) => p !== 'kdp-hardcover')));
    actions.updateStyle({ binding: next, trim: allowed.includes(style.trim) ? style.trim : nearestTrim(style.trim, allowed) });
  };
  const lang = book.meta.language;
  const { dir } = languageInfo(lang);
  const sampleTitle = book.elements.find((el) => el.kind === 'chapter' && el.numbered !== false && el.title.trim())?.title ?? t('The Inventory');
  return (
    <div className="panel-body">
      <h3 className="panel-heading">{t('Book style')}</h3>
      <div className="theme-grid" role="radiogroup" aria-label={t('Book style')}>
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
            <span className="theme-description"><span className="theme-name">{theme.name}</span><span className="theme-blurb">{t(theme.blurb)}</span></span>
            <span className="style-check" aria-hidden="true"><Icon name="check" size={13} /></span>
          </button>
        ))}
      </div>

      <StyleBuilder key={book.id} book={book} actions={actions} />

      <h3 className="panel-heading">{t('Print')}</h3>
      <Field label={t('Binding')}>
        <select value={binding} onChange={(e) => changeBinding(e.target.value as Binding)}>
          <option value="paperback">{t('Paperback')}</option>
          <option value="hardcover">{t('Hardcover (case laminate)')}</option>
        </select>
      </Field>
      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="trim-size">{t('Trim size')}</label>
          <div className="segmented segmented-small units-switch" role="radiogroup" aria-label={t('Units')}
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
              <optgroup key={group.label} label={t(group.label)}>
                {ids.map((id) => <option key={id} value={id}>{trimLabel(TRIMS[id], units)}</option>)}
              </optgroup>
            ) : null;
          })}
        </select>
        <span className="field-hint">{trimHint}</span>
      </div>
      <Field label={t('Right-hand running head')}>
        <select value={style.rectoHeader} onChange={(e) => actions.updateStyle({ rectoHeader: e.target.value as 'title' | 'chapter' })}>
          <option value="title">{t('Book title')}</option>
          <option value="chapter">{t('Chapter title')}</option>
        </select>
      </Field>
      <Toggle
        checked={style.startOnRecto}
        onChange={(startOnRecto) => actions.updateStyle({ startOnRecto })}
        label={t('Chapters start on a right-hand page')}
        hint={t('Blank left-hand pages are added where needed.')}
      />
      <Toggle
        checked={!!style.bleed}
        onChange={(bleed) => actions.updateStyle({ bleed })}
        label={t('Print with bleed')}
        hint={t('Pages grow 0.125 in past the trim at the top, bottom and outside edge, so full-page images can run off the edge. Turn it on only if the book has such images.')}
      />
      <Field label={t('Notes in print')} hint={t('Ebooks always show notes as pop-up footnotes.')}>
        <select value={style.notes ?? 'chapter'} onChange={(e) => actions.updateStyle({ notes: e.target.value as 'chapter' | 'book' | 'page' })}>
          <option value="chapter">{t('At the end of each chapter')}</option>
          <option value="book">{t('In a Notes section at the end of the book')}</option>
          <option value="page">{t('At the foot of the page (footnotes)')}</option>
        </select>
      </Field>

      <h3 className="panel-heading">{t('Text')}</h3>
      <Toggle checked={style.dropCaps} onChange={(dropCaps) => actions.updateStyle({ dropCaps })} label={t('Drop caps')} hint={t('Used by styles that have them.')} />
      <Toggle
        checked={!!style.largePrint}
        onChange={(largePrint) => actions.updateStyle({ largePrint })}
        label={t('Large-print edition')}
        hint={t('16 pt type, ragged right, no hyphenation; best at 6 × 9 in or larger. A large-print paperback needs its own ISBN.')}
      />
      <Toggle
        checked={style.embedFonts}
        onChange={(embedFonts) => actions.updateStyle({ embedFonts })}
        label={t('Embed fonts in the ebook')}
        hint={t('Off lets readers use their own fonts, which most stores prefer.')}
      />
      {canBeVertical(book.meta.language) && <Toggle
        checked={!!style.verticalText}
        onChange={(verticalText) => actions.updateStyle({ verticalText })}
        label={t('Vertical text in the ebook')}
        hint={t('Top to bottom, columns right to left, with short numbers set upright. The print edition stays horizontal.')}
      />}
      <Toggle
        checked={!!style.printPageNumbers}
        onChange={(printPageNumbers) => actions.updateStyle({ printPageNumbers })}
        label={t('Print page numbers in the ebook')}
        hint={t('Readers and screen readers can go to a page of the paperback, and Kindle shows real page numbers. EPUB export lays out the print edition first, so it takes a little longer.') + (style.printPageNumbers && !book.meta.isbnPrint.trim() ? ` ${t('Add the paperback ISBN in Book details to name the edition the numbers come from.')}` : '')}
      />
    </div>
  );
}

export function SectionPanel({ book, element, actions, onEdit, onShowBookDetails }: {
  book: Book; element: BookElement; actions: BookActions; onEdit: () => void; onShowBookDetails: () => void;
}) {
  const update = (patch: Partial<BookElement>) => actions.updateElement(element.id, patch);
  const chapterLike = element.kind === 'chapter' || element.kind === 'part' || element.kind === 'volume';
  const volume = element.kind === 'volume';
  const headless = ['copyright', 'dedication', 'epigraph'].includes(element.kind);
  return <div className="panel-body section-panel">
    <h3 className="panel-heading">{t('{kind} settings', { kind: t(KIND_LABEL[element.kind]) })}</h3>
    <Field label={headless ? t('Name in the navigator') : t('Section title')}>
      <input value={element.title} lang={book.meta.language} dir="auto" onChange={(event) => update({ title: event.target.value })} placeholder={t('Untitled')} />
    </Field>
    {(element.kind === 'chapter' || volume) && <Field label={t('Section subtitle')}><input value={element.subtitle ?? ''} lang={book.meta.language} dir="auto" onChange={(event) => update({ subtitle: event.target.value })} placeholder={t('Optional')} /></Field>}
    {volume && <Field label={t('Volume author')} hint={t('When volumes have different authors, each volume’s opening page, running heads and the ebook’s metadata name them.')}>
      <input value={element.volume?.author ?? ''} dir="auto" onChange={(event) => update({ volume: { ...element.volume, author: event.target.value } })} placeholder={book.meta.author || t('Same as the box set')} />
    </Field>}
    {chapterLike && <Toggle checked={element.numbered !== false} onChange={(numbered) => update({ numbered })} label={t('Numbered')} hint={volume ? t('Book One, Book Two… Chapter numbers start again in each volume.') : t('Chapter numbers update automatically.')} />}
    {volume && element.volume?.source && <VolumeSource book={book} element={element} actions={actions} />}
    {chapterLike && (
      <div className="field">
        <span className="field-label">{t('Heading image')}</span>
        <div className="cover-row">
          {element.headingImage ? <img className="heading-thumb" src={element.headingImage} alt="" /> : null}
          <div className="cover-actions">
            <label className="btn">
              {element.headingImage ? t('Replace…') : t('Choose image…')}
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = () => update({ headingImage: String(reader.result) });
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }} />
            </label>
            {element.headingImage && <button type="button" className="btn btn-quiet" onClick={() => update({ headingImage: undefined })}>{t('Remove')}</button>}
            <span className="field-hint">{t('Shown above the heading, in both editions. Decorative, so screen readers skip it.')}</span>
          </div>
        </div>
      </div>
    )}
    {element.kind !== 'title-page' && <Toggle checked={element.includeInToc} onChange={(includeInToc) => update({ includeInToc })} label={t('Listed in contents')} />}
    <Field label={t('Include in')} hint={element.include === 'ebook' ? t('Left out of the print edition: a newsletter sign-up or store links, for example.') : element.include === 'print' ? t('Left out of the ebook: an order form or a printed-edition note, for example.') : undefined}>
      <select value={element.include ?? 'both'} onChange={(event) => update({ include: event.target.value === 'both' ? undefined : (event.target.value as Edition) })}>
        <option value="both">{t('Ebook and print')}</option>
        <option value="ebook">{t('Ebook only')}</option>
        <option value="print">{t('Print only')}</option>
      </select>
    </Field>
    {element.kind === 'toc' && isBoxSet(book) && <Toggle checked={!book.style.contentsVolumesOnly} onChange={(all) => actions.updateStyle({ contentsVolumesOnly: !all })} label={t('List each volume’s chapters')} hint={t('Off: the contents page lists only the volumes. The ebook’s navigation menu always lists every chapter.')} />}
    {headless && <p className="field-hint">{t('This page prints without a heading.')}</p>}
    {GENERATED_KINDS.has(element.kind) ? <div className="section-note">
      <p>{element.kind === 'toc' ? t('Recto generates this page from sections listed in contents. Print editions include page numbers; ebooks include links.') : t('Recto generates this page from your book details.')}</p>
      {element.kind === 'title-page' && <button className="btn" type="button" onClick={onShowBookDetails}>{t('Edit book details')}</button>}
    </div> : <button className="btn section-edit" type="button" onClick={onEdit}><Icon name="edit" />{t('Edit section text')}</button>}
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
      <h3 className="panel-heading">{t('Book details')}</h3>
      <Field label={t('Title')}>
        <input value={meta.title} onChange={set('title')} />
      </Field>
      <Field label={t('Subtitle')}>
        <input value={meta.subtitle} onChange={set('subtitle')} />
      </Field>
      <Field label={t('Author')}>
        <input value={meta.author} onChange={set('author')} />
      </Field>
      <Field label={t('Publisher')} hint={t('Optional. Shown at the foot of the title page.')}>
        <input value={meta.publisher} onChange={set('publisher')} />
      </Field>
      <LanguagePicker label={t('Language')} value={meta.language} onChange={(language) => actions.updateMeta({ language })} hint={spellcheckNote} />
      <Field label={t('Copyright year')}>
        <input value={meta.copyrightYear} inputMode="numeric" onChange={set('copyrightYear')} />
      </Field>
      <div className="field-row">
        <Field label={t('Ebook ISBN')}>
          <input value={meta.isbnEbook} onChange={set('isbnEbook')} placeholder={t('Optional')} />
        </Field>
        <Field label={t('Paperback ISBN')}>
          <input value={meta.isbnPrint} onChange={set('isbnPrint')} placeholder={t('Optional')} />
        </Field>
      </div>
      <Field label={t('Description')} hint={t('Goes into the ebook\'s metadata.')}>
        <textarea rows={3} value={meta.description} onChange={set('description')} />
      </Field>

      <h3 className="panel-heading">{t('Ebook cover')}</h3>
      <div className="cover-row">
        {meta.cover ? <img className="cover-thumb" src={meta.cover} alt={t('Cover')} /> : <div className="cover-thumb is-empty">{t('No cover')}</div>}
        <div className="cover-actions">
          <label className="btn">
            {meta.cover ? t('Replace…') : t('Choose image…')}
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
              {t('Remove')}
            </button>
          )}
          <span className="field-hint">{t('JPEG or PNG, ideally 1600 × 2560 px. Used for the ebook only.')}</span>
        </div>
      </div>

      <p className="stats">
        {t('{count} words', { count: words.toLocaleString() })} · {t('{count} elements', { count: book.elements.length })}
      </p>
    </div>
  );
}

/** Where a box set's volume came from, and a way to bring in later edits to that book. */
function VolumeSource({ book, element, actions }: { book: Book; element: BookElement; actions: BookActions }) {
  const source = element.volume!.source!;
  const [library, setLibrary] = useState<{ updatedAt: number } | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    void listBooks().then(
      (books) => live && setLibrary(books.find((b) => b.id === source.bookId) ?? null),
      () => live && setLibrary(null),
    );
    return () => { live = false; };
  }, [source.bookId, source.syncedAt]);
  const changed = !!library && library.updatedAt > source.syncedAt;
  const update = async () => {
    const chapters = volumeMembers(book, element.id).length;
    if (!window.confirm(t('Replace the {count} sections in this volume with the current ones from “{title}”? Edits made to them in this box set will be lost.', { count: chapters, title: source.title }))) return;
    try {
      const latest = await loadBook(source.bookId);
      if (!latest) throw new Error('missing');
      actions.updateVolume(element.id, latest);
      setMessage(t('Updated from the library.'));
    } catch (e) {
      setMessage(e instanceof Error && e.message !== 'missing' ? e.message : t('That book is no longer on this device.'));
    }
  };
  return <div className="volume-source">
    <p>{t('Copied from “{title}” on {date}.', { title: source.title, date: new Date(source.syncedAt).toLocaleDateString(uiLanguage()) })}{' '}
      {library === null ? t('That book is no longer on this device.') : changed ? t('It has changed since.') : library ? t('It hasn’t changed since.') : ''}</p>
    {library && <button type="button" className="btn" onClick={() => void update()}>{changed ? t('Update from the library') : t('Copy it again')}</button>}
    {message && <p role="status" className="field-hint">{message}</p>}
  </div>;
}
