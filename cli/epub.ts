// Headless EPUB export.
//
//   npm run epub -- path/to/book.recto [-o out.epub] [--page-numbers]
//   npm run epub -- --sample [-o out.epub]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Book } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { buildEpub } from '../src/export/epub/package';
import { fileNameFor, parseBook } from '../src/store/file';
import { packageOf } from '../src/themes/fonts';
import { printPageStarts } from './pdf';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads a font file straight from its @fontsource package. */
export async function loadFontFile(file: string): Promise<Uint8Array> {
  const pkg = packageOf(file);
  if (!pkg) throw new Error(`Unknown font file ${file}`);
  return new Uint8Array(readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file)));
}

/** Writes the EPUB. With print page numbers on, the print edition is laid out first to find its pages. */
export async function writeEpub(book: Book, outPath: string): Promise<number> {
  const pageStarts = book.style.printPageNumbers ? await printPageStarts(book) : undefined;
  const bytes = await buildEpub(book, { loadFont: loadFontFile, pageStarts });
  writeFileSync(outPath, bytes);
  return bytes.length;
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('-o');
  const out = outIndex >= 0 ? args.splice(outIndex, 2)[1] : undefined;
  const input = args.find((a) => !a.startsWith('-'));
  if (!input && !args.includes('--sample')) {
    console.error('usage: npm run epub -- <book.recto> [-o out.epub] [--page-numbers]   |   npm run epub -- --sample');
    process.exit(1);
  }
  const book = input ? parseBook(readFileSync(input, 'utf8')) : sampleBook();
  if (args.includes('--page-numbers')) book.style.printPageNumbers = true;
  const outPath = resolve(out ?? fileNameFor(book, 'epub'));
  const size = await writeEpub(book, outPath);
  console.log(`${outPath}: ${(size / 1024).toFixed(0)} KB`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
