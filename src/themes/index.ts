import type { ThemeId } from '../model/book';
import { isBicameral, isCjk, languageInfo } from '../i18n/languages';
import type { LabelStyle } from '../i18n/labels';
import { type BookFontId, fontStack } from './fonts';
import type { OrnamentId } from './ornaments';

export interface Theme {
  id: ThemeId;
  name: string;
  blurb: string;
  fonts: { body: BookFontId; heading: BookFontId };
  /** How chapters are labeled ("Chapter One", "1", …), in the book's language. */
  chapterLabel: LabelStyle;
  partLabel: LabelStyle;
  ornament: OrnamentId;
  /** Where (if anywhere) the ornament repeats around chapter headings. */
  headingOrnament?: 'above' | 'below';
  /** Whether the theme draws drop caps (the book can still turn them off). */
  dropCap: boolean;
  /** CSS shared by the ebook and print outputs. Uses the classes emitted by render/html.ts. */
  css: string;
  /** Running-head styling for print margin boxes. */
  runningHead: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  octavo: {
    id: 'octavo',
    name: 'Octavo',
    blurb: 'Classic literary. Garamond, letterspaced chapter labels, italic titles, drop caps.',
    fonts: { body: 'eb-garamond', heading: 'eb-garamond' },
    chapterLabel: 'label-words',
    partLabel: 'label-words',
    ornament: 'diamonds',
    headingOrnament: 'below',
    dropCap: true,
    runningHead: 'font-size: 0.72em; letter-spacing: 0.2em; text-transform: uppercase;',
    css: `
.chapter-head { text-align: center; }
.chapter-label { font-size: 0.8em; letter-spacing: 0.28em; text-transform: uppercase; }
.chapter-title { font-size: 1.75em; font-style: italic; margin-top: 0.35em; }
.label-only .chapter-label { font-size: 1.1em; }
.dropcap { font-size: 5.1em; }
.lead { font-variant: small-caps; letter-spacing: 0.04em; }
.part-label { letter-spacing: 0.3em; text-transform: uppercase; font-size: 0.85em; }
.part-title { font-size: 2em; font-style: italic; }
.book-title { font-size: 2.5em; font-weight: 400; }
.book-author { letter-spacing: 0.2em; text-transform: uppercase; }
.matter-heading { font-size: 0.95em; letter-spacing: 0.28em; text-transform: uppercase; font-weight: 400; text-align: center; }
`,
  },
  ledger: {
    id: 'ledger',
    name: 'Ledger',
    blurb: 'Modern and plain. Big numerals, a hairline rule, no drop caps.',
    fonts: { body: 'source-serif-4', heading: 'source-serif-4' },
    chapterLabel: 'number',
    partLabel: 'label-number',
    ornament: 'rule',
    dropCap: false,
    runningHead: 'font-size: 0.7em; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600;',
    css: `
.chapter-head { text-align: start; border-top: 1px solid currentColor; padding-top: 0.7em; }
.chapter-label { font-size: 3.2em; font-weight: 600; line-height: 1; }
.chapter-title { font-size: 0.95em; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; margin-top: 0.9em; }
.chapter-subtitle { text-align: start; }
.lead { font-weight: 600; }
.part-head { text-align: start; border-top: 1px solid currentColor; padding-top: 0.7em; }
.part-label { font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.85em; }
.part-title { font-size: 2.2em; font-weight: 600; }
.book-title { font-size: 2.3em; font-weight: 600; text-align: start; }
.title-page { text-align: start; }
.matter-heading { font-size: 1.6em; font-weight: 600; text-align: start; border-top: 1px solid currentColor; padding-top: 0.5em; }
`,
  },
  marginalia: {
    id: 'marginalia',
    name: 'Marginalia',
    blurb: 'Romantic and airy. Cormorant headings, a calligraphic flourish, tall drop caps.',
    fonts: { body: 'crimson-pro', heading: 'cormorant-garamond' },
    chapterLabel: 'label-words',
    partLabel: 'label-words',
    ornament: 'flourish',
    headingOrnament: 'below',
    dropCap: true,
    runningHead: 'font-size: 0.8em; font-style: italic;',
    css: `
.chapter-head { text-align: center; }
.chapter-label { font-size: 1em; font-style: italic; }
.chapter-title { font-size: 2.1em; font-weight: 600; margin-top: 0.2em; line-height: 1.1; }
.label-only .chapter-label { font-size: 1.9em; font-style: normal; font-weight: 600; }
.chapter-subtitle { font-style: italic; }
.head-orn svg, .head-orn img { width: 5em; }
.dropcap { font-weight: 600; font-size: 5.15em; line-height: 0.78; }
.lead { font-variant: small-caps; }
.part-label { font-style: italic; font-size: 1.1em; }
.part-title { font-size: 2.4em; font-weight: 600; }
.book-title { font-size: 2.8em; font-weight: 600; }
.book-author { font-style: italic; font-size: 1.2em; }
.matter-heading { font-size: 1.8em; font-weight: 600; text-align: center; }
`,
  },
  broadsheet: {
    id: 'broadsheet',
    name: 'Broadsheet',
    blurb: 'Bold and urgent, for thrillers. Heavy uppercase titles, square scene breaks.',
    fonts: { body: 'libre-baskerville', heading: 'libre-baskerville' },
    chapterLabel: 'label-number',
    partLabel: 'label-number',
    ornament: 'squares',
    dropCap: false,
    runningHead: 'font-size: 0.65em; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;',
    css: `
.el { font-size: 0.92em; }
.chapter-head { text-align: start; }
.chapter-label { font-size: 0.8em; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
.chapter-title { font-size: 1.9em; font-weight: 700; text-transform: uppercase; line-height: 1.1; margin-top: 0.3em; }
.label-only .chapter-label { font-size: 2.2em; letter-spacing: 0.05em; }
.chapter-subtitle { text-align: start; }
.lead { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85em; }
.part-head { text-align: start; }
.part-label { font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.85em; }
.part-title { font-size: 2.4em; font-weight: 700; text-transform: uppercase; }
.book-title { font-size: 2.3em; font-weight: 700; text-transform: uppercase; }
.book-author { font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; }
.matter-heading { font-size: 1.3em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; text-align: start; }
`,
  },
  almanac: {
    id: 'almanac',
    name: 'Almanac',
    blurb: 'Warm and storybook-like, for fantasy and cozy reads. Asterisms, italic titles.',
    fonts: { body: 'lora', heading: 'lora' },
    chapterLabel: 'words',
    partLabel: 'label-words',
    ornament: 'asterism',
    headingOrnament: 'above',
    dropCap: true,
    runningHead: 'font-size: 0.75em; font-style: italic;',
    css: `
.chapter-head { text-align: center; }
.head-orn { margin-bottom: 0.8em; }
.head-orn svg, .head-orn img { width: 1.8em; }
.chapter-label { font-size: 0.9em; letter-spacing: 0.22em; text-transform: uppercase; }
.chapter-title { font-size: 1.7em; font-style: italic; margin-top: 0.3em; }
.label-only .chapter-label { font-size: 1.5em; letter-spacing: 0.12em; }
.scene-break svg, .scene-break img { width: 1.6em; }
.dropcap { font-weight: 600; font-size: 5.1em; line-height: 0.76; }
.lead { font-variant: small-caps; letter-spacing: 0.05em; }
.part-label { letter-spacing: 0.25em; text-transform: uppercase; font-size: 0.85em; }
.part-title { font-size: 2.2em; font-style: italic; }
.book-title { font-size: 2.6em; font-style: italic; font-weight: 400; }
.matter-heading { font-size: 1.5em; font-style: italic; font-weight: 400; text-align: center; }
`,
  },
};

