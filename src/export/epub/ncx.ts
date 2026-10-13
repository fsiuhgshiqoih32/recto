// toc.ncx: the EPUB 2 table of contents, kept for older readers.
import { esc, escAttr } from '../../render/html';
import type { TocEntry } from './nav';

export function ncxDocument(opts: { uid: string; title: string; toc: TocEntry[] }): string {
  let order = 0;
  let depth = 1;
  const points = (entries: TocEntry[], level: number, indent: string): string =>
    entries
      .map((e) => {
        depth = Math.max(depth, level);
        const n = ++order;
        return (
          `${indent}<navPoint id="np-${n}" playOrder="${n}">\n` +
          `${indent}  <navLabel><text>${esc(e.text)}</text></navLabel>\n` +
          `${indent}  <content src="${escAttr(e.href)}"/>\n` +
          points(e.children, level + 1, `${indent}  `) +
          `${indent}</navPoint>\n`
        );
      })
      .join('');
  const navMap = points(opts.toc, 1, '    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escAttr(opts.uid)}"/>
    <meta name="dtb:depth" content="${depth}"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${esc(opts.title)}</text></docTitle>
  <navMap>
${navMap}  </navMap>
</ncx>
`;
}
