// Test books shared by the EPUB and print checks.

import { readFileSync } from 'node:fs';
import type { BlockNode, Book, InlineNode } from '../src/model/book';
import { sampleBook } from '../src/model/sample';
import { newBoxSet } from '../src/model/boxset';

export const iconPng = `data:image/png;base64,${readFileSync('build/icon.png').toString('base64')}`;

const t = (text: string): InlineNode => ({ type: 'text', text });
const p = (...content: InlineNode[]): BlockNode => ({ type: 'paragraph', content });

/** The sample book with every kind of block, two notes and a heading image in Chapter Two. */
export function richBook(): Book {
  const book = sampleBook();
  const chapter = book.elements.filter((el) => el.kind === 'chapter' && el.numbered !== false)[1];
  chapter.headingImage = iconPng;
  chapter.content.content.splice(
    2,
    0,
    p(
      t('The ledger recorded the wind'),
      { type: 'note', attrs: { content: [t('In knots, from 1931 on, in the first keeper’s hand.')] } },
      t(' every evening, and the fog'),
      { type: 'note', attrs: { content: [t('Measured by how many of the harbor lights could be seen.')] } },
      t(' twice.'),
    ),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Oil'))] }, { type: 'listItem', content: [p(t('Wick'))] }] },
    { type: 'orderedList', attrs: { start: 2 }, content: [{ type: 'listItem', content: [p(t('Second'))] }] },
    { type: 'verse', content: [p(t('The lamp is lit,'), { type: 'hardBreak' }, t('the fog comes in,'), { type: 'hardBreak' }, t('and nobody asks it to.'))] },
    { type: 'callout', attrs: { tone: 'tip' }, content: [p(t('Trim the wick before dark. Check the oil at midnight.'))] },
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [p(t('Date'))] }, { type: 'tableHeader', content: [p(t('Wind'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [p(t('Oct. 12'))] }, { type: 'tableCell', content: [p(t('NNE, moderate'))] }] },
      ],
    },
    { type: 'textMessage', attrs: { side: 'received', sender: 'Bea' }, content: [t('Fog by six.')] },
    { type: 'textMessage', attrs: { side: 'sent' }, content: [t('Lamp’s lit.')] },
    { type: 'storeLinks', attrs: { label: 'Read book two', links: { universal: 'https://books2read.com/example' } } },
    { type: 'image', attrs: { src: iconPng, alt: 'The Recto mark', layout: 'bleed', caption: null } },
    { type: 'image', attrs: { src: iconPng, alt: 'The Recto mark across two pages', layout: 'spread', caption: null } },
  );
  return book;
}

/** A box set of two books by different authors, gathered the way the app's "New box set" does it. */
export function boxSetBook(): Book {
  const first = sampleBook();
  const second = sampleBook();
  second.meta = { ...second.meta, title: 'The Second Lamp', subtitle: '', author: 'Ada Wren' };
  const book = newBoxSet([first, second]);
  book.meta = { ...book.meta, title: 'The Harrow Point Collection', subtitle: 'Two Novels' };
  return book;
}
