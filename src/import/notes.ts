// Footnotes and endnotes from imported manuscripts. Word (via mammoth) and
// Markdown (via markdown-it-footnote) both write a numbered link where a note
// is cited and a list of note texts at the end, each linking back. Recto keeps
// a note at the point it's cited, so each citation becomes a note carrying its
// text, and the list goes away.
// Needs a DOM (DOMParser): the browser, or happy-dom in tests.

import { generateJSON } from '@tiptap/html';
import type { Doc, InlineNode } from '../model/book';
import { bookExtensions } from '../editor/extensions';

/** The note text as inline content: its paragraphs run together, without the backlink. */
function noteContent(item: Element): InlineNode[] {
  const html = Array.from(item.querySelectorAll('p'))
    .map((p) => p.innerHTML.trim())
    .filter(Boolean)
    .join(' ') || item.innerHTML;
  const doc = generateJSON(`<p>${html}</p>`, bookExtensions) as Doc;
  const first = doc.content[0];
  return first && first.type === 'paragraph' ? (first.content ?? []) : [];
}

/** Turns cited footnotes and endnotes into Recto notes; returns the manuscript HTML without its notes lists. */
export function extractNotes(html: string): string {
  if (!/id=["']?(footnote|endnote|fn)/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lists = new Set<Element>();
  for (const item of Array.from(doc.querySelectorAll('li[id]'))) {
    const back = Array.from(item.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')).find((a) => doc.getElementById(a.getAttribute('href')!.slice(1)));
    if (!back) continue;
    const citation = doc.getElementById(back.getAttribute('href')!.slice(1));
    if (!citation || item.contains(citation)) continue;
    item.querySelectorAll('a[href^="#"]').forEach((a) => {
      if (doc.getElementById(a.getAttribute('href')!.slice(1))) a.remove();
    });
    const note = doc.createElement('span');
    note.className = 'note';
    note.setAttribute('data-note', JSON.stringify(noteContent(item)));
    // The citation is usually a superscript link: replace the whole superscript.
    const sup = citation.parentElement?.tagName === 'SUP' && citation.parentElement.textContent?.trim() === citation.textContent?.trim() ? citation.parentElement : citation;
    sup.replaceWith(note);
    if (item.parentElement) lists.add(item.parentElement);
    item.remove();
  }
  for (const list of lists) {
    if (list.children.length) continue;
    // markdown-it wraps the list in <section class="footnotes"> after an <hr>.
    const section = list.closest('section.footnotes');
    const target = section ?? list;
    if (target.previousElementSibling?.matches('hr.footnotes-sep')) target.previousElementSibling.remove();
    target.remove();
  }
  return doc.body.innerHTML;
}
