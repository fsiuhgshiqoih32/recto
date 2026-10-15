import { useId, useRef, useState } from 'react';
import type { Book } from '../model/book';
import { THEMES } from '../themes';
import { BOOK_FONTS, LABEL_CHOICES, ORNAMENT_CHOICES, type StyleCustom, isCustomized } from '../themes/custom';
import { STYLE_PACK_EXTENSION, parseStylePack, stylePackOf } from '../themes/stylePack';
import { fileNameFor } from '../store/file';
import { downloadBlob } from './exporters';
import { Field } from './fields';
import { Icon } from './icons';
import type { BookActions } from './useBook';
import { N_, t } from '../i18n/ui';

/** A select whose first option keeps the book style's own choice. */
function Choice<T extends string>({ label, value, fallback, options, onChange, hint }: {
  label: string;
  value: T | undefined;
  fallback: string;
  options: readonly { id: T; label: string }[];
  onChange: (value: T | undefined) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select value={value ?? ''} onChange={(event) => onChange((event.target.value || undefined) as T | undefined)}>
        <option value="">{t('Style’s own ({choice})', { choice: t(fallback) })}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{t(option.label)}</option>)}
      </select>
    </Field>
  );
}

/**
 * The style builder: changes to the chosen book style, kept with the book and
 * shareable as a .recto-style file.
 */
