import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { N_, UI_LANGUAGES, t } from '../../src/i18n/ui';
import { extractStrings } from '../../scripts/i18n-extract';

const catalog = (code: string) => JSON.parse(readFileSync(`locales/${code}.json`, 'utf8')) as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('interface translations', () => {
  it('fills in placeholders and falls back to the English text', () => {
    expect(t('Saved to {path}', { path: 'C:\\Books\\harrow.recto' })).toBe('Saved to C:\\Books\\harrow.recto');
    expect(t('A string no catalog has')).toBe('A string no catalog has');
    expect(N_('Marked, not translated')).toBe('Marked, not translated');
  });

  it('keeps locales/en.json in step with the code (run npm run i18n)', () => {
    expect(Object.keys(catalog('en'))).toEqual(extractStrings());
  });

  it('offers only languages with a complete catalog', () => {
    const english = Object.keys(catalog('en'));
    for (const { code } of UI_LANGUAGES.filter((l) => l.code !== 'en')) {
      const translations = catalog(code);
      expect(english.filter((key) => !translations[key]), `${code}: untranslated`).toEqual([]);
    }
  });

  it('keeps every placeholder in every translation, finished or not', () => {
    for (const code of readdirSync('locales').filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.replace('.json', ''))) {
      for (const [key, text] of Object.entries(catalog(code))) expect(placeholders(text), `${code}: ${key}`).toEqual(placeholders(key));
    }
  });
});
