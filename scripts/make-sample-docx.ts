// Writes the sample novella as a plain Word manuscript (samples/*.docx) and a
// Recto book file (samples/*.recto). The .docx is laid out the way authors
// usually send manuscripts: Heading 1 chapters and "* * *" scene breaks.
//
//   npm run sample:docx

import { mkdirSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import type { BlockNode, InlineNode } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { computeNumbering } from '../src/render/html';
import { serializeBook } from '../src/store/file';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runs(nodes: InlineNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'hardBreak') return '<w:r><w:br/></w:r>';
      const props = (node.marks ?? [])
        .map((m) => ({ italic: '<w:i/>', bold: '<w:b/>', smallCaps: '<w:smallCaps/>', link: '' })[m.type])
        .join('');
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(node.text)}</w:t></w:r>`;
    })
    .join('');
}

function paragraph(content: string, opts: { style?: string; align?: string; indent?: boolean } = {}): string {
  const props =
    (opts.style ? `<w:pStyle w:val="${opts.style}"/>` : '') +
    (opts.indent ? '<w:ind w:left="720"/>' : '') +
    (opts.align ? `<w:jc w:val="${opts.align}"/>` : '');
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${content}</w:p>`;
}

function blocks(nodes: BlockNode[], indent = false): string {
  return nodes
    .map((block) => {
      switch (block.type) {
        case 'paragraph': {
          const align = block.attrs?.textAlign;
          return paragraph(runs(block.content), { indent, align: align === 'center' || align === 'right' ? align : undefined });
        }
        case 'heading':
          return paragraph(runs(block.content), { style: 'Heading2' });
        case 'blockquote':
          return blocks(block.content ?? [], true);
        case 'sceneBreak':
          return paragraph('<w:r><w:t>* * *</w:t></w:r>', { align: 'center' });
        case 'image':
          return '';
      }
    })
    .join('\n');
}

const book = sampleBook();
const numbering = computeNumbering(book);
const body: string[] = [];
for (const el of book.elements) {
  if (el.matter === 'front') continue;
  const n = numbering.get(el.id);
  const heading = n?.chapter
    ? `Chapter ${n.chapter}: ${el.title}`
    : n?.part
      ? `Part ${n.part}: ${el.title}`
      : el.title;
  body.push(paragraph(`<w:r><w:t xml:space="preserve">${xml(heading)}</w:t></w:r>`, { style: 'Heading1' }));
  body.push(blocks(el.content.content));
}

const files: Record<string, string> = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  'word/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/><w:spacing w:before="480" w:after="480"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
</w:styles>`,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
<w:body>
${body.join('\n')}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`,
};

const zip = new JSZip();
const date = new Date('2026-01-01T00:00:00Z');
for (const [path, content] of Object.entries(files)) zip.file(path, content, { date });
mkdirSync('samples', { recursive: true });
writeFileSync('samples/the-lamp-at-harrow-point.docx', await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
writeFileSync('samples/the-lamp-at-harrow-point.recto', serializeBook({ ...book, updatedAt: date.getTime() }));
console.log('wrote samples/the-lamp-at-harrow-point.docx and .recto');
