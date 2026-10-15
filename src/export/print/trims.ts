import { N_ } from '../../i18n/ui';
// Trim sizes: KDP's full paperback and hardcover range plus the common
// IngramSpark-only sizes, each with type sized for its page. Sources: KDP help
// topic GVBQ3CMEQW3W2VL6 (trim, bleed and margins) and IngramSpark's size list.

export type TrimId =
  | '5x8' | '5.06x7.81' | '5.25x8' | '5.5x8.5' | '6x9' | '6.14x9.21' | '6.69x9.61' | '7x10' | '7.44x9.69' | '7.5x9.25'
  | '8x10' | '8.25x6' | '8.25x8.25' | '8.5x8.5' | '8.5x11' | '8.25x11' | 'a4' | 'a5' | '4.25x7' | 'demy';

export type Binding = 'paperback' | 'hardcover';
export type Printer = 'kdp' | 'kdp-hardcover' | 'ingramspark';

export interface Trim {
  id: TrimId;
  /** A name it goes by, if any ("Royal", "A5"). */
  name?: string;
  /** Inches. */
  width: number;
  height: number;
  /** Exact metric size, for sizes defined in millimetres. */
  mm?: [number, number];
  /** Body size in points. */
  fontSize: number;
  /** Outside (fore-edge) margin, inches. */
  outside: number;
  printers: Printer[];
}

const t = (id: TrimId, width: number, height: number, fontSize: number, outside: number, printers: Printer[], extra: Partial<Trim> = {}): Trim => ({
  id, width, height, fontSize, outside, printers, ...extra,
});
const ALL: Printer[] = ['kdp', 'ingramspark'];
const HARD: Printer[] = ['kdp', 'kdp-hardcover', 'ingramspark'];

export const TRIMS: Record<TrimId, Trim> = {
  '5x8': t('5x8', 5, 8, 10.5, 0.55, ALL),
  '5.06x7.81': t('5.06x7.81', 5.06, 7.81, 10.5, 0.55, ALL, { name: 'B-format' }),
  '5.25x8': t('5.25x8', 5.25, 8, 10.5, 0.55, ALL),
  '5.5x8.5': t('5.5x8.5', 5.5, 8.5, 11, 0.6, HARD),
  '6x9': t('6x9', 6, 9, 11.5, 0.65, HARD),
  '6.14x9.21': t('6.14x9.21', 6.14, 9.21, 11.5, 0.65, HARD, { name: 'Royal' }),
  '6.69x9.61': t('6.69x9.61', 6.69, 9.61, 11.5, 0.7, ALL),
  '7x10': t('7x10', 7, 10, 12, 0.75, HARD),
  '7.44x9.69': t('7.44x9.69', 7.44, 9.69, 12, 0.75, ALL, { name: 'Crown quarto' }),
  '7.5x9.25': t('7.5x9.25', 7.5, 9.25, 12, 0.75, ALL),
  '8x10': t('8x10', 8, 10, 12, 0.8, ALL),
  '8.25x6': t('8.25x6', 8.25, 6, 11, 0.6, ['kdp'], { name: 'Landscape' }),
  '8.25x8.25': t('8.25x8.25', 8.25, 8.25, 12, 0.8, ['kdp']),
  '8.5x8.5': t('8.5x8.5', 8.5, 8.5, 12, 0.8, ALL),
  '8.5x11': t('8.5x11', 8.5, 11, 12, 0.85, ALL, { name: 'Letter' }),
  '8.25x11': t('8.25x11', 8.25, 11, 12, 0.85, ['kdp-hardcover']),
  a4: t('a4', 8.27, 11.69, 12, 0.85, ALL, { name: 'A4', mm: [210, 297] }),
  a5: t('a5', 5.83, 8.27, 11, 0.6, ['ingramspark'], { name: 'A5', mm: [148, 210] }),
  '4.25x7': t('4.25x7', 4.25, 7, 10, 0.5, ['ingramspark'], { name: 'Mass market' }),
  demy: t('demy', 5.43, 8.5, 11, 0.6, ['ingramspark'], { name: 'Demy', mm: [138, 216] }),
};

export type Units = 'in' | 'mm';

const mm = (inches: number) => Math.round(inches * 25.4);

/** "6.14 × 9.21 in (Royal)" or "156 × 234 mm (Royal)". */
export function trimLabel(trim: Trim, units: Units = 'in'): string {
  const size = units === 'mm' ? `${(trim.mm ?? [mm(trim.width), mm(trim.height)]).join(' × ')} mm` : `${trim.width} × ${trim.height} in`;
  return trim.name ? `${size} (${trim.name})` : size;
}

/** KDP calls trims wider than 6.12 in or taller than 9 in "large", with a few different rules. */
export function isLarge(trim: Trim): boolean {
  return trim.width > 6.12 || trim.height > 9;
}

export interface PageRange {
  printer: string;
  min: number;
  max: number;
}

/** The page counts a printer accepts for a binding (KDP, black ink). */
export function pageRange(binding: Binding): PageRange {
  return binding === 'hardcover' ? { printer: N_('KDP hardcover'), min: 75, max: 550 } : { printer: N_('KDP paperback'), min: 24, max: 828 };
}

/** Who prints a trim in a binding, for the trim picker's notes and preflight. */
export function printersFor(trim: Trim, binding: Binding): string[] {
  const names: string[] = [];
  if (binding === 'hardcover' ? trim.printers.includes('kdp-hardcover') : trim.printers.includes('kdp')) names.push('KDP');
  if (trim.printers.includes('ingramspark')) names.push('IngramSpark');
  return names;
}

export const TRIM_GROUPS: { label: string; ids: TrimId[] }[] = [
  { label: N_('Fiction and memoir'), ids: ['5x8', '5.06x7.81', '5.25x8', '5.5x8.5', '6x9', '6.14x9.21'] },
  { label: N_('Nonfiction and large print'), ids: ['6.69x9.61', '7x10', '7.44x9.69', '7.5x9.25', '8x10', '8.5x11', 'a4'] },
  { label: N_('Square, landscape and picture books'), ids: ['8.25x6', '8.25x8.25', '8.5x8.5'] },
  { label: N_('Hardcover only'), ids: ['8.25x11'] },
  { label: N_('IngramSpark sizes'), ids: ['a5', 'demy', '4.25x7'] },
];
