// The Book model. Element content is stored as ProseMirror/TipTap JSON so the
// editor, the importers and the renderer all share one document format.

import type { Binding, TrimId } from '../export/print/trims';
import type { StyleCustom } from '../themes/custom';
import { N_ } from '../i18n/ui';

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface Mark {
  type: 'italic' | 'bold' | 'smallCaps' | 'link';
  attrs?: { href?: string };
}

export type InlineNode =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'hardBreak' }
  /** A footnote or endnote: its text lives at the point it's cited. */
  | { type: 'note'; attrs: { content: InlineNode[] } };

/** How an image sits in print: in the text, on a page of its own, bleeding off the page, or across two pages. */
export type ImageLayout = 'inline' | 'page' | 'bleed' | 'spread';

export type CalloutTone = 'note' | 'tip' | 'warning';

/** Stores a link can point to; "universal" is a books2read-style link for any other store. */
export type Store = 'amazon' | 'apple' | 'kobo' | 'google' | 'nook' | 'universal';

export interface ListItemNode {
  type: 'listItem';
  content?: BlockNode[];
}

export interface TableCellNode {
  type: 'tableCell' | 'tableHeader';
  attrs?: { colspan?: number; rowspan?: number; colwidth?: number[] | null };
  content?: BlockNode[];
}

export interface TableRowNode {
  type: 'tableRow';
  content?: TableCellNode[];
}

export type BlockNode =
  | { type: 'paragraph'; attrs?: { textAlign?: TextAlign | null }; content?: InlineNode[] }
  | { type: 'heading'; attrs?: { level?: number; textAlign?: TextAlign | null }; content?: InlineNode[] }
  | { type: 'blockquote'; content?: BlockNode[] }
  | { type: 'sceneBreak' }
  | { type: 'image'; attrs: { src: string; alt?: string | null; title?: string | null; layout?: ImageLayout | null; caption?: string | null } }
  | { type: 'bulletList'; content?: ListItemNode[] }
  | { type: 'orderedList'; attrs?: { start?: number | null }; content?: ListItemNode[] }
  /** Poetry: each paragraph is a stanza, its lines separated by hard breaks. */
  | { type: 'verse'; content?: BlockNode[] }
  | { type: 'callout'; attrs?: { tone?: CalloutTone | null }; content?: BlockNode[] }
  | { type: 'table'; content?: TableRowNode[] }
  | { type: 'textMessage'; attrs?: { side?: 'sent' | 'received' | null; sender?: string | null }; content?: InlineNode[] }
  | { type: 'storeLinks'; attrs: { label: string; links: Partial<Record<Store, string>> } };

export interface Doc {
  type: 'doc';
  content: BlockNode[];
}

export type ElementKind =
  | 'title-page'
  | 'copyright'
  | 'dedication'
  | 'epigraph'
  | 'toc'
  | 'volume'
  | 'part'
  | 'chapter'
  | 'acknowledgments'
  | 'about-author'
  | 'also-by'
  | 'other';

export type Matter = 'front' | 'body' | 'back';

export interface BookElement {
  id: string;
  kind: ElementKind;
  matter: Matter;
  title: string;
  subtitle?: string;
  /** Chapters and parts only: false for prologues, epilogues, interludes. */
  numbered?: boolean;
  includeInToc: boolean;
  /** Only in this edition (an ebook-only newsletter page, a print-only order form). Absent means both. */
  include?: Edition;
  /** Chapters and parts: an image above the heading, as a data: URL. */
  headingImage?: string;
  /** Volumes of a box set: who wrote this one, and the library book it came from. */
  volume?: VolumeInfo;
  content: Doc;
}

export interface VolumeInfo {
  author?: string;
  /** The book in the library this volume was copied from, and the version copied (its updatedAt). */
  source?: { bookId: string; title: string; syncedAt: number };
}

export type Edition = 'ebook' | 'print';

export type ThemeId = 'octavo' | 'ledger' | 'marginalia' | 'broadsheet' | 'almanac';
export type { Binding, TrimId };

export interface BookMeta {
  title: string;
  subtitle: string;
  author: string;
  publisher: string;
  language: string;
  isbnEbook: string;
  isbnPrint: string;
  copyrightYear: string;
  description: string;
  /** Cover image as a data: URL. */
  cover?: string;
  /** What the EPUB declares about its accessibility beyond what Recto can work out itself. */
  accessibility?: {
    /** A European Accessibility Act exemption (W3C a11y:exemption). */
    exemption?: 'eaa-microenterprise' | 'eaa-disproportionate-burden' | 'eaa-fundamental-alteration';
    /** The author has checked the book against WCAG 2.2 AA and claims conformance. */
    conformance?: boolean;
  };
}

export interface BookStyle {
  theme: ThemeId;
  trim: TrimId;
  /** What the running head on right-hand (recto) pages shows. */
  rectoHeader: 'title' | 'chapter';
  startOnRecto: boolean;
  dropCaps: boolean;
  embedFonts: boolean;
  /** Paperback (default) or hardcover: sets the trims and page counts printers allow. */
  binding?: Binding;
  /** Where notes go in print: the end of each chapter (default), a Notes section at the end of the book, or the foot of the page. */
  notes?: 'chapter' | 'book' | 'page';
  /** Print with bleed (0.125 in past the trim), for images that run off the page. */
  bleed?: boolean;
  /** Large-print edition: 16 pt type, ragged right, no hyphenation. */
  largePrint?: boolean;
  /** Paper stock for the print edition; sets the spine width. Defaults to white. */
  paper?: 'white' | 'cream' | 'color';
  /** Box sets: the contents page lists only the volumes (ebook navigation still lists every chapter). */
  contentsVolumesOnly?: boolean;
  /** The ebook carries the print edition's page numbers (an EPUB page list). */
  printPageNumbers?: boolean;
  /** Changes to the style: fonts, headings, paragraphs, ornaments, advanced CSS. */
  custom?: StyleCustom;
  /** Japanese and Chinese ebooks: vertical text, columns right to left. Print stays horizontal. */
  verticalText?: boolean;
}

