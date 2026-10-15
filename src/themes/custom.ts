// The style builder: a book's changes to its style (fonts, headings,
// paragraphs, ornaments and a little advanced CSS), applied on top of the
// style's own CSS in every output.

import type { LabelStyle } from '../i18n/labels';
import type { BookFontId } from './fonts';
import type { OrnamentId } from './ornaments';
import type { Theme } from './index';

export interface StyleCustom {
  bodyFont?: BookFontId;
  headingFont?: BookFontId;
  chapterLabel?: LabelStyle;
  headingAlign?: 'center' | 'start';
  titleCase?: 'as-typed' | 'capitals' | 'small-caps';
  titleSize?: 'small' | 'medium' | 'large';
  ornament?: OrnamentId;
  headingOrnament?: 'above' | 'below' | 'none';
  paragraphs?: 'indented' | 'spaced';
  lineSpacing?: 'tight' | 'loose';
  /** Advanced CSS, filtered to safe properties when it was entered (see customCss.ts). */
  css?: string;
}

export const BOOK_FONTS: { id: BookFontId; label: string }[] = [
  { id: 'eb-garamond', label: 'EB Garamond' },
  { id: 'crimson-pro', label: 'Crimson Pro' },
  { id: 'libre-baskerville', label: 'Libre Baskerville' },
  { id: 'cormorant-garamond', label: 'Cormorant Garamond' },
  { id: 'source-serif-4', label: 'Source Serif 4' },
  { id: 'lora', label: 'Lora' },
];

export const ORNAMENT_CHOICES: { id: OrnamentId; label: string }[] = [
  { id: 'diamonds', label: 'Diamonds' },
  { id: 'rule', label: 'Rule' },
  { id: 'flourish', label: 'Flourish' },
  { id: 'squares', label: 'Squares' },
  { id: 'asterism', label: 'Asterism' },
];

export const LABEL_CHOICES: { id: LabelStyle; label: string }[] = [
  { id: 'label-words', label: 'Chapter One' },
  { id: 'label-number', label: 'Chapter 1' },
  { id: 'number', label: '1' },
  { id: 'words', label: 'One' },
];

const TITLE_SIZE = { small: 1.35, medium: 1.8, large: 2.5 };

/** CSS for the chosen settings; the advanced CSS goes last so it can refine them. */
function customRules(custom: StyleCustom): string {
  const rules: string[] = [];
  if (custom.headingAlign) {
    rules.push(`.chapter-head, .part-head, .chapter-subtitle, .matter-heading, .chapter-head .head-orn, .part-head .head-orn { text-align: ${custom.headingAlign}; }`);
  }
  if (custom.titleCase === 'capitals') rules.push('.chapter-title, .part-title { text-transform: uppercase; font-variant: normal; letter-spacing: 0.05em; }');
  else if (custom.titleCase === 'small-caps') rules.push('.chapter-title, .part-title { text-transform: none; font-variant: small-caps; letter-spacing: 0.03em; }');
  else if (custom.titleCase === 'as-typed') rules.push('.chapter-title, .part-title { text-transform: none; font-variant: normal; letter-spacing: normal; }');
  if (custom.titleSize) rules.push(`.chapter-title { font-size: ${TITLE_SIZE[custom.titleSize]}em; }`);
  if (custom.paragraphs === 'spaced') rules.push('.el .body p { text-indent: 0; margin: 0 0 0.8em; }');
  else if (custom.paragraphs === 'indented') rules.push('.el .body p { margin: 0; }');
  if (custom.lineSpacing) rules.push(`.el { line-height: ${custom.lineSpacing === 'tight' ? 1.3 : 1.62}; }`);
  if (custom.css?.trim()) rules.push(guardCss(custom.css));
  return rules.join('\n');
}

const cache = new WeakMap<StyleCustom, Map<string, Theme>>();

/** The style with the book's changes applied. */
export function customTheme(base: Theme, custom: StyleCustom): Theme {
  let byTheme = cache.get(custom);
  if (!byTheme) cache.set(custom, (byTheme = new Map()));
  const cached = byTheme.get(base.id);
  if (cached) return cached;
  const theme: Theme = {
    ...base,
    fonts: { body: custom.bodyFont ?? base.fonts.body, heading: custom.headingFont ?? base.fonts.heading },
    chapterLabel: custom.chapterLabel ?? base.chapterLabel,
    ornament: custom.ornament ?? base.ornament,
    headingOrnament: custom.headingOrnament === 'none' ? undefined : custom.headingOrnament ?? base.headingOrnament,
    css: `${base.css}\n${customRules(custom)}\n`,
  };
  byTheme.set(base.id, theme);
  return theme;
}

/** Whether the book changes anything about its style. */
export function isCustomized(custom: StyleCustom | undefined): boolean {
  return !!custom && Object.values(custom).some((value) => value !== undefined && value !== '');
}

/** Undoes CSS escapes (\75 rl → url) so hidden function names can't slip past the guard. */
function unescape(css: string): string {
  return css.replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16) || 0xfffd)).replace(/\\(.)/g, '$1');
}

const FORBIDDEN = /(url|image|image-set|cross-fade|element|expression|paint|src)\s*\(|@import|behavior\s*:|-moz-binding|javascript:/i;

/**
 * A last line of defence at render time, for CSS that didn't come through the
 * sanitizer (a hand-edited .recto file): drops at-rules and any declaration
 * that could load something from outside the book.
 */
export function guardCss(css: string): string {
  // Comments could hide a forbidden word from the declaration split below.
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/</g, '\\3c ');
  const withoutAtRules = plain.replace(/@[\w-]+[^{};]*(;|\{(?:[^{}]|\{[^{}]*\})*\})/g, '');
  return withoutAtRules.replace(/([{;])([^{};]*)(?=[;}])/g, (match, open: string, declaration: string) => (FORBIDDEN.test(unescape(declaration)) ? open : match));
}
