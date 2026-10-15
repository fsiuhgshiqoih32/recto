// Advanced CSS for the style builder: parsed with css-tree and kept only where
// it sticks to typography and spacing. Nothing may load from outside the book
// (no url(), no @import, no fonts the book doesn't carry), and nothing may
// reach paged.js's page machinery. Loaded on demand, so css-tree stays out of
// the main bundle.

import { type CssNode, type StyleSheet, generate, parse, walk } from 'css-tree';

const PROPERTIES = new Set([
  'font-size', 'font-style', 'font-weight', 'font-variant', 'font-variant-caps', 'font-variant-numeric', 'font-variant-ligatures',
  'font-feature-settings', 'font-kerning', 'font-size-adjust', 'letter-spacing', 'word-spacing', 'line-height',
  'text-align', 'text-align-last', 'text-indent', 'text-transform', 'text-decoration', 'text-decoration-line',
  'text-decoration-style', 'text-decoration-thickness', 'text-underline-offset', 'text-wrap', 'hyphens', 'hanging-punctuation',
  'white-space', 'vertical-align', 'color', 'background-color', 'opacity', 'display', 'float', 'clear',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'list-style', 'list-style-type', 'list-style-position', 'quotes', 'content', 'counter-reset', 'counter-increment',
  'widows', 'orphans', 'break-before', 'break-after', 'break-inside', 'page-break-before', 'page-break-after', 'page-break-inside',
]);
const PREFIXES = ['margin', 'padding', 'border'];

/** Functions that fetch or paint from outside the text. */
const FUNCTIONS = new Set(['url', 'image', 'image-set', 'cross-fade', 'element', 'expression', 'paint', 'src', 'env']);

/** Selectors that would reach outside the book's own elements. */
const SELECTORS = /(^|[\s>+~,(])(html|body)\b|:root|pagedjs|^\s*\*\s*$/i;

export interface SanitizedCss {
  css: string;
  /** What was left out, and why, in words for the author. */
  notes: string[];
}

function allowedProperty(property: string): boolean {
  return PROPERTIES.has(property) || PREFIXES.some((prefix) => property === prefix || property.startsWith(`${prefix}-`));
}

export function sanitizeCss(input: string): SanitizedCss {
  const notes: string[] = [];
  const rules: string[] = [];
  let ast: CssNode;
  try {
    ast = parse(input, { onParseError: (error) => notes.push(`Couldn’t read part of it: ${error.message}`) });
  } catch (error) {
    return { css: '', notes: [`Couldn’t read the CSS: ${error instanceof Error ? error.message : String(error)}`] };
  }
  (ast as StyleSheet).children.forEach((node) => {
    if (node.type === 'Atrule') {
      notes.push(`@${node.name} rules aren’t allowed.`);
      return;
    }
    if (node.type !== 'Rule') return;
    const selectors: string[] = [];
    if (node.prelude.type === 'SelectorList') {
      node.prelude.children.forEach((selector) => {
        const text = generate(selector);
        if (SELECTORS.test(text)) notes.push(`The selector “${text}” isn’t allowed: style the book’s own elements (.chapter-title, .el p…).`);
        else selectors.push(text);
      });
    }
    const declarations: string[] = [];
    node.block.children.forEach((child) => {
      if (child.type === 'Rule' || child.type === 'Atrule') {
        notes.push('Nested rules aren’t supported.');
        return;
      }
      if (child.type !== 'Declaration') return;
      const property = child.property.toLowerCase();
      if (property === 'font-family' || property === 'font') {
        notes.push('Choose fonts with Body font and Heading font: the book can only carry the fonts Recto bundles.');
        return;
      }
      if (!allowedProperty(property)) {
        notes.push(`“${property}” isn’t allowed. Advanced CSS covers type, spacing, borders and page breaks.`);
        return;
      }
      let blocked = '';
      walk(child.value, (value) => {
        if (value.type === 'Url') blocked = 'url()';
        else if (value.type === 'Function' && FUNCTIONS.has(value.name.toLowerCase())) blocked = `${value.name}()`;
      });
      if (blocked) {
        notes.push(`${property}: ${blocked} isn’t allowed: a book can’t load anything from outside itself.`);
        return;
      }
      if (property === 'color' || property === 'background-color') notes.push('Printers screen colors other than black into dots; keep print text black.');
      declarations.push(generate(child));
    });
    if (selectors.length && declarations.length) rules.push(`${selectors.join(', ')} { ${declarations.join('; ')}; }`);
  });
  return { css: rules.join('\n'), notes: [...new Set(notes)] };
}