export function StyleBuilder({ book, actions }: { book: Book; actions: BookActions }) {
  const custom = book.style.custom ?? {};
  const base = THEMES[book.style.theme];
  const id = useId();
  const loadInput = useRef<HTMLInputElement>(null);
  const [css, setCss] = useState(custom.css ?? '');
  const [notes, setNotes] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const customized = isCustomized(book.style.custom);

  const set = (patch: Partial<StyleCustom>) => {
    const next: StyleCustom = { ...custom, ...patch };
    for (const key of Object.keys(next) as (keyof StyleCustom)[]) if (next[key] === undefined || next[key] === '') delete next[key];
    actions.updateStyle({ custom: isCustomized(next) ? next : undefined });
  };
  const fontName = (fontId: string) => BOOK_FONTS.find((f) => f.id === fontId)?.label ?? fontId;

  const applyCss = async () => {
    const { sanitizeCss } = await import('../themes/customCss');
    const result = sanitizeCss(css);
    set({ css: result.css || undefined });
    setNotes(result.notes);
    const rules = result.css ? result.css.split('\n').length : 0;
    setStatus(!css.trim() ? t('Advanced CSS cleared.') : rules === 1 ? t('Applied 1 rule.') : t('Applied {count} rules.', { count: rules }));
  };

  const save = () => {
    const name = window.prompt(t('Name this style'), `${base.name}, ${book.meta.title || t('my book')}`)?.trim();
    if (!name) return;
    const pack = stylePackOf(book, name);
    downloadBlob(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }), fileNameFor({ ...book, meta: { ...book.meta, title: name } }, STYLE_PACK_EXTENSION.slice(1)));
    setStatus(t('Saved “{name}”. Share the file, or load it into another book.', { name }));
  };

  const load = async (file: File) => {
    try {
      const pack = parseStylePack(await file.text());
      const { sanitizeCss } = await import('../themes/customCss');
      const filtered = pack.custom.css ? sanitizeCss(pack.custom.css) : { css: '', notes: [] };
      const next: StyleCustom = { ...pack.custom, css: filtered.css || undefined };
      actions.updateStyle({ theme: pack.theme, custom: isCustomized(next) ? next : undefined });
      setCss(filtered.css);
      setNotes(filtered.notes);
      setStatus(pack.author ? t('Loaded “{name}” by {author}, built on {style}.', { name: pack.name, author: pack.author, style: THEMES[pack.theme].name }) : t('Loaded “{name}”, built on {style}.', { name: pack.name, style: THEMES[pack.theme].name }));
    } catch (error) {
      setNotes([]);
      setStatus(error instanceof Error ? error.message : t('That style couldn’t be loaded.'));
    }
  };

  return (
    <details className="style-builder" open={customized || undefined}>
      <summary>
        <span>{t('Customize {style}', { style: base.name })}</span>
        {customized && <span className="badge">{t('Changed')}</span>}
      </summary>
      <p className="field-hint">{t('Changes apply on top of the style you pick above, in the ebook, the print edition and Word.')}</p>
      <Choice label={t('Body font')} value={custom.bodyFont} fallback={fontName(base.fonts.body)} options={BOOK_FONTS} onChange={(bodyFont) => set({ bodyFont })} />
      <Choice label={t('Heading font')} value={custom.headingFont} fallback={fontName(base.fonts.heading)} options={BOOK_FONTS} onChange={(headingFont) => set({ headingFont })} />
      <Choice label={t('Chapter numbers')} value={custom.chapterLabel} fallback={LABEL_CHOICES.find((l) => l.id === base.chapterLabel)?.label ?? ''} options={LABEL_CHOICES} onChange={(chapterLabel) => set({ chapterLabel })} hint={t('Shown in the book’s language: Chapter One, Capítulo 1, 第一章.')} />
      <Choice label={t('Headings')} value={custom.headingAlign} fallback={N_('as styled')} options={[{ id: 'center', label: N_('Centered') }, { id: 'start', label: N_('Aligned to the text') }] as const} onChange={(headingAlign) => set({ headingAlign })} />
      <Choice label={t('Chapter titles')} value={custom.titleCase} fallback={N_('as styled')} options={[{ id: 'as-typed', label: N_('As typed') }, { id: 'capitals', label: N_('Capitals') }, { id: 'small-caps', label: N_('Small capitals') }] as const} onChange={(titleCase) => set({ titleCase })} />
      <Choice label={t('Title size')} value={custom.titleSize} fallback={N_('as styled')} options={[{ id: 'small', label: N_('Small') }, { id: 'medium', label: N_('Medium') }, { id: 'large', label: N_('Large') }] as const} onChange={(titleSize) => set({ titleSize })} />
      <Choice label={t('Ornament')} value={custom.ornament} fallback={ORNAMENT_CHOICES.find((o) => o.id === base.ornament)?.label ?? ''} options={ORNAMENT_CHOICES} onChange={(ornament) => set({ ornament })} hint={t('Also marks scene breaks.')} />
      <Choice label={t('Ornament by headings')} value={custom.headingOrnament} fallback={base.headingOrnament === 'above' ? N_('above') : base.headingOrnament === 'below' ? N_('below') : N_('none')} options={[{ id: 'above', label: N_('Above') }, { id: 'below', label: N_('Below') }, { id: 'none', label: N_('None') }] as const} onChange={(headingOrnament) => set({ headingOrnament })} />
      <Choice label={t('Paragraphs')} value={custom.paragraphs} fallback={N_('indented')} options={[{ id: 'indented', label: N_('Indented') }, { id: 'spaced', label: N_('Spaced, no indent') }] as const} onChange={(paragraphs) => set({ paragraphs })} />
      <Choice label={t('Line spacing')} value={custom.lineSpacing} fallback={N_('normal')} options={[{ id: 'tight', label: N_('Tight') }, { id: 'loose', label: N_('Loose') }] as const} onChange={(lineSpacing) => set({ lineSpacing })} />

      <label className="field" htmlFor={`${id}-css`}>
        <span className="field-label">{t('Advanced CSS')}</span>
      </label>
      <textarea id={`${id}-css`} className="css-input" rows={6} spellCheck={false} value={css} onChange={(event) => setCss(event.target.value)}
        placeholder={'.chapter-title { letter-spacing: 0.1em; }\n.el blockquote { font-style: italic; }'} aria-describedby={`${id}-css-hint`} />
      <span id={`${id}-css-hint`} className="field-hint">{t('Type, spacing, borders and page breaks for the book’s elements. Nothing that loads from outside the book: no url(), @import or other fonts.')}</span>
      <div className="builder-actions">
        <button type="button" className="btn" onClick={() => void applyCss()}>{t('Apply CSS')}</button>
      </div>
      {!!notes.length && <ul className="css-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>}

      <div className="builder-actions">
        <button type="button" className="btn" onClick={save}><Icon name="download" />{t('Save style…')}</button>
        <button type="button" className="btn" onClick={() => loadInput.current?.click()}><Icon name="upload" />{t('Load style…')}</button>
        {customized && <button type="button" className="btn btn-quiet" onClick={() => { actions.updateStyle({ custom: undefined }); setCss(''); setNotes([]); setStatus(t('Back to {style} as designed.', { style: base.name })); }}>{t('Reset')}</button>}
        <input ref={loadInput} type="file" accept={`${STYLE_PACK_EXTENSION},application/json`} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); event.target.value = ''; }} />
      </div>
      {status && <p className="field-hint" role="status">{status}</p>}
    </details>
  );
}
