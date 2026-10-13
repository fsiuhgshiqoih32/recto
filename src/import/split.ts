// Turns a manuscript (as HTML) into book elements: finds chapter and part
// headings, prologues and back matter, and normalizes scene breaks to <hr>.
// Needs a DOM (DOMParser): the browser, or happy-dom in tests.

import { LANGUAGES } from '../i18n/languages';
import type { ElementKind } from '../model/book';
import { parseChapterNumber } from '../model/numbers';

export interface ImportedElement {
  kind: ElementKind;
  title: string;
  subtitle?: string;
  numbered: boolean;
  html: string;
}

const SCENE_BREAK = /^\s*(?:[*#~•·⁂❧✻✽§+=-]\s*){1,7}$/;
/** A chapter number in any of the forms parseChapterNumber reads. */
const NUMBER = String.raw`[0-9]+|[٠-٩]+|[۰-۹]+|[०-९]+|[๐-๙]+|[０-９]+|[〇零一二两兩三四五六七八九十百千]+|[ivxlcdm]+|\p{L}+(?:[-\s]\p{L}+)?`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const unique = (items: string[]) => [...new Set(items)];

/**
 * Turns a label template from the language table ("Chapter {n}", "{n}. luku",
 * "第{n}章") into a heading pattern. A title may follow after a separator
 * ("Chapter 7: The Storm"), or after a space when the label has a closing word
 * ("第七章 归来", "第七章：归来"). Requiring that break keeps sentences from being
 * taken for headings: "Chapter two was boring", or Chinese "第一部电影很好看"
 * ("the first movie was good"), where 部 runs straight on into the sentence.
 */
function labelPattern(template: string): RegExp {
  const [before, after] = template.split('{n}').map((s) => escapeRe(s.trim()));
  const tail = after ? String.raw`\s*${after}(?:[\s:.：—–-]+(.*))?` : String.raw`(?:\s*[:.：—–-]\s*(.*)|\s*)`;
  return new RegExp(String.raw`^${before}${before ? String.raw`\s*` : ''}(${NUMBER})${tail}$`, 'iu');
}

const CHAPTER = unique(['Chapter {n}', 'Ch. {n}', ...LANGUAGES.map((l) => l.strings!.chapter)]).map(labelPattern);
const PART = unique(['Part {n}', 'Book {n}', ...LANGUAGES.map((l) => l.strings!.part)]).map(labelPattern);
const NUMBER_ONLY = /^(?:[0-9]+|[ivxlcdm]+)\.?$/i;
const exactly = (words: string[]) => new RegExp(`^(?:${unique(words).map(escapeRe).join('|')})$`, 'iu');
const UNNUMBERED = exactly([
  'interlude', 'introduction', 'foreword', 'preface', 'afterword', 'coda', 'author’s note', "author's note",
  ...LANGUAGES.flatMap((l) => [l.strings!.prologue, l.strings!.epilogue]),
]);
const BACK_MATTER: [RegExp, ElementKind][] = [
  [exactly(['acknowledgement', 'acknowledgements', 'acknowledgment', ...LANGUAGES.map((l) => l.strings!.acknowledgments)]), 'acknowledgments'],
  [exactly(LANGUAGES.map((l) => l.strings!.aboutAuthor)), 'about-author'],
  [new RegExp(`^(?:also by|other books by|books by|${unique(LANGUAGES.map((l) => escapeRe(l.strings!.alsoBy))).join('|')})`, 'iu'), 'also-by'],
];

function matchLabel(patterns: RegExp[], text: string): { title: string } | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && parseChapterNumber(m[1]) !== null) return { title: clean(m[2] ?? '') };
  }
  return null;
}

type Heading = Omit<ImportedElement, 'html'>;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

export function isSceneBreak(el: Element): boolean {
  if (el.tagName === 'HR') return true;
  if (el.tagName !== 'P' || el.querySelector('img')) return false;
  return SCENE_BREAK.test(el.textContent ?? '') && !!clean(el.textContent ?? '');
}

/** Classifies a block as a heading that starts a new element, or returns null. */
function classify(el: Element, headingTag: string | null): Heading | null {
  const text = clean(el.textContent ?? '');
  if (!text || text.length > 90) return null;
  const isHeading = !!headingTag && el.tagName === headingTag;
  if (!isHeading && el.tagName !== 'P') return null;

  const part = matchLabel(PART, text);
  if (part) return { kind: 'part', title: part.title, numbered: true };
  const chapter = matchLabel(CHAPTER, text);
  if (chapter) return { kind: 'chapter', title: chapter.title, numbered: true };
  if (UNNUMBERED.test(text)) return { kind: 'chapter', title: text, numbered: false };
  for (const [re, kind] of BACK_MATTER) {
    if (re.test(text)) return { kind, title: text, numbered: false };
  }
  if (!isHeading) return null;
  if (NUMBER_ONLY.test(text)) return { kind: 'chapter', title: '', numbered: true };
  return { kind: 'chapter', title: text, numbered: true };
}

/** The heading tag that marks chapters: the highest level used, h1 or h2. */
function chapterHeadingTag(els: Element[]): string | null {
  if (els.some((el) => el.tagName === 'H1')) return 'H1';
  if (els.some((el) => el.tagName === 'H2')) return 'H2';
  return null;
}

/** Top-level blocks, unwrapping plain <div> and <section> containers. */
function blocks(parent: Element): Element[] {
  return Array.from(parent.children).flatMap((el) =>
    el.tagName === 'DIV' || el.tagName === 'SECTION' || el.tagName === 'ARTICLE' ? blocks(el) : [el],
  );
}

export function splitManuscript(html: string): ImportedElement[] {
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${html}</body></html>`, 'text/html');
  const els = blocks(doc.body);
  const headingTag = chapterHeadingTag(els);
  const subtitleTag = headingTag === 'H1' ? 'H2' : headingTag === 'H2' ? 'H3' : null;
  const out: ImportedElement[] = [];
  let current: ImportedElement | null = null;
  let justOpened = false;

  for (const el of els) {
    const heading = classify(el, headingTag);
    if (heading) {
      current = { ...heading, html: '' };
      out.push(current);
      justOpened = true;
      continue;
    }
    if (justOpened && current && subtitleTag && el.tagName === subtitleTag && clean(el.textContent ?? '').length <= 90) {
      // "Chapter One" followed by a smaller heading: that heading is the title (or, if there is one, a subtitle).
      if (current.title) current.subtitle = clean(el.textContent ?? '');
      else current.title = clean(el.textContent ?? '');
      justOpened = false;
      continue;
    }
    justOpened = false;
    const block = isSceneBreak(el) ? '<hr>' : el.outerHTML;
    if (!current) {
      // Text before the first heading becomes its own (unnumbered) chapter.
      current = { kind: 'chapter', title: '', numbered: false, html: '' };
      out.push(current);
    }
    current.html += block;
  }

  // Scene breaks at the very start or end of an element are just spacing.
  for (const el of out) el.html = el.html.replace(/^(?:<hr>)+|(?:<hr>)+$/g, '');

  // A manuscript with no headings at all is one numbered chapter.
  if (out.length === 1 && out[0].kind === 'chapter' && !out[0].title && !out[0].numbered) out[0].numbered = true;
  return out;
}

/** Turns plain text into paragraphs: blank lines separate paragraphs when present, otherwise each line is one. */
export function textToHtml(text: string): string {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const chunks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/) : normalized.split('\n');
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return chunks
    .map((chunk) => clean(chunk))
    .filter(Boolean)
    .map((chunk) => `<p>${escape(chunk)}</p>`)
    .join('\n');
}
