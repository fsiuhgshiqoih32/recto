// The one render pipeline: Book → semantic, well-formed XHTML fragments.
// The EPUB exporter, the print exporter and the live previews all use it,
// so the ebook and the paperback can never drift apart.

import { chapterLabel, partLabel, volumeLabel } from '../i18n/labels';
import { contentsEntries, elementsInVolumes, hasSeveralAuthors, volumeAuthor } from '../model/boxset';
import { bookStrings, isBicameral, languageInfo } from '../i18n/languages';
import type { BlockNode, Book, BookElement, ElementKind, InlineNode, ListItemNode, Mark, Store, TableRowNode } from '../model/book';
import type { Theme } from '../themes';
import { THEMES } from '../themes';
import { hasNode } from '../model/book';
import type { OrnamentId } from '../themes/ornaments';
import { customTheme } from '../themes/custom';

export type Target = 'epub' | 'print' | 'preview';

/** Where notes go in print. Ebooks always use pop-up footnotes. */
export type NotePlacement = 'chapter' | 'book' | 'page';

export interface RenderContext {
  book: Book;
  theme: Theme;
  target: Target;
  /** Link target for an element: an EPUB file name or an in-document anchor. */
  hrefFor: (el: BookElement) => string;
  /** Markup for an ornament: inline <svg> for print and preview, an <img> for EPUB. */
  ornament: (id: OrnamentId) => string;
  /** Maps an image src (often a data: URL) to the src to emit. */
  imageSrc?: (src: string) => string;
  /** Inserts soft hyphens into body text (print only; ebook readers hyphenate themselves). */
  hyphenate?: (text: string) => string;
  /**
   * Emit hyperlinks (default true). Print PDFs leave them out: KDP asks for
   * files without link annotations, and paper can't be clicked anyway.
   */
  links?: boolean;
  /** The store an ebook edition is for: store-link blocks point there. */
  store?: Store;
  /** Collects notes for a book-end Notes section (print, notes placed at the end of the book). */
  bookNotes?: BookNotes;
}

export interface Numbering {
  chapter?: number;
  part?: number;
  volume?: number;
}

