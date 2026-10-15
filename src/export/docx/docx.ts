// Word (.docx) export: the book as an editable manuscript, for an editor, a
// translator or KDP's Word upload. Each section starts a new Word section
// (chapters on a right-hand page when the book does), notes become real Word
// footnotes, and the trim size, fonts and running heads carry over.

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  type ParagraphChild,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
} from 'docx';
import type { BlockNode, Book, BookElement, InlineNode, TableRowNode } from '../../model/book';
import { editionOf } from '../../model/book';
import { decodeDataUrl } from '../../model/dataUrl';
import { computeNumbering, elementLabel, elementTocText, storeUrl, themeOf } from '../../render/html';
import { bookStrings, languageInfo } from '../../i18n/languages';
import { FONT_FAMILIES } from '../../themes/fonts';
import { imageInfo } from '../../preflight/images';
import { TRIMS, bodySize, pageMargins } from '../print/pageCss';
import { contentsEntries, hasSeveralAuthors, isBoxSet, volumeAuthor } from '../../model/boxset';

const IMAGE_TYPE: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };

interface Context {
  book: Book;
  /** Text width in pixels at 96 per inch, the most an image may take. */
  maxImageWidth: number;
  footnotes: Record<number, { children: Paragraph[] }>;
  nextFootnote: number;
  /** Ordered lists restart numbering, one instance each. */
  nextListInstance: number;
  rtl: boolean;
}

function runs(nodes: InlineNode[] | undefined, ctx: Context, extra: { bold?: boolean; italics?: boolean } = {}): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      out.push(new TextRun({ text: '', break: 1 }));
    } else if (node.type === 'note') {
      const id = ctx.nextFootnote++;
      ctx.footnotes[id] = { children: [new Paragraph({ children: runs(node.attrs.content, ctx) })] };
      out.push(new FootnoteReferenceRun(id));
    } else {
      const marks = new Set((node.marks ?? []).map((m) => m.type));
      const run = new TextRun({
        text: node.text,
        italics: marks.has('italic') || extra.italics,
        bold: marks.has('bold') || extra.bold,
        smallCaps: marks.has('smallCaps'),
        rightToLeft: ctx.rtl,
      });
      const link = node.marks?.find((m) => m.type === 'link')?.attrs?.href;
      out.push(link ? new ExternalHyperlink({ link, children: [new TextRun({ text: node.text, style: 'Hyperlink' })] }) : run);
    }
  }
  return out;
}

const ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED, left: AlignmentType.LEFT } as const;

function image(block: Extract<BlockNode, { type: 'image' }>, ctx: Context): Paragraph[] {
  const decoded = decodeDataUrl(block.attrs.src);
  const info = imageInfo(block.attrs.src);
  const type = decoded && IMAGE_TYPE[decoded.mediaType];
  if (!decoded || !info || !type) return [new Paragraph({ children: [new TextRun({ text: `[Image: ${block.attrs.alt || 'not embedded'}]`, italics: true })] })];
  const scale = Math.min(1, ctx.maxImageWidth / info.width);
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type, data: decoded.bytes, transformation: { width: Math.round(info.width * scale), height: Math.round(info.height * scale) }, altText: { name: 'Image', description: block.attrs.alt ?? '', title: block.attrs.alt ?? '' } })],
    }),
  ];
  if (block.attrs.caption?.trim()) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: block.attrs.caption.trim(), italics: true })] }));
  return out;
}

function table(rows: TableRowNode[], ctx: Context): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, index) =>
        new TableRow({
          tableHeader: index === 0 && !!row.content?.every((cell) => cell.type === 'tableHeader'),
          children: (row.content ?? []).map(
            (cell) =>
              new TableCell({
                columnSpan: cell.attrs?.colspan ?? 1,
                rowSpan: cell.attrs?.rowspan ?? 1,
                children: blocks(cell.content ?? [], ctx, { bold: cell.type === 'tableHeader', plain: true }) as Paragraph[],
              }),
          ),
        }),
    ),
  });
}

