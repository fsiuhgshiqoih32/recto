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
        <option value="">Style’s own ({fallback})</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
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
    setStatus(css.trim() ? `Applied ${rules} ${rules === 1 ? 'rule' : 'rules'}.` : 'Advanced CSS cleared.');
  };

  const save = () => {
    const name = window.prompt('Name this style', `${base.name}, ${book.meta.title || 'my book'}`)?.trim();
    if (!name) return;
    const pack = stylePackOf(book, name);
    downloadBlob(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }), fileNameFor({ ...book, meta: { ...book.meta, title: name } }, STYLE_PACK_EXTENSION.slice(1)));
    setStatus(`Saved “${name}”. Share the file, or load it into another book.`);
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
      setStatus(`Loaded “${pack.name}”${pack.author ? ` by ${pack.author}` : ''}, built on ${THEMES[pack.theme].name}.`);
    } catch (error) {
      setNotes([]);
      setStatus(error instanceof Error ? error.message : 'That style couldn’t be loaded.');
    }
  };

  return (
    <details className="style-builder" open={customized || undefined}>
      <summary>
        <span>Customize {base.name}</span>
        {customized && <span className="badge">Changed</span>}
      </summary>
      <p className="field-hint">Changes apply on top of the style you pick above, in the ebook, the print edition and Word.</p>
      <Choice label="Body font" value={custom.bodyFont} fallback={fontName(base.fonts.body)} options={BOOK_FONTS} onChange={(bodyFont) => set({ bodyFont })} />
      <Choice label="Heading font" value={custom.headingFont} fallback={fontName(base.fonts.heading)} options={BOOK_FONTS} onChange={(headingFont) => set({ headingFont })} />
      <Choice label="Chapter numbers" value={custom.chapterLabel} fallback={LABEL_CHOICES.find((l) => l.id === base.chapterLabel)?.label ?? ''} options={LABEL_CHOICES} onChange={(chapterLabel) => set({ chapterLabel })} hint="Shown in the book’s language: Chapter One, Capítulo 1, 第一章." />
      <Choice label="Headings" value={custom.headingAlign} fallback="as styled" options={[{ id: 'center', label: 'Centered' }, { id: 'start', label: 'Aligned to the text' }] as const} onChange={(headingAlign) => set({ headingAlign })} />
      <Choice label="Chapter titles" value={custom.titleCase} fallback="as styled" options={[{ id: 'as-typed', label: 'As typed' }, { id: 'capitals', label: 'Capitals' }, { id: 'small-caps', label: 'Small capitals' }] as const} onChange={(titleCase) => set({ titleCase })} />
      <Choice label="Title size" value={custom.titleSize} fallback="as styled" options={[{ id: 'small', label: 'Small' }, { id: 'medium', label: 'Medium' }, { id: 'large', label: 'Large' }] as const} onChange={(titleSize) => set({ titleSize })} />
      <Choice label="Ornament" value={custom.ornament} fallback={ORNAMENT_CHOICES.find((o) => o.id === base.ornament)?.label ?? ''} options={ORNAMENT_CHOICES} onChange={(ornament) => set({ ornament })} hint="Also marks scene breaks." />
      <Choice label="Ornament by headings" value={custom.headingOrnament} fallback={base.headingOrnament ?? 'none'} options={[{ id: 'above', label: 'Above' }, { id: 'below', label: 'Below' }, { id: 'none', label: 'None' }] as const} onChange={(headingOrnament) => set({ headingOrnament })} />
      <Choice label="Paragraphs" value={custom.paragraphs} fallback="indented" options={[{ id: 'indented', label: 'Indented' }, { id: 'spaced', label: 'Spaced, no indent' }] as const} onChange={(paragraphs) => set({ paragraphs })} />
      <Choice label="Line spacing" value={custom.lineSpacing} fallback="normal" options={[{ id: 'tight', label: 'Tight' }, { id: 'loose', label: 'Loose' }] as const} onChange={(lineSpacing) => set({ lineSpacing })} />

      <label className="field" htmlFor={`${id}-css`}>
        <span className="field-label">Advanced CSS</span>
      </label>
      <textarea id={`${id}-css`} className="css-input" rows={6} spellCheck={false} value={css} onChange={(event) => setCss(event.target.value)}
        placeholder={'.chapter-title { letter-spacing: 0.1em; }\n.el blockquote { font-style: italic; }'} aria-describedby={`${id}-css-hint`} />
      <span id={`${id}-css-hint`} className="field-hint">Type, spacing, borders and page breaks for the book’s elements. Nothing that loads from outside the book: no url(), @import or other fonts.</span>
      <div className="builder-actions">
        <button type="button" className="btn" onClick={() => void applyCss()}>Apply CSS</button>
      </div>
      {!!notes.length && <ul className="css-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>}

      <div className="builder-actions">
        <button type="button" className="btn" onClick={save}><Icon name="download" />Save style…</button>
        <button type="button" className="btn" onClick={() => loadInput.current?.click()}><Icon name="upload" />Load style…</button>
        {customized && <button type="button" className="btn btn-quiet" onClick={() => { actions.updateStyle({ custom: undefined }); setCss(''); setNotes([]); setStatus(`Back to ${base.name} as designed.`); }}>Reset</button>}
        <input ref={loadInput} type="file" accept={`${STYLE_PACK_EXTENSION},application/json`} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void load(file); event.target.value = ''; }} />
      </div>
      {status && <p className="field-hint" role="status">{status}</p>}
    </details>
  );
}
