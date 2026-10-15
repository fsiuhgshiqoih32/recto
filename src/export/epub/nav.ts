import { esc, escAttr } from '../../render/html';
import { pageListNav } from './pageList';

export interface TocEntry {
  text: string;
  href: string;
  kind: string;
  children: TocEntry[];
}

/**
 * Nests chapters under the part that precedes them, and parts and chapters
 * under the volume that precedes them (box sets); back matter ends both.
 */
export function buildTocTree(items: { text: string; href: string; kind: string; matter: string }[]): TocEntry[] {
  const roots: TocEntry[] = [];
  let volume: TocEntry | null = null;
  let part: TocEntry | null = null;
  for (const item of items) {
    const entry: TocEntry = { text: item.text, href: item.href, kind: item.kind, children: [] };
    if (item.kind === 'volume') {
      volume = entry;
      part = null;
      roots.push(entry);
    } else if (item.kind === 'part') {
      part = entry;
      (volume ? volume.children : roots).push(entry);
    } else if ((part || volume) && item.matter === 'body') {
      (part ?? volume)!.children.push(entry);
    } else {
      volume = null;
      part = null;
      roots.push(entry);
    }
  }
  return roots;
}

function navList(entries: TocEntry[], indent = ''): string {
  return (
    `${indent}<ol>\n` +
    entries
      .map(
        (e) =>
          `${indent}  <li><a href="${escAttr(e.href)}">${esc(e.text)}</a>` +
          (e.children.length ? `\n${navList(e.children, `${indent}    `)}${indent}  ` : '') +
          `</li>\n`,
      )
      .join('') +
    `${indent}</ol>\n`
  );
}

export interface Landmark {
  type: 'cover' | 'toc' | 'bodymatter';
  href: string;
  text: string;
}

export function navDocument(opts: {
  title: string;
  lang: string;
  dir: 'ltr' | 'rtl';
  heading: string;
  toc: TocEntry[];
  landmarks: Landmark[];
  /** The print edition's pages, when the ebook carries its page numbers. */
  pageList?: { label: string; href: string }[];
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escAttr(opts.lang)}" lang="${escAttr(opts.lang)}"${opts.dir === 'rtl' ? ' dir="rtl"' : ''}>
<head>
<meta charset="UTF-8"/>
<title>${esc(opts.title)}</title>
<link rel="stylesheet" type="text/css" href="styles/book.css"/>
</head>
<body>
<nav epub:type="toc" id="toc" role="doc-toc">
<h1>${esc(opts.heading)}</h1>
${navList(opts.toc)}</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
<h2>Landmarks</h2>
<ol>
${opts.landmarks.map((l) => `  <li><a epub:type="${l.type}" href="${escAttr(l.href)}">${esc(l.text)}</a></li>`).join('\n')}
</ol>
</nav>
${opts.pageList?.length ? pageListNav(opts.pageList, 'Pages') : ''}</body>
</html>
`;
}
