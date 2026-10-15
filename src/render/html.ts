// The one render pipeline: Book → semantic, well-formed XHTML fragments.
// The EPUB exporter, the print exporter and the live previews all use it,
// so the ebook and the paperback can never drift apart.

import { chapterLabel, partLabel } from '../i18n/labels';
import { bookStrings, isBicameral, languageInfo } from '../i18n/languages';
import type { BlockNode, Book, BookElement, ElementKind, InlineNode, Mark } from '../model/book';
import type { Theme } from '../themes';
import { THEMES } from '../themes';
import type { OrnamentId } from '../themes/ornaments';

export type Target = 'epub' | 'print' | 'preview';

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
}

export interface Numbering {
  chapter?: number;
  part?: number;
}

const EPUB_TYPE: Partial<Record<ElementKind, string>> = {
  'title-page': 'titlepage',
  copyright: 'copyright-page',
  dedication: 'dedication',
  epigraph: 'epigraph',
  toc: 'toc',
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

/** Chapter and part numbers, counting only numbered elements, in book order. */
export function computeNumbering(book: Book): Map<string, Numbering> {
  const map = new Map<string, Numbering>();
  let chapter = 0;
  let part = 0;
  for (const el of book.elements) {
    if (el.kind === 'chapter' && el.numbered !== false) map.set(el.id, { chapter: ++chapter });
    else if (el.kind === 'part' && el.numbered !== false) map.set(el.id, { part: ++part });
    else map.set(el.id, {});
  }
  return map;
}

/** "Chapter One", "Capítulo 1", "第一章": the label for a numbered chapter or part, in the book's language. */
export function elementLabel(num: Numbering | undefined, theme: Theme, lang = 'en'): string {
  if (num?.chapter) return chapterLabel(theme.chapterLabel, lang, num.chapter);
  if (num?.part) return partLabel(theme.partLabel, lang, num.part);
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

export function renderInline(nodes: InlineNode[] | undefined, hyphenate?: (text: string) => string, links = true): string {
  return (nodes ?? [])
    .map((node) => (node.type === 'hardBreak' ? '<br/>' : wrapMarks(esc(hyphenate ? hyphenate(node.text) : node.text), node.marks, links)))
    .join('');
}

/** Wraps the first letter (with any opening quote) in a drop cap and the next words in a lead-in span. */
export function renderOpener(nodes: InlineNode[], dropCap: boolean, hyphenate?: (text: string) => string, links = true): string {
  const [first, ...rest] = nodes;
  if (!first || first.type !== 'text') return renderInline(nodes, hyphenate, links);
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
  return html + renderInline(rest, hyphenate, links);
}

function hasText(nodes: InlineNode[] | undefined): nodes is InlineNode[] {
  return !!nodes?.some((n) => n.type === 'text' && n.text.trim());
}

interface BlockOptions {
  /** Treat the first paragraph as a chapter opener (drop cap and lead-in). */
  opener: boolean;
}

export function renderBlocks(blocks: BlockNode[], ctx: RenderContext, opts: BlockOptions): string {
  // Drop caps and small-caps lead-ins belong to cased, left-to-right scripts;
  // splitting off a letter would break Arabic joining and means nothing in CJK.
  const cased = isBicameral(languageInfo(ctx.book.meta.language).script);
  const dropCap = cased && ctx.book.style.dropCaps && ctx.theme.dropCap;
  const { hyphenate } = ctx;
  const links = ctx.links !== false;
  const opener = (content: InlineNode[], withDropCap: boolean) =>
    cased ? renderOpener(content, withDropCap, hyphenate, links) : renderInline(content, hyphenate, links);
  let html = '';
  let index = 0;
  let afterBreak = false;
  for (const block of blocks) {
    const isFirst = index === 0;
    index++;
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
          html += `<p class="opener">${opener(block.content, dropCap)}</p>\n`;
        } else if (afterBreak && plain) {
          html += `<p class="first">${opener(block.content, false)}</p>\n`;
        } else {
          // Centered and right-aligned lines (attributions, verse) stay unhyphenated.
          html += `<p${alignClass ? ` class="${alignClass}"` : ''}>${renderInline(block.content, plain ? ctx.hyphenate : undefined, links)}</p>\n`;
        }
        afterBreak = false;
        break;
      }
      case 'heading': {
        const level = Math.min(Math.max(block.attrs?.level ?? 2, 2), 3);
        html += `<h${level}>${renderInline(block.content, undefined, links)}</h${level}>\n`;
        afterBreak = true;
        break;
      }
      case 'blockquote':
        html += `<blockquote>\n${renderBlocks(block.content ?? [], ctx, { opener: false })}</blockquote>\n`;
        afterBreak = false;
        break;
      case 'sceneBreak':
        html += `<div class="scene-break" role="separator">${ctx.ornament(ctx.theme.ornament)}</div>\n`;
        afterBreak = true;
        break;
      case 'image': {
        const src = ctx.imageSrc ? ctx.imageSrc(block.attrs.src) : block.attrs.src;
        html += `<img class="figure" src="${escAttr(src)}" alt="${escAttr(block.attrs.alt ?? '')}"/>\n`;
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

function body(el: BookElement, ctx: RenderContext, opener: boolean): string {
  const inner = renderBlocks(el.content.content, ctx, { opener });
  return inner.trim() ? `<div class="body">\n${inner}</div>\n` : '';
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
    (ctx.theme.headingOrnament === 'above' ? orn : '') +
    `<h1 class="chapter-heading${title ? '' : ' label-only'}">${heading}</h1>\n` +
    (el.subtitle?.trim() ? `<p class="chapter-subtitle">${esc(el.subtitle.trim())}</p>\n` : '') +
    (ctx.theme.headingOrnament === 'below' ? orn : '') +
    `</header>\n` +
    body(el, ctx, true) +
    `</section>\n`
  );
}

function renderPart(el: BookElement, num: Numbering | undefined, ctx: RenderContext): string {
  const label = elementLabel(num, ctx.theme, ctx.book.meta.language);
  const title = el.title.trim();
  return (
    sectionOpen(el) +
    `<header class="part-head">\n<h1 class="part-heading">` +
    (label ? `<span class="part-label">${esc(label)}</span>` : '') +
    (title ? `<span class="part-title">${esc(title)}</span>` : '') +
    `</h1>\n${headOrnament(ctx)}</header>\n` +
    body(el, ctx, false) +
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
  const items = ctx.book.elements
    .filter((e) => e.includeInToc && e.kind !== 'toc' && e.kind !== 'title-page')
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
      return `<li class="toc-${e.kind}">${entry}</li>`;
    })
    .join('\n');
  return (
    sectionOpen(el) +
    `<header class="matter-head"><h1 class="matter-heading">${esc(el.title.trim() || bookStrings(ctx.book.meta.language).contents)}</h1></header>\n` +
    `<ol class="toc-list">\n${items}\n</ol>\n</section>\n`
  );
}

function renderMatter(el: BookElement, ctx: RenderContext): string {
  // Copyright, dedication and epigraph pages carry no visible heading.
  const headless = el.kind === 'copyright' || el.kind === 'dedication' || el.kind === 'epigraph';
  const heading = headless
    ? ''
    : `<header class="matter-head"><h1 class="matter-heading running">${esc(el.title.trim() || 'Untitled')}</h1></header>\n`;
  return sectionOpen(el) + heading + body(el, ctx, !headless && el.matter === 'back') + `</section>\n`;
}

export function renderElement(el: BookElement, ctx: RenderContext, numbering = computeNumbering(ctx.book)): string {
  switch (el.kind) {
    case 'chapter':
      return renderChapter(el, numbering.get(el.id), ctx);
    case 'part':
      return renderPart(el, numbering.get(el.id), ctx);
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

export function renderBook(ctx: RenderContext): RenderedElement[] {
  const numbering = computeNumbering(ctx.book);
  return ctx.book.elements.map((element) => ({
    element,
    html: renderElement(element, ctx, numbering),
    tocText: elementTocText(element, numbering.get(element.id), ctx.theme, ctx.book.meta.language),
  }));
}

export function themeOf(book: Book): Theme {
  return THEMES[book.style.theme] ?? THEMES.octavo;
}