export const THEME_LIST: Theme[] = Object.values(THEMES);

/**
 * Typography rules for the book's script, applied after the theme so they win:
 * no letterspacing outside cased scripts (it breaks Arabic joining and looks
 * wrong in CJK and Indic text), no synthesized italics where fonts have none,
 * and CJK's full-width paragraph indents.
 */
export function languageCss(lang: string): string {
  const { script } = languageInfo(lang);
  // Scripts outside Recto's table ('other': Tamil, Bengali, Syriac, N'Ko…) get the
  // safe rules too. Letterspacing breaks joining and conjuncts in many of them.
  if (isBicameral(script)) return '';
  const rules = [
    '.el, .el * { letter-spacing: 0 !important; }',
    '.lead { font-variant: normal !important; text-transform: none !important; font-weight: inherit !important; font-size: inherit !important; }',
    '.chapter-label, .chapter-title, .part-label, .part-title, .book-title, .book-subtitle, .book-author, .chapter-subtitle, .matter-heading, h3 { font-style: normal !important; }',
    '.el p { hyphens: manual; -webkit-hyphens: manual; }',
  ];
  if (isCjk(script)) {
    const mark = script === 'japanese' ? 'filled sesame' : 'filled dot';
    rules.push(
      '.el { line-height: 1.8; }',
      '.el p, .el p.opener, .el p.first { text-indent: 2em; }',
      '.el p.align-center, .el p.align-right, .el blockquote p, .el.title-page p, .el.dedication p, .el.epigraph p, .el.copyright p { text-indent: 0; }',
      '.el p { line-break: strict; }',
      `.el em { font-style: normal; text-emphasis: ${mark}; text-emphasis-position: under right; }`,
    );
  } else {
    rules.push('.el { line-height: 1.75; }', '.el em { font-style: normal; font-weight: 700; }');
  }
  return rules.join('\n');
}

