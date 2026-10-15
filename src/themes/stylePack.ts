// Style packs: a book style and its changes in a small JSON file
// (.recto-style) that authors can share. Packs carry no fonts or images, only
// choices among what Recto bundles, so they are safe to pass around; advanced
// CSS is filtered again when a pack is loaded.

import type { Book, ThemeId } from '../model/book';
import { BOOK_FONTS, LABEL_CHOICES, ORNAMENT_CHOICES, type StyleCustom } from './custom';
import { THEMES } from './index';

export interface StylePack {
  format: 'recto-style';
  version: 1;
  name: string;
  author?: string;
  description?: string;
  /** SPDX licence identifier; packs in Recto's gallery use CC0-1.0. */
  license?: string;
  theme: ThemeId;
  custom: StyleCustom;
}

export const STYLE_PACK_EXTENSION = '.recto-style';

export function stylePackOf(book: Book, name: string, author = book.meta.author): StylePack {
  return { format: 'recto-style', version: 1, name, author: author || undefined, license: 'CC0-1.0', theme: book.style.theme, custom: { ...(book.style.custom ?? {}) } };
}

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined => (allowed.includes(value as T) ? (value as T) : undefined);

/** Reads a style pack, keeping only the settings Recto knows (the caller filters the CSS). */
export function parseStylePack(text: string): StylePack {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('This isn’t a Recto style file.');
  }
  if (data.format !== 'recto-style') throw new Error('This isn’t a Recto style file.');
  if (data.version !== 1) throw new Error('This style was made by a newer version of Recto.');
  const theme = oneOf(data.theme, Object.keys(THEMES) as ThemeId[]);
  if (!theme) throw new Error('This style builds on a book style Recto doesn’t have.');
  const raw = (typeof data.custom === 'object' && data.custom ? data.custom : {}) as Record<string, unknown>;
  const custom: StyleCustom = {
    bodyFont: oneOf(raw.bodyFont, BOOK_FONTS.map((f) => f.id)),
    headingFont: oneOf(raw.headingFont, BOOK_FONTS.map((f) => f.id)),
    chapterLabel: oneOf(raw.chapterLabel, LABEL_CHOICES.map((l) => l.id)),
    headingAlign: oneOf(raw.headingAlign, ['center', 'start'] as const),
    titleCase: oneOf(raw.titleCase, ['as-typed', 'capitals', 'small-caps'] as const),
    titleSize: oneOf(raw.titleSize, ['small', 'medium', 'large'] as const),
    ornament: oneOf(raw.ornament, ORNAMENT_CHOICES.map((o) => o.id)),
    headingOrnament: oneOf(raw.headingOrnament, ['above', 'below', 'none'] as const),
    paragraphs: oneOf(raw.paragraphs, ['indented', 'spaced'] as const),
    lineSpacing: oneOf(raw.lineSpacing, ['tight', 'loose'] as const),
    css: typeof raw.css === 'string' ? raw.css.slice(0, 20_000) : undefined,
  };
  const text80 = (value: unknown) => (typeof value === 'string' ? value.slice(0, 200) : undefined);
  return {
    format: 'recto-style',
    version: 1,
    name: text80(data.name) || 'Untitled style',
    author: text80(data.author),
    description: text80(data.description),
    license: text80(data.license),
    theme,
    custom: Object.fromEntries(Object.entries(custom).filter(([, value]) => value !== undefined)) as StyleCustom,
  };
}
