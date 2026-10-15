// The app's own interface language (not the book's: that is book.meta.language).
// Strings are written in English in the code and looked up by that text, the
// way gettext works, so a missing translation shows the English. Catalogs live
// in locales/<code>.json; scripts/i18n-extract.ts gathers the strings for
// translators (Weblate), and `npm run i18n` refreshes them.

export type Catalog = Record<string, string>;

/** Interface languages with a catalog, by their own names. English is the source. */
export const UI_LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
];

const PREFERENCE = 'recto:ui-language';
let catalog: Catalog = {};
let current = 'en';

/** Marks a string for translation without translating it yet (for tables built before a language loads). */
export function N_(source: string): string {
  return source;
}

/** The interface text in the current language; {name} placeholders take `values`. */
export function t(source: string, values?: Record<string, string | number>): string {
  const text = catalog[source] || source;
  return values ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match)) : text;
}

export function uiLanguage(): string {
  return current;
}

/** The language chosen in Settings, else the first of the system's languages Recto has. */
export function preferredUiLanguage(): string {
  let chosen: string | null = null;
  try {
    chosen = localStorage.getItem(PREFERENCE);
  } catch {
    // No storage: follow the system.
  }
  const known = new Set(UI_LANGUAGES.map((l) => l.code));
  if (chosen && known.has(chosen)) return chosen;
  const system = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  for (const tag of system) {
    const base = tag.toLowerCase().split('-')[0];
    if (known.has(base)) return base;
  }
  return 'en';
}

/** Loads the interface language before the app renders. */
export async function loadUiLanguage(code = preferredUiLanguage()): Promise<void> {
  current = code;
  catalog = {};
  document.documentElement.lang = code;
  if (code === 'en') return;
  // Vite turns this into one lazy chunk per catalog. It sits in here so the CLI and the
  // desktop shell, which run outside Vite, can import this module.
  const loaders = import.meta.glob<{ default: Catalog }>('../../locales/*.json');
  const load = loaders[`../../locales/${code}.json`];
  if (!load) return;
  try {
    catalog = (await load()).default;
  } catch {
    // The English text still works.
  }
}

/** Chooses the interface language; the app reloads in it. */
export function setUiLanguage(code: string): void {
  try {
    localStorage.setItem(PREFERENCE, code);
  } catch {
    // Applies to this session only.
  }
  window.location.reload();
}
