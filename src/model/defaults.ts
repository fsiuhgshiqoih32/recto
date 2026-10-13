import { type BookStrings, bookStrings, languageInfo } from '../i18n/languages';
import {
  type Book,
  type BookElement,
  type BookMeta,
  type Doc,
  type ElementKind,
  KIND_LABEL,
  MATTER_OF,
  emptyDoc,
  newId,
  paragraphs,
} from './book';

const TITLE_KEY: Partial<Record<ElementKind, keyof BookStrings>> = {
  'title-page': 'titlePage',
  copyright: 'copyright',
  dedication: 'dedication',
  epigraph: 'epigraph',
  toc: 'contents',
  acknowledgments: 'acknowledgments',
  'about-author': 'aboutAuthor',
  'also-by': 'alsoBy',
};

/** The default title of an element in a language ("Contents", "Índice", "目录"). */
export function defaultTitle(kind: ElementKind, lang = 'en'): string {
  if (kind === 'chapter' || kind === 'part') return '';
  const key = TITLE_KEY[kind];
  return key ? bookStrings(lang)[key] : KIND_LABEL[kind];
}

export function copyrightDoc(meta: BookMeta): Doc {
  const year = meta.copyrightYear || String(new Date().getFullYear());
  const lang = meta.language || 'en';
  const strings = bookStrings(lang);
  const english = lang.toLowerCase().startsWith('en') || !languageInfo(lang).strings;
  const lines = english
    ? [
        `Copyright © ${year} by ${meta.author || 'the Author'}`,
        'All rights reserved.',
        'No part of this book may be reproduced in any form or by any electronic or mechanical means, including information storage and retrieval systems, without written permission from the author, except for the use of brief quotations in a book review.',
        'This is a work of fiction. Names, characters, places, and incidents are products of the author’s imagination or are used fictitiously.',
      ]
    : [`© ${year} ${meta.author}`.trim(), strings.allRightsReserved];
  if (meta.isbnEbook) lines.push(english ? `Ebook ISBN: ${meta.isbnEbook}` : `ISBN ${meta.isbnEbook} (${strings.ebook})`);
  if (meta.isbnPrint) lines.push(english ? `Paperback ISBN: ${meta.isbnPrint}` : `ISBN ${meta.isbnPrint} (${strings.paperback})`);
  return paragraphs(...lines);
}

export function createElement(kind: ElementKind, meta?: BookMeta, overrides: Partial<BookElement> = {}): BookElement {
  const matter = MATTER_OF[kind];
  return {
    id: newId(),
    kind,
    matter,
    title: defaultTitle(kind, meta?.language),
    numbered: kind === 'chapter' || kind === 'part' ? true : undefined,
    includeInToc: matter !== 'front',
    content: kind === 'copyright' && meta ? copyrightDoc(meta) : emptyDoc(),
    ...overrides,
  };
}

export function defaultMeta(): BookMeta {
  return {
    title: 'Untitled',
    subtitle: '',
    author: '',
    publisher: '',
    language: 'en',
    isbnEbook: '',
    isbnPrint: '',
    copyrightYear: String(new Date().getFullYear()),
    description: '',
  };
}

export function newBook(meta: Partial<BookMeta> = {}): Book {
  const fullMeta = { ...defaultMeta(), ...meta };
  return {
    id: newId(),
    version: 1,
    meta: fullMeta,
    style: {
      theme: 'octavo',
      trim: '5.5x8.5',
      rectoHeader: 'title',
      startOnRecto: true,
      dropCaps: true,
      embedFonts: false,
    },
    elements: [
      createElement('title-page', fullMeta),
      createElement('copyright', fullMeta),
      createElement('toc', fullMeta),
      createElement('chapter', fullMeta),
      createElement('about-author', fullMeta),
    ],
    updatedAt: Date.now(),
  };
}