function blocks(content: BlockNode[], ctx: Context, opts: { bold?: boolean; plain?: boolean; indent?: number } = {}): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let firstAfterBreak = true;
  const indent = opts.indent ? { left: convertInchesToTwip(opts.indent) } : undefined;
  for (const block of content) {
    switch (block.type) {
      case 'paragraph': {
        const align = block.attrs?.textAlign;
        const plain = !align || align === 'left' || align === 'justify';
        out.push(new Paragraph({
          alignment: align ? ALIGN[align] : undefined,
          indent: { ...indent, firstLine: plain && !firstAfterBreak && !opts.plain ? convertInchesToTwip(0.3) : undefined },
          bidirectional: ctx.rtl,
          children: runs(block.content, ctx, { bold: opts.bold }),
        }));
        firstAfterBreak = false;
        break;
      }
      case 'heading':
        out.push(new Paragraph({ heading: block.attrs?.level === 3 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_2, children: runs(block.content, ctx) }));
        firstAfterBreak = true;
        break;
      case 'blockquote':
        out.push(...blocks(block.content ?? [], ctx, { ...opts, plain: true, indent: (opts.indent ?? 0) + 0.4 }));
        break;
      case 'sceneBreak':
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun('* * *')] }));
        firstAfterBreak = true;
        break;
      case 'image':
        out.push(...image(block, ctx));
        break;
      case 'bulletList':
      case 'orderedList': {
        const instance = ctx.nextListInstance++;
        for (const item of block.content ?? []) {
          for (const p of item.content ?? []) {
            if (p.type !== 'paragraph') {
              out.push(...blocks([p], ctx, opts));
              continue;
            }
            out.push(new Paragraph({
              numbering: { reference: block.type === 'bulletList' ? 'bullets' : 'numbers', level: 0, instance },
              children: runs(p.content, ctx),
            }));
          }
        }
        break;
      }
      case 'verse':
        for (const stanza of block.content ?? []) {
          if (stanza.type === 'paragraph') out.push(new Paragraph({ indent: { left: convertInchesToTwip(0.4) }, spacing: { after: 160 }, children: runs(stanza.content, ctx) }));
        }
        break;
      case 'callout':
        // Word has no aside: a bordered, shaded run of paragraphs reads as one.
        for (const p of block.content ?? []) {
          if (p.type !== 'paragraph') {
            out.push(...blocks([p], ctx, { ...opts, plain: true }));
            continue;
          }
          out.push(new Paragraph({
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: '000000', space: 8 } },
            shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
            indent: { left: convertInchesToTwip(0.15) },
            children: runs(p.content, ctx),
          }));
        }
        break;
      case 'table':
        out.push(table(block.content ?? [], ctx));
        break;
      case 'textMessage': {
        const sent = block.attrs?.side === 'sent';
        const sender = block.attrs?.sender?.trim();
        out.push(new Paragraph({
          alignment: sent ? AlignmentType.RIGHT : AlignmentType.LEFT,
          indent: sent ? { left: convertInchesToTwip(1.2) } : { right: convertInchesToTwip(1.2) },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 }, left: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 4 }, right: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 4 } },
          spacing: { after: 120 },
          children: [...(sender ? [new TextRun({ text: sender, bold: true, size: 16 }), new TextRun({ text: '', break: 1 })] : []), ...runs(block.content, ctx)],
        }));
        break;
      }
      case 'storeLinks': {
        const url = storeUrl(block.attrs.links ?? {});
        const label = block.attrs.label?.trim() || 'Buy now';
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [url ? new ExternalHyperlink({ link: url, children: [new TextRun({ text: label, style: 'Hyperlink' })] }) : new TextRun(label)],
        }));
        break;
      }
    }
  }
  return out;
}

function heading(el: BookElement, book: Book, numbering: ReturnType<typeof computeNumbering>): Paragraph[] {
  const theme = themeOf(book);
  const lang = book.meta.language;
  const label = elementLabel(numbering.get(el.id), theme, lang);
  const title = el.title.trim();
  if (el.kind === 'chapter' || el.kind === 'part') {
    const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 480 }, children: [new TextRun(label && title ? elementTocText(el, numbering.get(el.id), theme, lang) : label || title || 'Untitled')] })];
    if (el.subtitle?.trim()) out.push(new Paragraph({ style: 'Subtitle', alignment: AlignmentType.CENTER, children: [new TextRun({ text: el.subtitle.trim(), italics: true })] }));
    return out;
  }
  if (el.kind === 'volume') {
    const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: 2400, after: 240 }, children: [new TextRun(label && title ? elementTocText(el, numbering.get(el.id), theme, lang) : label || title || 'Untitled')] })];
    if (el.subtitle?.trim()) out.push(new Paragraph({ style: 'Subtitle', alignment: AlignmentType.CENTER, children: [new TextRun({ text: el.subtitle.trim(), italics: true })] }));
    if (hasSeveralAuthors(book)) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 480, after: 720 }, children: [new TextRun({ text: volumeAuthor(book, el), size: 26 })] }));
    return out;
  }
  if (['copyright', 'dedication', 'epigraph'].includes(el.kind)) return [];
  return [new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 480 }, children: [new TextRun(title || 'Untitled')] })];
}