const EPUB_TYPE: Partial<Record<ElementKind, string>> = {
  'title-page': 'titlepage',
  copyright: 'copyright-page',
  dedication: 'dedication',
  epigraph: 'epigraph',
  toc: 'toc',
  volume: 'volume',
  part: 'part',
  chapter: 'chapter',
  acknowledgments: 'acknowledgments',
};

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escAttr(text: string): string {
  return esc(text).replace(/"/g, '&quot;');
}

export function anchorId(el: BookElement): string {
  return `el-${el.id}`;
}

/** Chapter and part numbers, counting only numbered elements, in book order. Each volume of a box set starts again from one. */
export function computeNumbering(book: Book): Map<string, Numbering> {
  const map = new Map<string, Numbering>();
  let chapter = 0;
  let part = 0;
  let volume = 0;
  for (const el of book.elements) {
    if (el.kind === 'volume') {
      chapter = 0;
      part = 0;
      map.set(el.id, el.numbered !== false ? { volume: ++volume } : {});
    } else if (el.kind === 'chapter' && el.numbered !== false) map.set(el.id, { chapter: ++chapter });
    else if (el.kind === 'part' && el.numbered !== false) map.set(el.id, { part: ++part });
    else map.set(el.id, {});
  }
  return map;
}

/** "Chapter One", "Capítulo 1", "第一章": the label for a numbered chapter or part, in the book's language. */
export function elementLabel(num: Numbering | undefined, theme: Theme, lang = 'en'): string {
  if (num?.chapter) return chapterLabel(theme.chapterLabel, lang, num.chapter);
  if (num?.part) return partLabel(theme.partLabel, lang, num.part);
  if (num?.volume) return volumeLabel(theme.partLabel, lang, num.volume);
  return '';
}

/** "Chapter One: The Lamp", "Prologue", "Acknowledgments", used by navigation docs. */
export function elementTocText(el: BookElement, num: Numbering | undefined, theme: Theme, lang = 'en'): string {
  const label = elementLabel(num, theme, lang);
  const title = el.title.trim();
  const { script } = languageInfo(lang);
  const separator = script === 'han-simplified' || script === 'han-traditional' || script === 'japanese' || script === 'korean' ? '　' : ': ';
  if (label && title) return `${label}${separator}${title}`;
  return label || title || 'Untitled';
}

// ---------- Notes ----------

/** The notes met while rendering one element, numbered from 1. */
export interface ElementNotes {
  element: BookElement;
  items: { n: number; html: string }[];
}

export interface BookNotes {
  groups: { heading: string; notes: ElementNotes }[];
}

export function notePlacement(book: Book): NotePlacement {
  return book.style.notes ?? 'chapter';
}

/** Whether any element carries a note (decides whether print adds a Notes section). */
export function hasNotes(book: Book): boolean {
  return hasNode(book, 'note');
}

const NOTES_ID = 'notes';

/** The Notes section print adds at the start of the back matter when notes go at the end of the book. */
function notesElement(book: Book): BookElement {
  return {
    id: NOTES_ID,
    kind: 'other',
    matter: 'back',
    title: bookStrings(book.meta.language).notes,
    includeInToc: true,
    content: { type: 'doc', content: [] },
  };
}

// ---------- Inline content ----------

interface InlineOptions {
  hyphenate?: (text: string) => string;
  links: boolean;
  target: Target;
  placement: NotePlacement;
  /** Collects notes for the element being rendered; without it, notes are left out. */
  notes?: ElementNotes;
}

function wrapMarks(html: string, marks: Mark[] | undefined, links = true): string {
  if (!marks?.length) return html;
  const order: Mark['type'][] = ['smallCaps', 'italic', 'bold', 'link'];
  let out = html;
  for (const type of order) {
    const mark = marks.find((m) => m.type === type);
    if (!mark) continue;
    if (type === 'italic') out = `<em>${out}</em>`;
    else if (type === 'bold') out = `<strong>${out}</strong>`;
    else if (type === 'smallCaps') out = `<span class="sc">${out}</span>`;
    else if (type === 'link' && mark.attrs?.href) out = links ? `<a href="${escAttr(mark.attrs.href)}">${out}</a>` : `<span class="link">${out}</span>`;
  }
  return out;
}

const noteId = (el: BookElement, n: number) => `note-${el.id}-${n}`;
const noteRefId = (el: BookElement, n: number) => `nref-${el.id}-${n}`;

function noteReference(node: Extract<InlineNode, { type: 'note' }>, opts: InlineOptions): string {
  const notes = opts.notes;
  if (!notes) return '';
  const html = inline(node.attrs.content, { ...opts, hyphenate: undefined, notes: undefined });
  const n = notes.items.length + 1;
  notes.items.push({ n, html });
  if (opts.target === 'print' && opts.placement === 'page') {
    // paged.js moves the note to the foot of the page. Recto numbers it: paged.js's
    // own footnote counters repeat numbers (pagedjs #59), and its call is a link.
    return `<sup class="noteref">${n}</sup><span class="footnote"><span class="note-num">${n}.</span> ${html}</span>`;
  }
  if (opts.target === 'print') return `<sup class="noteref">${n}</sup>`;
  return `<sup><a class="noteref" epub:type="noteref" role="doc-noteref" id="${noteRefId(notes.element, n)}" href="#${noteId(notes.element, n)}">${n}</a></sup>`;
}

function inline(nodes: InlineNode[] | undefined, opts: InlineOptions): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'hardBreak') return '<br/>';
      if (node.type === 'note') return noteReference(node, opts);
      return wrapMarks(esc(opts.hyphenate ? opts.hyphenate(node.text) : node.text), node.marks, opts.links);
    })
    .join('');
}

