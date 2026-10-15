// An accessibility check of the built EPUB in the app, with axe-core: the
// rules engine DAISY Ace runs (CI runs Ace itself on sample books). Each
// content document is loaded in a hidden frame with the book's stylesheet and
// checked against WCAG 2.x A and AA. Browser only, loaded on demand.

import JSZip from 'jszip';
import type { Book } from '../model/book';
import { editionOf } from '../model/book';

export interface AxeIssue {
  /** axe rule id, e.g. "image-alt". */
  rule: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  /** axe's one-line description of the problem (English). */
  help: string;
  helpUrl: string;
  /** How many elements in that document break the rule. */
  count: number;
  /** The book element the document belongs to, when it is one. */
  elementId?: string;
}

/**
 * Rules that don't apply to EPUB content documents, as in Ace: a chapter file
 * has no page-level landmarks or skip links, and notes are complementary
 * content inside sections by design.
 */
const OFF = ['region', 'landmark-one-main', 'landmark-unique', 'page-has-heading-one', 'bypass', 'landmark-complementary-is-top-level', 'landmark-no-duplicate-contentinfo'];

type AxeResults = { violations: { id: string; impact: AxeIssue['impact'] | null; help: string; helpUrl: string; nodes: unknown[] }[] };

function runInFrame(html: string, axeSource: string): Promise<AxeResults> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Accessibility check';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '800px', height: '1000px', border: '0' });
    const timeout = setTimeout(() => {
      frame.remove();
      reject(new Error('The accessibility check took too long.'));
    }, 60_000);
    frame.onload = async () => {
      try {
        const win = frame.contentWindow as (Window & { axe?: { run(context: Document, options: object): Promise<AxeResults> } }) | null;
        if (!win) throw new Error('The accessibility check could not start.');
        // axe-core's own bundled source (from the axe-core package, never book content) runs inside the frame it checks.
        const script = win.document.createElement('script');
        script.textContent = axeSource;
        win.document.head.appendChild(script);
        const results = await win.axe!.run(win.document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
          rules: Object.fromEntries(OFF.map((id) => [id, { enabled: false }])),
          resultTypes: ['violations'],
        });
        resolve(results);
      } catch (error) {
        reject(error);
      } finally {
        clearTimeout(timeout);
        frame.remove();
      }
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** Checks every content document of an EPUB built from `book`. */
export async function checkEpubAccessibility(book: Book, epub: Uint8Array): Promise<AxeIssue[]> {
  // The script file itself, as text: a bundler's minifier would rename what axe.source refers to.
  const [{ default: axeSource }, zip] = await Promise.all([import('axe-core/axe.min.js?raw'), JSZip.loadAsync(epub)]);
  const css = (await zip.file('OEBPS/styles/book.css')?.async('string')) ?? '';
  const elements = editionOf(book, 'ebook').elements;
  const documents = Object.keys(zip.files).filter((path) => /^OEBPS\/(text\/\d+-[\w-]+|nav)\.xhtml$/.test(path)).sort();
  const issues: AxeIssue[] = [];
  for (const path of documents) {
    const xhtml = await zip.file(path)!.async('string');
    // The stylesheet goes inline (relative links don't resolve in the frame); images keep their alt text.
    const html = xhtml
      .replace(/^<\?xml[^>]*>\s*/, '')
      .replace(/<link rel="stylesheet"[^>]*\/>/, `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
      .replace(/ src="\.\.\/[^"]*"/g, ' src="data:image/gif;base64,R0lGODlhAQABAAAAACw="');
    // File names are numbered in reading order: 003-dedication.xhtml is the third element.
    const index = /text\/(\d+)-/.exec(path)?.[1];
    const elementId = index ? elements[Number(index) - 1]?.id : undefined;
    const results = await runInFrame(html, axeSource);
    for (const v of results.violations) {
      issues.push({ rule: v.id, impact: v.impact ?? 'moderate', help: v.help, helpUrl: v.helpUrl, count: v.nodes.length, elementId });
    }
  }
  return issues;
}