/** CSS shared by every theme and both outputs. Theme CSS, then languageCss, come after it. */
export function baseCss(theme: Theme, lang = 'en'): string {
  return `
:root { --body-font: ${fontStack(theme.fonts.body, lang)}; --heading-font: ${fontStack(theme.fonts.heading, lang)}; }
.el { font-family: var(--body-font); }
.el p { margin: 0; text-indent: 1.4em; }
.el p.opener, .el p.first, .el p.align-center, .el p.align-right,
.el blockquote p:first-child, .el .scene-break + p { text-indent: 0; }
.align-center { text-align: center; }
.align-right { text-align: right; }
.align-justify { text-align: justify; }
.el h1, .el h2, .el h3, .chapter-subtitle, .book-title, .book-subtitle, .book-author, .book-publisher { font-family: var(--heading-font); }
.el h2 { font-size: 1.15em; margin: 1.2em 0 0.6em; text-align: center; font-weight: 600; }
.el h3 { font-size: 1em; margin: 1em 0 0.5em; font-style: italic; font-weight: 400; }
.el blockquote { margin: 0.9em 1.6em; }
.el blockquote p { text-indent: 0; }
.el .sc { font-variant: small-caps; }
.el img.figure { display: block; max-width: 100%; margin: 1em auto; }
.chapter-heading, .part-heading { margin: 0; font-weight: 400; }
.chapter-label, .chapter-title, .part-label, .part-title { display: block; }
.chapter-subtitle { margin: 0.6em 0 0; text-indent: 0; text-align: center; font-size: 1.05em; font-style: italic; }
.head-orn { text-align: center; text-indent: 0; margin: 0.9em 0 0; }
.head-orn svg, .head-orn img { width: 3.2em; height: auto; }
.scene-break { text-align: center; text-indent: 0; margin: 1.1em 0; }
.scene-break svg, .scene-break img { width: 3.2em; height: auto; vertical-align: middle; }
.dropcap { float: left; font-family: var(--heading-font); line-height: 0.8; margin: 0.02em 0.06em 0 0; }
.el p.opener { display: flow-root; }
.part-head { text-align: center; }
.title-page { text-align: center; }
.book-title { margin: 0; line-height: 1.15; }
.book-subtitle { margin: 0.6em 0 0; font-style: italic; font-size: 1.2em; text-indent: 0; }
.book-author { margin: 2.2em 0 0; font-size: 1.15em; text-indent: 0; }
.book-publisher { margin: 4em 0 0; font-size: 0.85em; text-indent: 0; letter-spacing: 0.1em; text-transform: uppercase; }
.title-page .head-orn { margin: 1.6em 0 0; }
.copyright { font-size: 0.8em; }
.copyright p { text-indent: 0; margin-bottom: 0.8em; }
.dedication, .epigraph { text-align: center; font-style: italic; }
.el.title-page p, .el.dedication p, .el.epigraph p { text-indent: 0; text-align: inherit; }
.el.epigraph p.align-right { text-align: right; font-style: normal; margin-top: 0.6em; }
.dropcap .dq { font-size: 0.5em; vertical-align: top; position: relative; top: 0.12em; margin-right: 0.04em; }
.matter-head { margin-bottom: 2em; }
.toc-list { list-style: none; margin: 0; padding: 0; }
.toc-list li { margin: 0 0 0.45em; }
.toc-list a { color: inherit; text-decoration: none; }
.toc-part { margin-top: 1em !important; font-weight: 600; }
.toc-label + .toc-title::before { content: ": "; }
:lang(zh) .toc-label + .toc-title::before, :lang(ja) .toc-label + .toc-title::before, :lang(ko) .toc-label + .toc-title::before { content: "\\3000"; }
.el ul, .el ol { margin: 0.7em 0; padding-inline-start: 1.6em; }
.el li { margin: 0.2em 0; }
.el li p, .el td p, .el th p, .el .callout p, .el .message, .el .store-link, .el figcaption { text-indent: 0; }
.el li p + p { margin-top: 0.35em; }
.el .verse { margin: 1em 0 1em 1.6em; }
.el .verse .stanza { margin: 0 0 0.9em; text-indent: 0; text-align: start; }
.el .verse .line { display: block; padding-inline-start: 2em; text-indent: -2em; }
.el .callout { margin: 1.2em 0; padding: 0.5em 0 0.5em 0.9em; border-inline-start: 2px solid currentColor; }
.el .callout-tip { border-inline-start-style: dashed; }
.el .callout-warning { border-inline-start-width: 4px; }
.el .callout p { margin: 0 0 0.45em; text-align: start; }
.el .callout p:last-child { margin-bottom: 0; }
.el .table { width: 100%; margin: 1em 0; border-collapse: collapse; font-size: 0.9em; }
.el .table th, .el .table td { padding: 0.3em 0.5em; border: 1px solid currentColor; vertical-align: top; text-align: start; }
.el .table p { margin: 0; text-align: start; }
.el .messages { margin: 1.1em 0; }
.el .message { margin: 0 25% 0.45em 0; padding: 0.4em 0.75em; border: 1px solid currentColor; border-radius: 0.9em; text-align: start; }
.el .message-sent { margin: 0 0 0.45em 25%; text-align: end; }
.el .message .sender { display: block; font-size: 0.72em; font-weight: 700; letter-spacing: 0.04em; }
.el .store-link { margin: 1em 0; text-align: center; }
.el .store-link a { font-weight: 700; }
.el .store-url { display: block; font-size: 0.85em; }
.el .figure-block { margin: 1em 0; text-align: center; }
.el figcaption { margin-top: 0.4em; font-size: 0.85em; font-style: italic; text-align: center; }
.heading-image { margin: 0 0 1.2em; text-align: center; text-indent: 0; }
.heading-image img { max-width: 100%; height: auto; }
sup { line-height: 0; }
.noteref { text-decoration: none; color: inherit; }
.chapter-notes, .book-notes .body { font-size: 0.86em; }
.chapter-notes { margin-top: 2em; }
.notes-heading, .notes-group { margin: 1.6em 0 0.6em; font-size: 1em; font-weight: 600; text-align: start; }
.notes-list { margin: 0; padding-inline-start: 1.8em; }
.notes-list li { margin: 0 0 0.35em; }
aside.footnote { margin-top: 1em; font-size: 0.85em; }
aside.footnote p { text-indent: 0; }
.note-back { text-decoration: none; color: inherit; }
`;
}