const PLAIN: Omit<InlineOptions, 'hyphenate' | 'links'> = { target: 'epub', placement: 'chapter' };

export function renderInline(nodes: InlineNode[] | undefined, hyphenate?: (text: string) => string, links = true): string {
  return inline(nodes, { ...PLAIN, hyphenate, links });
}

function opener(nodes: InlineNode[], dropCap: boolean, opts: InlineOptions): string {
  const [first, ...rest] = nodes;
  if (!first || first.type !== 'text') return inline(nodes, opts);
  const { hyphenate, links } = opts;
  let text = first.text;
  let html = '';
  if (dropCap) {
    const m = /^(["“‘'«]?)\s?([\p{L}\p{N}])/u.exec(text);
    if (m) {
      // An opening quote rides along with the letter, set smaller so it doesn't outweigh it.
      const quote = m[1] ? `<span class="dq">${esc(m[1])}</span>` : '';
      html += wrapMarks(`<span class="dropcap">${quote}${esc(m[2])}</span>`, first.marks, links);
      text = text.slice(m[0].length);
    }
  }
  // Lead-in: the rest of the first word plus up to two more.
  const lead = (dropCap && html ? /^\S*(?:\s+\S+){0,2}/ : /^\S+(?:\s+\S+){0,2}/).exec(text)?.[0] ?? '';
  if (lead) html += wrapMarks(`<span class="lead">${esc(lead)}</span>`, first.marks, links);
  const remaining = text.slice(lead.length);
  if (remaining) html += wrapMarks(esc(hyphenate ? hyphenate(remaining) : remaining), first.marks, links);
  return html + inline(rest, opts);
}

/** Wraps the first letter (with any opening quote) in a drop cap and the next words in a lead-in span. */
export function renderOpener(nodes: InlineNode[], dropCap: boolean, hyphenate?: (text: string) => string, links = true): string {
  return opener(nodes, dropCap, { ...PLAIN, hyphenate, links });
}

function hasText(nodes: InlineNode[] | undefined): nodes is InlineNode[] {
  return !!nodes?.some((n) => (n.type === 'text' && n.text.trim()) || n.type === 'note');
}

// ---------- Blocks ----------

interface BlockOptions {
  /** Treat the first paragraph as a chapter opener (drop cap and lead-in). */
  opener: boolean;
  /** Notes collected for the element being rendered. */
  notes?: ElementNotes;
}

const STORE_ORDER: Store[] = ['universal', 'amazon', 'apple', 'kobo', 'google', 'nook'];

/** The URL a store-link block uses in an edition: the store's own, else the universal one. */
export function storeUrl(links: Partial<Record<Store, string>>, store?: Store): string | undefined {
  const pick = (s: Store) => links[s]?.trim() || undefined;
  if (store) return pick(store) ?? pick('universal');
  return STORE_ORDER.map(pick).find(Boolean);
}

function renderImage(block: Extract<BlockNode, { type: 'image' }>, ctx: RenderContext, opts: InlineOptions): string {
  const src = ctx.imageSrc ? ctx.imageSrc(block.attrs.src) : block.attrs.src;
  const img = `<img class="figure" src="${escAttr(src)}" alt="${escAttr(block.attrs.alt ?? '')}"/>`;
  const caption = block.attrs.caption?.trim() ? `<figcaption>${inline([{ type: 'text', text: block.attrs.caption.trim() }], { ...opts, notes: undefined })}</figcaption>` : '';
  const layout = block.attrs.layout ?? 'inline';
  if (ctx.target === 'print' && layout !== 'inline') {
    if (layout === 'page') return `<figure class="figure-page">${img}${caption}</figure>\n`;
    if (layout === 'spread' && languageInfo(ctx.book.meta.language).dir === 'ltr') {
      // One image across two facing pages: the left half, then the right.
      return `<div class="figure-spread figure-spread-left">${img}</div>\n<div class="figure-spread figure-spread-right">${img}</div>\n`;
    }
    return `<div class="figure-bleed">${img}</div>\n`;
  }
  const cls = layout === 'inline' ? 'figure-block' : 'figure-block figure-full';
  return caption || layout !== 'inline' ? `<figure class="${cls}">${img}${caption}</figure>\n` : `${img}\n`;
}

function renderTable(rows: TableRowNode[], ctx: RenderContext, notes: ElementNotes | undefined): string {
  const head = rows[0]?.content?.length && rows[0].content.every((cell) => cell.type === 'tableHeader') ? rows[0] : null;
  const row = (r: TableRowNode) =>
    `<tr>${(r.content ?? [])
      .map((cell) => {
        const tag = cell.type === 'tableHeader' ? 'th' : 'td';
        const span = `${(cell.attrs?.colspan ?? 1) > 1 ? ` colspan="${cell.attrs!.colspan}"` : ''}${(cell.attrs?.rowspan ?? 1) > 1 ? ` rowspan="${cell.attrs!.rowspan}"` : ''}`;
        const scope = tag === 'th' ? (head && r === head ? ' scope="col"' : ' scope="row"') : '';
        return `<${tag}${span}${scope}>${renderBlocks(cell.content ?? [], ctx, { opener: false, notes })}</${tag}>`;
      })
      .join('')}</tr>`;
  const body = (head ? rows.slice(1) : rows).map(row).join('\n');
  return `<table class="table">\n${head ? `<thead>${row(head)}</thead>\n` : ''}<tbody>\n${body}\n</tbody>\n</table>\n`;
}

function renderList(items: ListItemNode[], ctx: RenderContext, notes: ElementNotes | undefined): string {
  return items.map((item) => `<li>${renderBlocks(item.content ?? [], ctx, { opener: false, notes })}</li>`).join('\n');
}

export function renderBlocks(blocks: BlockNode[], ctx: RenderContext, opts: BlockOptions): string {
  // Drop caps and small-caps lead-ins belong to cased, left-to-right scripts;
  // splitting off a letter would break Arabic joining and means nothing in CJK.
  const cased = isBicameral(languageInfo(ctx.book.meta.language).script);
  const dropCap = cased && ctx.book.style.dropCaps && ctx.theme.dropCap;
  const io: InlineOptions = {
    hyphenate: ctx.hyphenate,
    links: ctx.links !== false,
    target: ctx.target,
    placement: notePlacement(ctx.book),
    notes: opts.notes,
  };
  const plainIo = { ...io, hyphenate: undefined };
  const lead = (content: InlineNode[], withDropCap: boolean) => (cased ? opener(content, withDropCap, io) : inline(content, io));
  let html = '';
  let afterBreak = false;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const isFirst = index === 0;
    switch (block.type) {
      case 'paragraph': {
        const align = block.attrs?.textAlign;
        const alignClass = align && align !== 'left' ? `align-${align}` : '';
        if (!hasText(block.content)) {
          html += '<p class="empty">&#160;</p>\n';
          break;
        }
        const plain = !alignClass || align === 'justify';
        if (opts.opener && isFirst && plain) {
          html += `<p class="opener">${lead(block.content, dropCap)}</p>\n`;
        } else if (afterBreak && plain) {
          html += `<p class="first">${lead(block.content, false)}</p>\n`;
        } else {
          // Centered and right-aligned lines (attributions) stay unhyphenated.
          html += `<p${alignClass ? ` class="${alignClass}"` : ''}>${inline(block.content, plain ? io : plainIo)}</p>\n`;
        }
        afterBreak = false;
        break;
      }
      case 'heading': {
        const level = Math.min(Math.max(block.attrs?.level ?? 2, 2), 3);
        html += `<h${level}>${inline(block.content, plainIo)}</h${level}>\n`;
        afterBreak = true;
        break;
      }
      case 'blockquote':
        html += `<blockquote>\n${renderBlocks(block.content ?? [], ctx, { opener: false, notes: opts.notes })}</blockquote>\n`;
        afterBreak = false;
        break;
      case 'sceneBreak':
        html += `<div class="scene-break" role="separator">${ctx.ornament(ctx.theme.ornament)}</div>\n`;
        afterBreak = true;
        break;
      case 'image':
        html += renderImage(block, ctx, io);
        afterBreak = false;
        break;
      case 'bulletList':
        html += `<ul>\n${renderList(block.content ?? [], ctx, opts.notes)}\n</ul>\n`;
        afterBreak = false;
        break;
      case 'orderedList': {
        const start = block.attrs?.start ?? 1;
        html += `<ol${start !== 1 ? ` start="${start}"` : ''}>\n${renderList(block.content ?? [], ctx, opts.notes)}\n</ol>\n`;
        afterBreak = false;
        break;
      }
      case 'verse': {
        // Each line is its own block so long lines wrap with a hanging indent.
        const stanzas = (block.content ?? []).map((stanza) => {
          if (stanza.type !== 'paragraph') return renderBlocks([stanza], ctx, { opener: false, notes: opts.notes });
          const lines: InlineNode[][] = [[]];
          for (const node of stanza.content ?? []) {
            if (node.type === 'hardBreak') lines.push([]);
            else lines[lines.length - 1].push(node);
          }
          return `<p class="stanza">${lines.map((line) => `<span class="line">${inline(line, plainIo) || '&#160;'}</span>`).join('')}</p>`;
        });
        html += `<div class="verse">\n${stanzas.join('\n')}\n</div>\n`;
        afterBreak = false;
        break;
      }
      case 'callout': {
        const tone = block.attrs?.tone ?? 'note';
        html += `<aside class="callout callout-${tone}" role="note">\n${renderBlocks(block.content ?? [], ctx, { opener: false, notes: opts.notes })}</aside>\n`;
        afterBreak = false;
        break;
      }
      case 'table':
        html += renderTable(block.content ?? [], ctx, opts.notes);
        afterBreak = false;
        break;
      case 'textMessage': {
        // A run of messages is one conversation.
        let thread = '';
        let i = index;
        for (; i < blocks.length && blocks[i].type === 'textMessage'; i++) {
          const message = blocks[i] as Extract<BlockNode, { type: 'textMessage' }>;
          const side = message.attrs?.side === 'sent' ? 'sent' : 'received';
          const sender = message.attrs?.sender?.trim();
          thread += `<p class="message message-${side}">${sender ? `<span class="sender">${esc(sender)}</span>` : ''}${inline(message.content, plainIo)}</p>\n`;
        }
        index = i - 1;
        html += `<div class="messages">\n${thread}</div>\n`;
        afterBreak = false;
        break;
      }
      case 'storeLinks': {
        const label = block.attrs.label?.trim() || 'Buy now';
        const url = storeUrl(block.attrs.links ?? {}, ctx.store);
        if (ctx.target === 'print') {
          // Paper can't click: print the universal link, if there is one, as text.
          const shown = block.attrs.links?.universal?.trim().replace(/^https?:\/\//, '');
          html += `<p class="store-link">${esc(label)}${shown ? ` <span class="store-url">${esc(shown)}</span>` : ''}</p>\n`;
        } else {
          html += `<p class="store-link">${url && io.links ? `<a href="${escAttr(url)}">${esc(label)}</a>` : esc(label)}</p>\n`;
        }
        afterBreak = false;
        break;
      }
    }
  }
  return html;
}

function headOrnament(ctx: RenderContext): string {
  return ctx.theme.headingOrnament ? `<div class="head-orn" aria-hidden="true">${ctx.ornament(ctx.theme.ornament)}</div>` : '';
}

/** DPUB-ARIA roles matching the epub:type semantics, for assistive technology. */
const DOC_ROLE: Partial<Record<ElementKind, string>> = {
  dedication: 'doc-dedication',
  epigraph: 'doc-epigraph',
  toc: 'doc-toc',
  volume: 'doc-part',
  part: 'doc-part',
  chapter: 'doc-chapter',
  acknowledgments: 'doc-acknowledgments',
};

function sectionOpen(el: BookElement, extraClass = ''): string {
  const type = EPUB_TYPE[el.kind];
  const role = DOC_ROLE[el.kind];
  return (
    `<section class="el ${el.kind}${extraClass ? ` ${extraClass}` : ''}" id="${anchorId(el)}" data-matter="${el.matter}"` +
    `${type ? ` epub:type="${type}"` : ''}${role ? ` role="${role}"` : ''}>\n`
  );
}

/** The notes at the end of an element: pop-up footnotes in ebooks, a short list in print. */
function notesBlock(notes: ElementNotes, ctx: RenderContext, heading: string): string {
  if (!notes.items.length) return '';
  if (ctx.target !== 'print') {
    return notes.items
      .map(
        (note) =>
          `<aside class="footnote" epub:type="footnote" role="doc-footnote" id="${noteId(notes.element, note.n)}">` +
          `<p><a class="note-back" href="#${noteRefId(notes.element, note.n)}" role="doc-backlink">${note.n}.</a> ${note.html}</p></aside>\n`,
      )
      .join('');
  }
  // Back matter follows the book-end Notes section, so its notes stay with it.
  if (notePlacement(ctx.book) === 'chapter' || (notePlacement(ctx.book) === 'book' && notes.element.matter === 'back')) {
    return `<section class="chapter-notes">\n<h2 class="notes-heading">${esc(heading)}</h2>\n<ol class="notes-list">\n${notes.items.map((note) => `<li value="${note.n}">${note.html}</li>`).join('\n')}\n</ol>\n</section>\n`;
  }
  return '';
}

function body(el: BookElement, ctx: RenderContext, isOpener: boolean, notes: ElementNotes): string {
  const inner = renderBlocks(el.content.content, ctx, { opener: isOpener, notes });
  return inner.trim() ? `<div class="body">\n${inner}</div>\n` : '';
}

/** Body, then the element's notes; a book-end Notes section gathers print notes under the element's name. */
function bodyWithNotes(el: BookElement, ctx: RenderContext, isOpener: boolean, groupHeading: string): string {
  const notes: ElementNotes = { element: el, items: [] };
  const html = body(el, ctx, isOpener, notes);
  if (ctx.bookNotes && ctx.target === 'print' && notePlacement(ctx.book) === 'book' && el.matter !== 'back' && notes.items.length) {
    ctx.bookNotes.groups.push({ heading: groupHeading, notes });
  }
  return html + notesBlock(notes, ctx, bookStrings(ctx.book.meta.language).notes);
}

function headingImage(el: BookElement, ctx: RenderContext): string {
  if (!el.headingImage) return '';
  const src = ctx.imageSrc ? ctx.imageSrc(el.headingImage) : el.headingImage;
  return `<div class="heading-image"><img src="${escAttr(src)}" alt=""/></div>\n`;
}

function renderChapter(el: BookElement, num: Numbering | undefined, ctx: RenderContext): string {
  const label = elementLabel(num, ctx.theme, ctx.book.meta.language);
  const title = el.title.trim();
  const orn = headOrnament(ctx);
  let heading = '';
  if (label) heading += `<span class="chapter-label${title ? '' : ' running'}">${esc(label)}</span>`;
  if (title) heading += `<span class="chapter-title running">${esc(title)}</span>`;
  if (!heading) heading = `<span class="chapter-title running">Untitled</span>`;
  return (
    sectionOpen(el) +
    `<header class="chapter-head">\n` +
    headingImage(el, ctx) +
    (ctx.theme.headingOrnament === 'above' ? orn : '') +
    `<h1 class="chapter-heading${title ? '' : ' label-only'}">${heading}</h1>\n` +
    (el.subtitle?.trim() ? `<p class="chapter-subtitle">${esc(el.subtitle.trim())}</p>\n` : '') +
    (ctx.theme.headingOrnament === 'below' ? orn : '') +
    `</header>\n` +
    bodyWithNotes(el, ctx, true, elementTocText(el, num, ctx.theme, ctx.book.meta.language)) +
    `</section>\n`
  );
}

function renderPart(el: BookElement, num: Numbering | undefined, ctx: RenderContext): string {
  const label = elementLabel(num, ctx.theme, ctx.book.meta.language);
  const title = el.title.trim();
  return (
    sectionOpen(el) +
    `<header class="part-head">\n` +
    headingImage(el, ctx) +
    `<h1 class="part-heading">` +
    (label ? `<span class="part-label">${esc(label)}</span>` : '') +
    (title ? `<span class="part-title">${esc(title)}</span>` : '') +
    `</h1>\n${headOrnament(ctx)}</header>\n` +
    bodyWithNotes(el, ctx, false, elementTocText(el, num, ctx.theme, ctx.book.meta.language)) +
    `</section>\n`
  );
}

/**
 * A volume's opening page in a box set: "Book One", its title, subtitle and,
 * when the volumes are by different authors, its author. Volumes share the
 * part page's styles; print running heads pick up the title and author.
 */
function renderVolume(el: BookElement, num: Numbering | undefined, ctx: RenderContext): string {
  const label = elementLabel(num, ctx.theme, ctx.book.meta.language);
  const title = el.title.trim() || (label ? '' : 'Untitled');
  const byline = hasSeveralAuthors(ctx.book) ? volumeAuthor(ctx.book, el) : '';
  return (
    sectionOpen(el) +
    `<header class="part-head volume-head">\n` +
    headingImage(el, ctx) +
    `<h1 class="part-heading">` +
    (label ? `<span class="part-label">${esc(label)}</span>` : '') +
    (title ? `<span class="part-title volume-title">${esc(title)}</span>` : '') +
    `</h1>\n` +
    (el.subtitle?.trim() ? `<p class="volume-subtitle">${esc(el.subtitle.trim())}</p>\n` : '') +
    (byline ? `<p class="volume-author">${esc(byline)}</p>\n` : '') +
    `${headOrnament(ctx)}</header>\n` +
    bodyWithNotes(el, ctx, false, elementTocText(el, num, ctx.theme, ctx.book.meta.language)) +
    `</section>\n`
  );
}

function renderTitlePage(el: BookElement, ctx: RenderContext): string {
  const { meta } = ctx.book;
  return (
    sectionOpen(el) +
    `<h1 class="book-title">${esc(meta.title || 'Untitled')}</h1>\n` +
    (meta.subtitle ? `<p class="book-subtitle">${esc(meta.subtitle)}</p>\n` : '') +
    headOrnament(ctx) +
    (meta.author ? `<p class="book-author">${esc(meta.author)}</p>\n` : '') +
    (meta.publisher ? `<p class="book-publisher">${esc(meta.publisher)}</p>\n` : '') +
    `</section>\n`
  );
}

function renderToc(el: BookElement, numbering: Map<string, Numbering>, ctx: RenderContext): string {
  const nested = elementsInVolumes(ctx.book);
  const items = contentsEntries(ctx.book)
    .map((e) => {
      const label = elementLabel(numbering.get(e.id), ctx.theme, ctx.book.meta.language);
      const title = e.title.trim();
      const text =
        (label ? `<span class="toc-label">${esc(label)}</span>` : '') +
        (title ? `<span class="toc-title">${esc(title)}</span>` : '') ||
        `<span class="toc-title">Untitled</span>`;
      // Print reads the page number off a data attribute (target-counter), so the PDF needs no link.
      const entry =
        ctx.links === false
          ? `<span class="toc-entry" data-target="${escAttr(ctx.hrefFor(e))}">${text}</span>`
          : `<a class="toc-entry" href="${escAttr(ctx.hrefFor(e))}">${text}</a>`;
      return `<li class="toc-${e.kind}${nested.has(e.id) ? ' toc-nested' : ''}">${entry}</li>`;
    })
    .join('\n');
  return (
    sectionOpen(el) +
    `<header class="matter-head"><h1 class="matter-heading">${esc(el.title.trim() || bookStrings(ctx.book.meta.language).contents)}</h1></header>\n` +
    `<ol class="toc-list">\n${items}\n</ol>\n</section>\n`
  );
}

/** The book-end Notes section: every chapter's notes under the chapter's name. */
function renderBookNotes(el: BookElement, ctx: RenderContext): string {
  const groups = (ctx.bookNotes?.groups ?? [])
    .map(
      ({ heading, notes }) =>
        `<h2 class="notes-group">${esc(heading)}</h2>\n<ol class="notes-list">\n${notes.items.map((note) => `<li value="${note.n}">${note.html}</li>`).join('\n')}\n</ol>\n`,
    )
    .join('');
  return (
    `<section class="el other book-notes" id="${anchorId(el)}" data-matter="back" epub:type="endnotes" role="doc-endnotes">\n` +
    `<header class="matter-head"><h1 class="matter-heading running">${esc(el.title)}</h1></header>\n` +
    `<div class="body">\n${groups}</div>\n</section>\n`
  );
}

function renderMatter(el: BookElement, ctx: RenderContext): string {
  // Copyright, dedication and epigraph pages carry no visible heading.
  const headless = el.kind === 'copyright' || el.kind === 'dedication' || el.kind === 'epigraph';
  const heading = headless
    ? ''
    : `<header class="matter-head"><h1 class="matter-heading running">${esc(el.title.trim() || 'Untitled')}</h1></header>\n`;
  return sectionOpen(el) + heading + bodyWithNotes(el, ctx, !headless && el.matter === 'back', el.title.trim()) + `</section>\n`;
}

export function renderElement(el: BookElement, ctx: RenderContext, numbering = computeNumbering(ctx.book)): string {
  if (el.id === NOTES_ID && ctx.bookNotes) return renderBookNotes(el, ctx);
  switch (el.kind) {
    case 'chapter':
      return renderChapter(el, numbering.get(el.id), ctx);
    case 'part':
      return renderPart(el, numbering.get(el.id), ctx);
    case 'volume':
      return renderVolume(el, numbering.get(el.id), ctx);
    case 'title-page':
      return renderTitlePage(el, ctx);
    case 'toc':
      return renderToc(el, numbering, ctx);
    default:
      return renderMatter(el, ctx);
  }
}

export interface RenderedElement {
  element: BookElement;
  html: string;
  tocText: string;
}

/**
 * Renders every element. With print notes at the end of the book, a Notes
 * section joins the back matter (and the contents); the body elements before
 * it fill it as they render.
 */
export function renderBook(ctx: RenderContext): RenderedElement[] {
  let run = ctx;
  if (ctx.target === 'print' && notePlacement(ctx.book) === 'book' && hasNotes(ctx.book)) {
    const elements = [...ctx.book.elements];
    const firstBack = elements.findIndex((el) => el.matter === 'back');
    elements.splice(firstBack < 0 ? elements.length : firstBack, 0, notesElement(ctx.book));
    run = { ...ctx, book: { ...ctx.book, elements }, bookNotes: { groups: [] } };
  }
  const numbering = computeNumbering(run.book);
  return run.book.elements.map((element) => ({
    element,
    html: renderElement(element, run, numbering),
    tocText: elementTocText(element, numbering.get(element.id), run.theme, run.book.meta.language),
  }));
}

/** The book's style, with any changes the author made to it. */
export function themeOf(book: Book): Theme {
  const base = THEMES[book.style.theme] ?? THEMES.octavo;
  return book.style.custom ? customTheme(base, book.style.custom) : base;
}
