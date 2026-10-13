// Hyphenation for print. Chromium only hyphenates when its dictionaries have
// been downloaded by Chrome's updater, which headless Chrome and Electron never
// do, so justified pages came out gappy. Recto inserts soft hyphens itself,
// using the TeX hyphenation patterns (Knuth–Liang) for the book's language.
// Patterns load on demand, one small module per language.

import createHyphenator from 'hyphen';
import { languageInfo } from './languages';

type Patterns = Parameters<typeof createHyphenator>[0];
type Loader = () => Promise<{ default: Patterns }>;

/** Pattern modules for the languages Recto typesets, keyed by language subtag. */
const PATTERNS: Record<string, Loader> = {
  en: () => import('hyphen/patterns/en-us.js'),
  'en-gb': () => import('hyphen/patterns/en-gb.js'),
  de: () => import('hyphen/patterns/de-1996.js'),
  es: () => import('hyphen/patterns/es.js'),
  fr: () => import('hyphen/patterns/fr.js'),
  it: () => import('hyphen/patterns/it.js'),
  pt: () => import('hyphen/patterns/pt.js'),
  nl: () => import('hyphen/patterns/nl.js'),
  sv: () => import('hyphen/patterns/sv.js'),
  da: () => import('hyphen/patterns/da.js'),
  nb: () => import('hyphen/patterns/nb.js'),
  nn: () => import('hyphen/patterns/nn.js'),
  no: () => import('hyphen/patterns/nb.js'),
  fi: () => import('hyphen/patterns/fi.js'),
  pl: () => import('hyphen/patterns/pl.js'),
  cs: () => import('hyphen/patterns/cs.js'),
  sk: () => import('hyphen/patterns/sk.js'),
  sl: () => import('hyphen/patterns/sl.js'),
  hr: () => import('hyphen/patterns/hr.js'),
  ro: () => import('hyphen/patterns/ro.js'),
  hu: () => import('hyphen/patterns/hu.js'),
  tr: () => import('hyphen/patterns/tr.js'),
  ru: () => import('hyphen/patterns/ru.js'),
  uk: () => import('hyphen/patterns/uk.js'),
  bg: () => import('hyphen/patterns/bg.js'),
  el: () => import('hyphen/patterns/el-monoton.js'),
  ca: () => import('hyphen/patterns/ca.js'),
  gl: () => import('hyphen/patterns/gl.js'),
  eu: () => import('hyphen/patterns/eu.js'),
  et: () => import('hyphen/patterns/et.js'),
  lt: () => import('hyphen/patterns/lt.js'),
  lv: () => import('hyphen/patterns/lv.js'),
  is: () => import('hyphen/patterns/is.js'),
  ga: () => import('hyphen/patterns/ga.js'),
  cy: () => import('hyphen/patterns/cy.js'),
  af: () => import('hyphen/patterns/af.js'),
  id: () => import('hyphen/patterns/id.js'),
  la: () => import('hyphen/patterns/la.js'),
  hi: () => import('hyphen/patterns/hi.js'),
};

export type Hyphenate = (text: string) => string;

const loaded = new Map<string, Hyphenate | null>();

function patternKey(lang: string): string | null {
  const code = languageInfo(lang).code.toLowerCase();
  if (code === 'en-gb') return 'en-gb';
  const base = code.split('-')[0];
  return base in PATTERNS ? base : null;
}

/** The hyphenator for a language if it has been loaded (see loadHyphenator), else null. */
export function hyphenatorFor(lang: string): Hyphenate | null {
  const key = patternKey(lang);
  return key ? (loaded.get(key) ?? null) : null;
}

/** Loads a language's patterns. Resolves to null for languages without patterns (CJK, Arabic, Hebrew…). */
export async function loadHyphenator(lang: string): Promise<Hyphenate | null> {
  const key = patternKey(lang);
  if (!key) return null;
  if (!loaded.has(key)) {
    const patterns = (await PATTERNS[key]()).default;
    // Soft hyphens; words under six letters stay whole, as most style guides prefer.
    loaded.set(key, createHyphenator(patterns, { hyphenChar: '­', minWordLength: 6 }) as Hyphenate);
  }
  return loaded.get(key)!;
}
