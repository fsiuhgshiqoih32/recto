// Chapter and part labels in the book's language.

import { numberToWords } from '../model/numbers';
import { bookStrings, languageInfo } from './languages';

/**
 * How a style labels chapters and parts:
 * - `label-words`  "Chapter One" (English) · "Capítulo 1" · "第一章"
 * - `label-number` "Chapter 1" · "Capítulo 1" · "第1章"
 * - `number`       "1" (in the language's digits)
 * - `words`        "One" (English) · "一" (Chinese, Japanese) · otherwise a number
 */
export type LabelStyle = 'label-words' | 'label-number' | 'number' | 'words';

const CJK_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1 → 一, 10 → 十, 21 → 二十一, 105 → 一百五. */
export function toCjkNumeral(n: number): string {
  if (n < 10) return CJK_DIGITS[n];
  if (n < 20) return `十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  if (n < 100) return `${CJK_DIGITS[Math.floor(n / 10)]}十${n % 10 ? CJK_DIGITS[n % 10] : ''}`;
  if (n < 1000) {
    const rest = n % 100;
    return `${CJK_DIGITS[Math.floor(n / 100)]}百${rest ? (rest < 10 ? `〇${CJK_DIGITS[rest]}` : toCjkNumeral(rest).replace(/^十/, '一十')) : ''}`;
  }
  return String(n);
}

/** The number in the language's usual digits (Arabic-Indic for Arabic, Persian digits for Persian, …). */
export function localDigits(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { useGrouping: false }).format(n);
  } catch {
    return String(n);
  }
}

function spelled(n: number, lang: string): string | null {
  const { script, code } = languageInfo(lang);
  if (code.toLowerCase().startsWith('en')) return numberToWords(n);
  if (script === 'han-simplified' || script === 'han-traditional' || script === 'japanese') return toCjkNumeral(n);
  return null;
}

function label(template: string, style: LabelStyle, n: number, lang: string): string {
  switch (style) {
    case 'number':
      return localDigits(n, lang);
    case 'words':
      return spelled(n, lang) ?? localDigits(n, lang);
    case 'label-words':
      return template.replace('{n}', spelled(n, lang) ?? localDigits(n, lang));
    case 'label-number':
      return template.replace('{n}', localDigits(n, lang));
  }
}

export function chapterLabel(style: LabelStyle, lang: string, n: number): string {
  return label(bookStrings(lang).chapter, style, n, lang);
}

export function partLabel(style: LabelStyle, lang: string, n: number): string {
  return label(bookStrings(lang).part, style, n, lang);
}

export function volumeLabel(style: LabelStyle, lang: string, n: number): string {
  return label(bookStrings(lang).volume, style, n, lang);
}