export interface Book {
  id: string;
  version: 1;
  meta: BookMeta;
  style: BookStyle;
  elements: BookElement[];
  updatedAt: number;
}

export const MATTER_OF: Record<ElementKind, Matter> = {
  'title-page': 'front',
  copyright: 'front',
  dedication: 'front',
  epigraph: 'front',
  toc: 'front',
  volume: 'body',
  part: 'body',
  chapter: 'body',
  acknowledgments: 'back',
  'about-author': 'back',
  'also-by': 'back',
  other: 'back',
};

/** Element kinds by name, in English (the interface shows them through t()). */
export const KIND_LABEL: Record<ElementKind, string> = {
  'title-page': N_('Title Page'),
  copyright: N_('Copyright'),
  dedication: N_('Dedication'),
  epigraph: N_('Epigraph'),
  toc: N_('Contents'),
  volume: N_('Volume'),
  part: N_('Part'),
  chapter: N_('Chapter'),
  acknowledgments: N_('Acknowledgments'),
  'about-author': N_('About the Author'),
  'also-by': N_('Also By'),
  other: N_('Other'),
};

/** Elements whose page is generated from book metadata rather than edited. */
export const GENERATED_KINDS: ReadonlySet<ElementKind> = new Set(['title-page', 'toc']);

const MATTER_RANK: Record<Matter, number> = { front: 0, body: 1, back: 2 };

/** Keeps front matter first and back matter last, preserving order within each group. */
export function normalizeOrder(elements: BookElement[]): BookElement[] {
  return elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => MATTER_RANK[a.el.matter] - MATTER_RANK[b.el.matter] || a.i - b.i)
    .map(({ el }) => el);
}

/** The book as one edition sees it, without the sections that belong only to the other. */
export function editionOf(book: Book, edition: Edition): Book {
  const elements = book.elements.filter((el) => !el.include || el.include === edition);
  return elements.length === book.elements.length ? book : { ...book, elements };
}

/** Whether any element's content holds a node of this type (notes, store links…). */
export function hasNode(book: Book, type: string): boolean {
  const walk = (nodes: unknown[] | undefined): boolean =>
    (nodes ?? []).some((node) => {
      const n = node as { type: string; content?: unknown[] };
      return n.type === type || walk(n.content);
    });
  return book.elements.some((el) => walk(el.content.content));
}

export function emptyDoc(): Doc {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function paragraphs(...texts: string[]): Doc {
  return {
    type: 'doc',
    content: texts.map((text) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : undefined })),
  };
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Plain text of a doc, used for word counts and page estimates. */
const INLINE = new Set(['text', 'hardBreak', 'note']);

/** Plain text of inline content; notes count as text too. */
export function inlineText(nodes: InlineNode[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === 'text' ? n.text : n.type === 'note' ? ` ${inlineText(n.attrs.content)}` : ' ')).join('');
}

export function docText(doc: Doc): string {
  const out: string[] = [];
  // Any node with content holds either inline nodes (a line of text) or more blocks.
  const walk = (nodes: { type: string; content?: unknown[] }[] | undefined) => {
    for (const node of nodes ?? []) {
      const content = node.content as { type: string }[] | undefined;
      if (!content?.length) continue;
      if (INLINE.has(content[0].type)) out.push(inlineText(content as InlineNode[]));
      else walk(content as { type: string; content?: unknown[] }[]);
    }
  };
  walk(doc.content);
  return out.join('\n');
}

/** Chinese characters and Japanese kana: no spaces between words, conventionally counted one per character. */
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
/** Scripts written without spaces between words, which need a word segmenter. */
const UNSPACED = /[\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

let segmenter: Intl.Segmenter | null | undefined;
function segmentedWords(token: string): number {
  if (segmenter === undefined) {
    segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  }
  if (!segmenter) return Math.max(1, Math.round([...token].length / 5));
  let words = 0;
  for (const segment of segmenter.segment(token)) if (segment.isWordLike) words++;
  return words;
}

export interface TextStats {
  /** Words in space-separated text, plus segmented words in Thai and similar scripts. */
  words: number;
  /** Chinese characters and kana. */
  cjk: number;
}

/** Counts text the way each script is measured. Splitting on spaces alone counts a CJK or Thai paragraph as one word. */
export function textStats(book: Book): TextStats {
  let words = 0;
  let cjk = 0;
  for (const el of book.elements) {
    for (const token of docText(el.content).split(/\s+/)) {
      if (!token) continue;
      const characters = token.match(CJK_CHAR)?.length ?? 0;
      if (characters) {
        cjk += characters;
        // Latin text run into the same token ("灯台はABC") still counts as a word.
        if (/[\p{L}\p{N}]/u.test(token.replace(CJK_CHAR, ''))) words++;
      } else if (UNSPACED.test(token)) {
        words += segmentedWords(token);
      } else {
        words++;
      }
    }
  }
  return { words, cjk };
}

/** Word count as authors expect it: words, with each CJK character counted as one. */
export function wordCount(book: Book): number {
  const { words, cjk } = textStats(book);
  return words + cjk;
}
