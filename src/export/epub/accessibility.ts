// EPUB Accessibility metadata (W3C EPUB Accessibility 1.1, which every EPUB
// must carry whether or not the book is otherwise accessible). Recto derives it
// from what the book actually contains, so it stays truthful: images and their
// text alternatives, navigation, and whether the text reflows.

import type { BlockNode, Book } from '../../model/book';

/** European Accessibility Act exemptions an author may declare (W3C a11y:exemption). */
export type Exemption = 'eaa-microenterprise' | 'eaa-disproportionate-burden' | 'eaa-fundamental-alteration';

export const EXEMPTIONS: { id: Exemption; label: string; hint: string }[] = [
  { id: 'eaa-microenterprise', label: 'Microenterprise', hint: 'Fewer than 10 people and under €2 million a year. Most independent authors qualify.' },
  { id: 'eaa-disproportionate-burden', label: 'Disproportionate burden', hint: 'Meeting the requirements would cost more than the publisher can reasonably bear.' },
  { id: 'eaa-fundamental-alteration', label: 'Fundamental alteration', hint: 'Meeting the requirements would fundamentally change the book.' },
];

/** The conformance string for a book the author has checked against WCAG 2.2 AA. */
export const CONFORMANCE = 'EPUB Accessibility 1.1 - WCAG 2.2 Level AA';

export interface AccessibilityFacts {
  /** Images with meaning (the cover and figures). Decorative ornaments don't count. */
  images: number;
  /** Of those, how many have a text description. */
  described: number;
  /** A page list that maps to the print edition's pages is included. */
  pageList: boolean;
}

export interface AccessibilityMetadata {
  accessModes: string[];
  /** Each entry is one set of modes that is enough on its own to read the whole book. */
  sufficient: string[];
  features: string[];
  hazards: string[];
  summary: string;
  exemption?: Exemption;
  conformsTo?: string;
  certifiedBy?: string;
}

function countImages(blocks: BlockNode[] | undefined, facts: AccessibilityFacts): void {
  for (const block of blocks ?? []) {
    if (block.type === 'image') {
      facts.images++;
      if (block.attrs.alt?.trim()) facts.described++;
    } else if ('content' in block && Array.isArray(block.content)) {
      countImages(block.content as BlockNode[], facts);
    }
  }
}

export function accessibilityFacts(book: Book, options: { pageList?: boolean } = {}): AccessibilityFacts {
  const facts: AccessibilityFacts = { images: 0, described: 0, pageList: !!options.pageList };
  // The cover carries the book title as its text alternative.
  if (book.meta.cover) {
    facts.images++;
    facts.described++;
  }
  for (const el of book.elements) countImages(el.content.content, facts);
  return facts;
}

export function accessibilityMetadata(book: Book, facts: AccessibilityFacts): AccessibilityMetadata {
  const a11y = book.meta.accessibility ?? {};
  const allDescribed = facts.described === facts.images;
  const features = ['tableOfContents', 'structuralNavigation', 'readingOrder', 'displayTransformability'];
  if (facts.images && allDescribed) features.push('alternativeText');
  if (facts.pageList) features.push('printPageNumbers', 'pageNavigation');

  const sentences = [
    'This ebook has a table of contents and headings for navigation, and its text is in a logical reading order.',
    'The text reflows, so readers can change the font, size, spacing and colors.',
  ];
  if (facts.images) {
    const missing = facts.images - facts.described;
    sentences.push(
      missing === 0
        ? facts.images === 1 ? 'Its one image has a text description.' : `All ${facts.images} of its images have text descriptions.`
        : `${missing} of its ${facts.images} images ${missing === 1 ? 'has' : 'have'} no text description.`,
    );
  }
  if (facts.pageList) sentences.push('Page numbers match the print edition.');
  sentences.push('It contains no flashing, motion or sound hazards.');
  if (a11y.conformance) sentences.push('It meets the EPUB Accessibility 1.1 requirements at WCAG 2.2 Level AA.');

  return {
    accessModes: facts.images ? ['textual', 'visual'] : ['textual'],
    sufficient: facts.images ? (allDescribed ? ['textual', 'textual,visual'] : ['textual,visual']) : ['textual'],
    features,
    hazards: ['none'],
    summary: sentences.join(' '),
    exemption: a11y.exemption,
    conformsTo: a11y.conformance ? CONFORMANCE : undefined,
    certifiedBy: a11y.conformance ? book.meta.publisher || book.meta.author || undefined : undefined,
  };
}

/** Package-document <meta> lines (schema: and a11y: are reserved prefixes, so no declaration is needed). */
export function accessibilityMetaLines(meta: AccessibilityMetadata, esc: (text: string) => string): string[] {
  const lines = [
    ...meta.accessModes.map((mode) => `<meta property="schema:accessMode">${mode}</meta>`),
    ...meta.sufficient.map((modes) => `<meta property="schema:accessModeSufficient">${modes}</meta>`),
    ...meta.features.map((feature) => `<meta property="schema:accessibilityFeature">${feature}</meta>`),
    ...meta.hazards.map((hazard) => `<meta property="schema:accessibilityHazard">${hazard}</meta>`),
    `<meta property="schema:accessibilitySummary">${esc(meta.summary)}</meta>`,
  ];
  if (meta.conformsTo) {
    lines.push(`<meta property="dcterms:conformsTo" id="conformance">${esc(meta.conformsTo)}</meta>`);
    if (meta.certifiedBy) lines.push(`<meta property="a11y:certifiedBy" refines="#conformance">${esc(meta.certifiedBy)}</meta>`);
  }
  if (meta.exemption) lines.push(`<meta property="a11y:exemption">${meta.exemption}</meta>`);
  return lines;
}

export interface StoreAnswer {
  question: string;
  answer: string;
}

/**
 * The same facts phrased the way store dashboards ask for them. Stores mostly
 * ignore the file's metadata and take answers from a form (KDP's defaults to
 * "I don't know"), so authors paste these in.
 */
export function storeAnswers(meta: AccessibilityMetadata, facts: AccessibilityFacts): StoreAnswer[] {
  const has = (feature: string) => meta.features.includes(feature);
  return [
    { question: 'Can a screen reader read the whole book?', answer: meta.sufficient.includes('textual') ? 'Yes' : 'Mostly: some images have no text description' },
    { question: 'Can readers change the font, size and colors?', answer: has('displayTransformability') ? 'Yes (reflowable text)' : 'No' },
    { question: 'Is there a table of contents?', answer: 'Yes' },
    { question: 'Is there structured navigation (headings)?', answer: 'Yes' },
    {
      question: 'Do images have text descriptions?',
      answer: !facts.images ? 'Not applicable (no images)' : has('alternativeText') ? 'Yes, all of them' : `No: ${facts.images - facts.described} of ${facts.images} are missing`,
    },
    { question: 'Are page numbers from the print edition included?', answer: has('printPageNumbers') ? 'Yes' : 'No' },
    { question: 'Hazards (flashing, motion, sound)', answer: 'None' },
    { question: 'Conformance', answer: meta.conformsTo ?? 'Not claimed' },
    {
      question: 'European Accessibility Act exemption',
      answer: meta.exemption ? EXEMPTIONS.find((e) => e.id === meta.exemption)!.label : 'None declared',
    },
  ];
}
