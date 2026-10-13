import { useId, useState } from 'react';
import { LANGUAGES, canonicalCode, isCjk, languageInfo } from '../i18n/languages';

const SORTED = [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name));

/**
 * Picks a book language: the languages Recto has translations for, or any
 * other BCP 47 code ("sw", "ta", "ur", "ga"…), which still gets the right
 * script, direction and fonts.
 */
export function LanguagePicker({
  label,
  value,
  onChange,
  autoLabel,
  hint,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  /** Offers an "auto" choice with this label. */
  autoLabel?: string;
  hint?: string;
}) {
  const id = useId();
  const listed = value === 'auto' || SORTED.some((l) => l.code.toLowerCase() === value.toLowerCase());
  const [other, setOther] = useState(!listed);
  const [draft, setDraft] = useState(listed ? '' : value);
  const parsed = draft ? canonicalCode(draft) : null;
  const info = value === 'auto' ? null : languageInfo(value);

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={other ? 'other' : SORTED.find((l) => l.code.toLowerCase() === value.toLowerCase())?.code ?? value}
        onChange={(e) => {
          if (e.target.value === 'other') {
            setOther(true);
            setDraft('');
          } else {
            setOther(false);
            onChange(e.target.value);
          }
        }}
      >
        {autoLabel && <option value="auto">{autoLabel}</option>}
        {SORTED.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name === l.native ? l.name : `${l.name} · ${l.native}`}
          </option>
        ))}
        <option value="other">Other language…</option>
      </select>
      {other && (
        <input
          aria-label="Language code"
          value={draft}
          placeholder="Language code, e.g. sw, ta, ur, ga"
          onChange={(e) => {
            setDraft(e.target.value);
            const code = canonicalCode(e.target.value);
            if (code) onChange(code);
          }}
        />
      )}
      {other && draft && !parsed && <span className="field-hint field-error">Not a valid language code.</span>}
      {info && (other ? !!parsed : true) && (
        <span className="field-hint">
          {other && `${info.name} (${info.native}) · `}
          {info.dir === 'rtl' ? 'Right-to-left' : 'Left-to-right'}
          {!info.strings && ' · Recto has no translations for this language, so rename default headings like “Contents” yourself'}
          {isCjk(info.script) &&
            ' · Set in your computer’s serif (Mincho/Song) font; install Noto Serif CJK for the best print results'}
          {hint && ` · ${hint}`}
        </span>
      )}
    </div>
  );
}
