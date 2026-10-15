// Builds sample EPUBs (plain, with cover, figures and embedded fonts, and in
// right-to-left and CJK languages) and validates them with epubcheck-ts.
// Fails on any error or warning. In CI the same files also go through the
// official Java EPUBCheck and DAISY Ace (see .github/workflows/ci.yml).
//
//   npm run test:epub

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EpubCheck } from '@likecoin/epubcheck-ts';
import { writeEpub } from '../cli/epub';
import type { Book } from '../src/model/book';
import { boxSetBook, richBook } from './fixtures';
import { paragraphs } from '../src/model/book';
import { createElement, newBook } from '../src/model/defaults';
import { sampleBook } from '../src/model/sample';

const png = `data:image/png;base64,${readFileSync('build/icon.png').toString('base64')}`;

function illustrated(): Book {
  const book = sampleBook();
  book.meta.cover = png;
  book.style.embedFonts = true;
  book.meta.isbnEbook = '978-1-23456-789-7';
  book.meta.accessibility = { exemption: 'eaa-microenterprise' };
  const chapter = book.elements.find((el) => el.kind === 'chapter')!;
  chapter.content.content.push({ type: 'image', attrs: { src: png, alt: 'The Recto mark: an open book with a red right-hand page' } });
  return book;
}

function inLanguage(language: string, text: string): Book {
  const book = newBook({ language, title: 'Harrow Point', author: 'Mara Quill' });
  book.style.embedFonts = true;
  book.elements.splice(3, 1, createElement('chapter', book.meta, { title: '', content: paragraphs(text, text) }));
  return book;
}

/** The print edition's page numbers, laid out with paged.js and marked in the ebook (needs a browser). */
function withPageNumbers(): Book {
  const book = richBook();
  book.style.printPageNumbers = true;
  book.meta.isbnPrint = '978-1-23456-789-7';
  return book;
}

/** Japanese set vertically, with upright numbers. */
function vertical(book: Book): Book {
  book.style.verticalText = true;
  return book;
}

/** Every kind of block and a note, so their markup is validated too. */
function rich(): Book {
  const book = richBook();
  book.meta.cover = png;
  book.style.embedFonts = true;
  return book;
}

const books: [string, Book][] = [
  ['sample', sampleBook()],
  ['illustrated', illustrated()],
  ['rich', rich()],
  ['box-set', boxSetBook()],
  ['page-numbers', withPageNumbers()],
  ['arabic', inLanguage('ar', 'كانت منارة هارو بوينت تضاء كل مساء في الخامسة والربع، وكانت آدا تكتب في الدفتر الأخضر الريح والضباب.')],
  ['japanese', inLanguage('ja', 'ハロウ岬の灯台は毎夕五時十五分に灯り、エイダは緑の帳簿に風と霧のことを書き留めた。')],
  ['japanese-vertical', vertical(inLanguage('ja', 'ハロウ岬の灯台は毎夕5時15分に灯り、エイダは緑の帳簿に風と霧のことを書き留めた。'))],
];

mkdirSync('out', { recursive: true });
let failed = 0;
for (const [name, book] of books) {
  const path = join('out', `epub-${name}.epub`);
  const size = await writeEpub(book, path);
  const result = await EpubCheck.validate(new Uint8Array(readFileSync(path)));
  const problems = result.messages.filter((m) => m.severity === 'fatal' || m.severity === 'error' || m.severity === 'warning');
  console.log(`${problems.length ? 'FAIL' : '  ok'} ${path} (${(size / 1024).toFixed(0)} KB): ${result.errorCount + result.fatalCount} errors, ${result.warningCount} warnings`);
  for (const m of problems) console.log(`       ${m.severity} ${m.id}: ${m.message}${m.location ? ` (${m.location.path}${m.location.line ? `:${m.location.line}` : ''})` : ''}`);
  if (problems.length) failed++;
}
if (failed) {
  console.error(`\n${failed} EPUB(s) failed validation`);
  process.exit(1);
}
console.log('\nall EPUBs passed epubcheck-ts');