function titlePage(book: Book): Paragraph[] {
  const { meta } = book;
  const out = [new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { before: 2400 }, children: [new TextRun(meta.title || 'Untitled')] })];
  if (meta.subtitle) out.push(new Paragraph({ style: 'Subtitle', alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.subtitle, italics: true })] }));
  if (meta.author) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 720 }, children: [new TextRun({ text: meta.author, size: 28 })] }));
  if (meta.publisher) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1440 }, children: [new TextRun({ text: meta.publisher, smallCaps: true })] }));
  return out;
}

function contents(book: Book, numbering: ReturnType<typeof computeNumbering>): Paragraph[] {
  const theme = themeOf(book);
  const boxSet = isBoxSet(book);
  return contentsEntries(book)
    .map((e) => {
      // Box sets: volumes at the margin, their parts a step in, chapters two.
      const depth = e.matter !== 'body' || e.kind === 'volume' ? 0 : (boxSet ? 1 : 0) + (e.kind === 'part' ? 0 : 1);
      return new Paragraph({ indent: depth ? { left: convertInchesToTwip(0.25 * depth) } : undefined, children: [new TextRun({ text: elementTocText(e, numbering.get(e.id), theme, book.meta.language), bold: e.kind === 'volume' })] });
    });
}

/** Builds the .docx file. */
export async function buildDocx(source: Book): Promise<Uint8Array> {
  const book = editionOf(source, 'print');
  const theme = themeOf(book);
  const trim = TRIMS[book.style.trim];
  const margins = pageMargins(trim, 200);
  const rtl = languageInfo(book.meta.language).dir === 'rtl';
  const ctx: Context = { book, maxImageWidth: Math.round((trim.width - margins.inside - margins.outside) * 96), footnotes: {}, nextFootnote: 1, nextListInstance: 1, rtl };
  const numbering = computeNumbering(book);
  const page = {
    size: { width: convertInchesToTwip(trim.width), height: convertInchesToTwip(trim.height) },
    margin: { top: convertInchesToTwip(margins.top), bottom: convertInchesToTwip(margins.bottom), left: convertInchesToTwip(margins.inside), right: convertInchesToTwip(margins.outside) },
  };
  const runningHead = (text: string) => new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, size: 16, smallCaps: true })] })] });
  const folio = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })] })] });

  const sections = book.elements.map((el) => {
    const body = el.kind === 'title-page' ? titlePage(book) : el.kind === 'toc' ? [new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun(el.title.trim() || bookStrings(book.meta.language).contents)] }), ...contents(book, numbering)] : [...heading(el, book, numbering), ...blocks(el.content.content, ctx)];
    const chapterLike = el.matter !== 'front';
    return {
      properties: {
        page,
        type: chapterLike && book.style.startOnRecto ? SectionType.ODD_PAGE : SectionType.NEXT_PAGE,
        titlePage: chapterLike,
      },
      headers: chapterLike ? { default: runningHead(book.meta.title), even: runningHead(book.meta.author || book.meta.title) } : undefined,
      footers: chapterLike ? { default: folio, even: folio } : undefined,
      children: body.length ? body : [new Paragraph('')],
    };
  });

  const body = FONT_FAMILIES[theme.fonts.body];
  const head = FONT_FAMILIES[theme.fonts.heading];
  const doc = new Document({
    creator: 'Recto',
    title: book.meta.title,
    subject: book.meta.subtitle,
    description: book.meta.description,
    evenAndOddHeaderAndFooters: true,
    footnotes: ctx.footnotes,
    numbering: {
      config: [
        { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
        { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
      ],
    },
    styles: {
      default: {
        document: { run: { font: body, size: Math.round(bodySize(book) * 2) }, paragraph: { spacing: { line: 336 } } },
        heading1: { run: { font: head, size: Math.round(bodySize(book) * 3.2) } },
        heading2: { run: { font: head, size: Math.round(bodySize(book) * 2.4), bold: true }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading3: { run: { font: head, size: Math.round(bodySize(book) * 2.1), italics: true } },
        title: { run: { font: head, size: Math.round(bodySize(book) * 5) } },
      },
    },
    sections,
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
