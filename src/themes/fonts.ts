// Fonts: the OFL book fonts (copied out of @fontsource by scripts/copy-fonts.mjs,
// which also writes font-manifest.json) and per-script fallbacks.

import { type ScriptGroup, isBicameral, languageInfo } from '../i18n/languages';
import manifest from './font-manifest.json';

export type BookFontId = 'eb-garamond' | 'crimson-pro' | 'libre-baskerville' | 'cormorant-garamond' | 'source-serif-4' | 'lora';
export type ScriptFontId = 'noto-naskh-arabic' | 'noto-serif-hebrew' | 'noto-serif-devanagari' | 'noto-serif-thai';
export type FontId = BookFontId | ScriptFontId;

export interface FontFace {
  file: string;
  subset: string;
  weight: number;
  style: string;
  unicodeRange: string;
}

const FONTS = manifest as Record<FontId, { family: string; faces: FontFace[] }>;

export const FONT_FAMILIES = Object.fromEntries(Object.entries(FONTS).map(([id, f]) => [id, f.family])) as Record<FontId, string>;

/** The book font that covers Latin, Cyrillic, Greek and Vietnamese, used when a theme's own font doesn't. */
const WIDE_COVERAGE: BookFontId = 'eb-garamond';

/** Bundled font for scripts the book fonts can't set. */
const SCRIPT_FONT: Partial<Record<ScriptGroup, ScriptFontId>> = {
  arabic: 'noto-naskh-arabic',
  hebrew: 'noto-serif-hebrew',
  devanagari: 'noto-serif-devanagari',
  thai: 'noto-serif-thai',
};

/** System fonts tried for each script (CJK fonts are too large to bundle). */
const SYSTEM_FONTS: Partial<Record<ScriptGroup, string[]>> = {
  arabic: ['Amiri', 'Traditional Arabic', 'Times New Roman'],
  hebrew: ['David', 'Times New Roman'],
  devanagari: ['Nirmala UI', 'Mangal'],
  thai: ['Leelawadee UI', 'Tahoma'],
  'han-simplified': ['Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', 'SimSun'],
  'han-traditional': ['Noto Serif TC', 'Source Han Serif TC', 'Songti TC', 'PMingLiU', 'MingLiU'],
  japanese: ['Noto Serif JP', 'Source Han Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', 'MS Mincho'],
  korean: ['Noto Serif KR', 'Source Han Serif K', 'AppleMyungjo', 'Batang'],
};

const quote = (family: string) => `"${family}"`;

/**
 * CSS font stack for a theme font in a language. Cased scripts use the theme
 * font with a wide-coverage fallback; other scripts lead with a font for that
 * script and keep the theme font for embedded Latin text.
 */
export function fontStack(id: BookFontId, lang = 'en'): string {
  const { script } = languageInfo(lang);
  if (isBicameral(script) || script === 'other') {
    const families = [FONT_FAMILIES[id], ...(id === WIDE_COVERAGE ? [] : [FONT_FAMILIES[WIDE_COVERAGE]]), 'Georgia'];
    return `${families.map(quote).join(', ')}, serif`;
  }
  const scriptFont = SCRIPT_FONT[script];
  const families = [...(scriptFont ? [FONT_FAMILIES[scriptFont]] : []), ...(SYSTEM_FONTS[script] ?? []), FONT_FAMILIES[id]];
  return `${families.map(quote).join(', ')}, serif`;
}

/** The bundled fonts a book in this language can draw on. */
export function bookFonts(ids: BookFontId[], lang: string): FontId[] {
  const scriptFont = SCRIPT_FONT[languageInfo(lang).script];
  return [...new Set<FontId>([...ids, WIDE_COVERAGE, ...(scriptFont ? [scriptFont] : [])])];
}

function parseRanges(unicodeRange: string): [number, number][] {
  return unicodeRange.split(',').map((part) => {
    const [start, end] = part.trim().replace(/^U\+/i, '').split('-');
    if (start.includes('?')) return [parseInt(start.replace(/\?/g, '0'), 16), parseInt(start.replace(/\?/g, 'F'), 16)];
    return [parseInt(start, 16), parseInt(end ?? start, 16)];
  });
}

const rangeCache = new Map<string, [number, number][]>();
function covers(face: FontFace, codePoints: Set<number>): boolean {
  let ranges = rangeCache.get(face.unicodeRange);
  if (!ranges) rangeCache.set(face.unicodeRange, (ranges = parseRanges(face.unicodeRange)));
  for (const cp of codePoints) if (ranges.some(([a, b]) => cp >= a && cp <= b)) return true;
  return false;
}

export function codePointsOf(text: string): Set<number> {
  const set = new Set<number>();
  for (const ch of text) set.add(ch.codePointAt(0)!);
  return set;
}

/**
 * The faces of these fonts that are needed for some text. Without `text`, every
 * face. The Latin subset of book fonts is always kept for digits and punctuation.
 */
export function facesFor(ids: FontId[], text?: string): { id: FontId; face: FontFace }[] {
  const codePoints = text === undefined ? null : codePointsOf(text);
  return [...new Set(ids)].flatMap((id) =>
    FONTS[id].faces
      .filter((face) => !codePoints || face.subset === 'latin' || covers(face, codePoints))
      .map((face) => ({ id, face })),
  );
}

/** @font-face rules for the given fonts, limited to the subsets `text` needs. */
export function fontFaceCss(ids: FontId[], urlFor: (file: string) => string, text?: string): string {
  return facesFor(ids, text)
    .map(
      ({ id, face }) =>
        `@font-face { font-family: "${FONT_FAMILIES[id]}"; font-style: ${face.style}; font-weight: ${face.weight}; ` +
        `font-display: block; src: url("${urlFor(face.file)}") format("woff2"); unicode-range: ${face.unicodeRange}; }`,
    )
    .join('\n');
}

/** Which font package a file belongs to (for serving files straight from node_modules). */
export function packageOf(file: string): FontId | undefined {
  return (Object.keys(FONTS) as FontId[]).find((id) => FONTS[id].faces.some((f) => f.file === file));
}
