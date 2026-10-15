// Name consistency, without AI: names an author uses often, set beside rare
// spellings one letter away ("Josiah" fourteen times, "Josias" once), so a
// slip in a character's or place's name gets a second look. Heuristics only;
// it suggests, it never changes the text.

import type { Book } from '../model/book';
import { docText } from '../model/book';
import { isBicameral, languageInfo } from '../i18n/languages';

export interface NameVariant {
  /** The spelling the book uses most. */
  name: string;
  count: number;
  /** The rarer spelling that looks like a slip. */
  variant: string;
  variantCount: number;
  /** The first section the variant appears in. */
  elementId: string;
}

/** Edits (insert, delete, change, or swap two neighbours) between two words; anything above `max` reads as max + 1. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    if (Math.min(...row) > max) return max + 1;
    before = previous;
    previous = row;
  }
  return Math.min(previous[b.length], max + 1);
}

// A word starting with a capital: letters, with inner apostrophes or hyphens (O'Neill, Mary-Kate).
const CAPITALIZED = /\p{Lu}[\p{L}\p{M}]*(?:['’-][\p{L}\p{M}]+)*/gu;
const WORDS = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
// After these, a capital may only mark the start of a sentence or a quotation.
const OPENERS = /[.!?:;"“”‘'’—–(…]$/;

/**
 * Finds likely misspellings of names. A word counts as a name when it is
 * capitalized mid-sentence (so ordinary words at the start of a sentence
 * don't), never appears in lower case, and is used at least three times. A
 * variant one letter away (two for long names) that appears at most twice,
 * and under a fifth as often, is reported.
 */
export function nameVariants(book: Book): NameVariant[] {
  if (!isBicameral(languageInfo(book.meta.language).script)) return [];
  const counts = new Map<string, number>();
  const midSentence = new Set<string>();
  const lowercase = new Set<string>();
  const firstSeen = new Map<string, string>();
  for (const el of book.elements) {
    const text = docText(el.content);
    for (const [word] of text.matchAll(WORDS)) if (word === word.toLowerCase()) lowercase.add(word);
    for (const match of text.matchAll(CAPITALIZED)) {
      const word = match[0];
      counts.set(word, (counts.get(word) ?? 0) + 1);
      if (!firstSeen.has(word)) firstSeen.set(word, el.id);
      const preceding = text.slice(Math.max(0, match.index - 40), match.index).trimEnd();
      if (preceding && !OPENERS.test(preceding)) midSentence.add(word);
    }
  }
  // A slip can open a sentence, so variants need only be capitalized words that are never ordinary words.
  const capitalized = [...counts.keys()].filter((word) => word.length >= 4 && !lowercase.has(word.toLowerCase()));
  const names = capitalized.filter((word) => midSentence.has(word));
  const found: NameVariant[] = [];
  for (const name of names) {
    const count = counts.get(name)!;
    if (count < 3) continue;
    for (const variant of capitalized) {
      const variantCount = counts.get(variant)!;
      if (variant === name || variantCount > 2 || variantCount * 5 > count) continue;
      // Plurals and possessives (Josiah's, the Pells) are the same name.
      if (variant.startsWith(name) || name.startsWith(variant)) continue;
      const allowed = Math.min(name.length, variant.length) >= 8 ? 2 : 1;
      if (editDistance(name.toLowerCase(), variant.toLowerCase(), allowed) <= allowed) {
        found.push({ name, count, variant, variantCount, elementId: firstSeen.get(variant)! });
      }
    }
  }
  return found.sort((a, b) => b.count - a.count || a.variant.localeCompare(b.variant));
}
