// The Book model. Element content is stored as ProseMirror/TipTap JSON so the
// editor, the importers and the renderer all share one document format.

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

export interface Mark {
  type: 'italic' | 'bold' | 'smallCaps' | 'link';
  attrs?: { href?: string };
}

export type InlineNode =
  | { type: 'text'; text: string; marks?: Mark[] }
  | { type: 'hardBreak' };

export type BlockNode =
  | { type: 'paragraph'; attrs?: { textAlign?: TextAlign | null }; content?: InlineNode[] }
  | { type: 'heading'; attrs?: { level?: number; textAlign?: TextAlign | null }; content?: InlineNode[] }
  | { type: 'blockquote'; content?: BlockNode[] }
  | { type: 'sceneBreak' }
  | { type: 'image'; attrs: { src: string; alt?: string | null; title?: string | null } };

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
  content: Doc;
}

export type ThemeId = 'octavo' | 'ledger' | 'marginalia' | 'broadsheet' | 'almanac';
export type TrimId = '5x8' | '5.25x8' | '5.5x8.5' | '6x9' | 'a5';

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
  /** Paper stock for the print edition; sets the spine width. Defaults to white. */
  paper?: 'white' | 'cream' | 'color';
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
  part: 'body',
  chapter: 'body',
  acknowledgments: 'back',
  'about-author': 'back',
  'also-by': 'back',
  other: 'back',
};

export const KIND_LABEL: Record<ElementKind, string> = {
  'title-page': 'Title Page',
  copyright: 'Copyright',
  dedication: 'Dedication',
  epigraph: 'Epigraph',
  toc: 'Contents',
  part: 'Part',
  chapter: 'Chapter',
  acknowledgments: 'Acknowledgments',
  'about-author': 'About the Author',
  'also-by': 'Also By',
  other: 'Other',
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
export function docText(doc: Doc): string {
  const out: string[] = [];
  const walk = (blocks: BlockNode[] | undefined) => {
    for (const block of blocks ?? []) {
      if (block.type === 'paragraph' || block.type === 'heading') {
        out.push((block.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join(''));
      } else if (block.type === 'blockquote') {
        walk(block.content);
      }
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
