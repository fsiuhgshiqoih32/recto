import { describe, expect, it } from 'vitest';
import { sampleBook } from '../../src/model/sample';
import { paragraphs } from '../../src/model/book';
import { createElement } from '../../src/model/defaults';
import { checkBook } from '../../src/preflight/checks';
import { editDistance, nameVariants } from '../../src/preflight/names';

function bookWith(...texts: string[]) {
  const book = sampleBook();
  book.elements.push(createElement('chapter', book.meta, { title: 'Extra', content: paragraphs(...texts) }));
  return book;
}

describe('name consistency', () => {
  it('measures edits, counting a swapped pair as one', () => {
    expect(editDistance('josiah', 'josias')).toBe(1);
    expect(editDistance('josiah', 'jsoiah')).toBe(1);
    expect(editDistance('harrow', 'harow')).toBe(1);
    expect(editDistance('harrowpoint', 'harowpont')).toBe(2);
    expect(editDistance('ada', 'beatrice')).toBe(3);
  });

  it('flags a rare spelling one letter away from a name used often', () => {
    const book = bookWith(
      'Then Josiah Pell rang the bell, and Josiah climbed the stair.',
      'Later that night, Josiah wrote in the ledger. Bea watched Josiah sleep.',
      'In the morning Josias was gone, and so was the lamp.',
    );
    const variants = nameVariants(book);
    expect(variants).toEqual([expect.objectContaining({ name: 'Josiah', count: 7, variant: 'Josias', variantCount: 1 })]);
    const finding = checkBook(book).find((f) => f.title.includes('Josias'));
    expect(finding).toMatchObject({ area: 'text', severity: 'info', title: '“Josias” (once) or “Josiah” (7 times)?', elementId: book.elements[book.elements.length - 1].id });
  });

  it('leaves alone possessives, ordinary words, and names that are simply different', () => {
    const book = bookWith(
      'She met Anna, and Anna met Hanna. Anna laughed; Anna’s coat was red.',
      'When the fog came, Bea said Then. Then nothing. They went home with Anna.',
      'Mark and Mary walked; Mark and Mary talked; Mark and Mary slept.',
    );
    const names = nameVariants(book).map((v) => v.variant);
    expect(names).not.toContain('Anna’s');
    expect(names).not.toContain('Then');
    expect(names).not.toContain('Mary');
  });

  it('stays quiet for the sample book and for scripts without capitals', () => {
    expect(nameVariants(sampleBook())).toEqual([]);
    const book = bookWith('東京で太郎は本を読んだ。太郎は本を読んだ。太郎は本を読んだ。');
    book.meta.language = 'ja';
    expect(nameVariants(book)).toEqual([]);
  });
});
