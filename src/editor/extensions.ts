// The editor schema. The importers parse HTML with the same extensions, so
// imported manuscripts always fit what the editor and the renderer expect.

import { Mark, Node, mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';
import type { CalloutTone, InlineNode, Store } from '../model/book';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smallCaps: { toggleSmallCaps: () => ReturnType };
    sceneBreak: { insertSceneBreak: () => ReturnType };
    verse: { toggleVerse: () => ReturnType };
    callout: { toggleCallout: (tone?: CalloutTone) => ReturnType; setCalloutTone: (tone: CalloutTone) => ReturnType };
    textMessage: { insertTextMessage: (side: 'sent' | 'received') => ReturnType; setTextMessage: (attrs: { side?: 'sent' | 'received'; sender?: string | null }) => ReturnType };
    note: { insertNote: (content?: InlineNode[]) => ReturnType };
    storeLinks: { insertStoreLinks: (attrs: { label: string; links: Partial<Record<Store, string>> }) => ReturnType };
  }
}

export const SmallCaps = Mark.create({
  name: 'smallCaps',
  parseHTML() {
    return [{ tag: 'span.sc' }, { style: 'font-variant=small-caps' }, { style: 'font-variant-caps=small-caps' }];
  },
  renderHTML() {
    return ['span', { class: 'sc' }, 0];
  },
  addCommands() {
    return { toggleSmallCaps: () => ({ commands }) => commands.toggleMark(this.name) };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-k': () => this.editor.commands.toggleSmallCaps() };
  },
});

export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'hr' }, { tag: 'div.scene-break' }];
  },
  renderHTML() {
    return ['hr', { class: 'scene-break' }];
  },
  addCommands() {
    return {
      insertSceneBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: 'paragraph' }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-Enter': () => this.editor.commands.insertSceneBreak() };
  },
});

/** Poetry: stanzas (paragraphs) whose lines are separated by Shift+Enter. */
export const Verse = Node.create({
  name: 'verse',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div.verse' }];
  },
  renderHTML() {
    return ['div', { class: 'verse' }, 0];
  },
  addCommands() {
    return {
      toggleVerse:
        () =>
        ({ commands, editor }) =>
          editor.isActive(this.name) ? commands.lift(this.name) : commands.wrapIn(this.name),
    };
  },
});

const TONES: CalloutTone[] = ['note', 'tip', 'warning'];
const toneOf = (el: HTMLElement): CalloutTone => {
  const tone = el.getAttribute('data-tone') ?? TONES.find((t) => el.classList.contains(`callout-${t}`));
  return TONES.includes(tone as CalloutTone) ? (tone as CalloutTone) : 'note';
};

/** A boxed aside that stays on one page in print: notes, tips, warnings. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: '(paragraph | heading | bulletList | orderedList)+',
  defining: true,
  addAttributes() {
    return { tone: { default: 'note', parseHTML: (el) => toneOf(el), renderHTML: (attrs) => ({ 'data-tone': attrs.tone }) } };
  },
  parseHTML() {
    return [{ tag: 'aside.callout' }, { tag: 'div.callout' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { class: `callout callout-${node.attrs.tone}` }), 0];
  },
  addCommands() {
    return {
      toggleCallout:
        (tone = 'note') =>
        ({ commands, editor }) =>
          editor.isActive(this.name) ? commands.lift(this.name) : commands.wrapIn(this.name, { tone }),
      setCalloutTone:
        (tone) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { tone }),
    };
  },
});

/** One message in a text conversation; consecutive messages render as a thread. */
export const TextMessage = Node.create({
  name: 'textMessage',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      side: {
        default: 'received',
        parseHTML: (el) => (el.getAttribute('data-side') ?? (el.classList.contains('message-sent') ? 'sent' : 'received')),
        renderHTML: (attrs) => ({ 'data-side': attrs.side }),
      },
      sender: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-sender') ?? el.querySelector('.sender')?.textContent ?? null,
        renderHTML: (attrs) => (attrs.sender ? { 'data-sender': attrs.sender } : {}),
      },
    };
  },
  parseHTML() {
    // Above plain paragraphs, which would otherwise claim the <p>.
    return [{ tag: 'p.message', priority: 60, contentElement: (el: HTMLElement) => {
      // The renderer's sender label isn't part of the message text.
      el.querySelector('.sender')?.remove();
      return el;
    } }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes, { class: `message message-${node.attrs.side}` }), 0];
  },
  addCommands() {
    return {
      insertTextMessage:
        (side) =>
        ({ commands }) =>
          commands.setNode(this.name, { side }),
      setTextMessage:
        (attrs) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attrs),
    };
  },
});

/**
 * A footnote or endnote, kept at the point it's cited. Its text is an
 * attribute (inline JSON), edited in a popover; the editor shows a numbered marker.
 */
export const Note = Node.create({
  name: 'note',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      content: {
        default: [],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-note') ?? '[]') as InlineNode[];
          } catch {
            return [{ type: 'text', text: el.textContent ?? '' }];
          }
        },
        renderHTML: (attrs) => ({ 'data-note': JSON.stringify(attrs.content ?? []) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span.note[data-note]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'note' })];
  },
  addNodeView() {
    return ({ getPos, editor }) => {
      const dom = document.createElement('button');
      dom.type = 'button';
      dom.className = 'note-marker';
      dom.setAttribute('aria-label', 'Edit note');
      dom.contentEditable = 'false';
      dom.addEventListener('mousedown', (event) => event.preventDefault());
      dom.addEventListener('click', () => {
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (typeof pos === 'number') editor.view.dom.dispatchEvent(new CustomEvent('recto:edit-note', { detail: { pos, anchor: dom }, bubbles: true }));
      });
      return { dom };
    };
  },
  addCommands() {
    return {
      insertNote:
        (content = []) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { content } }),
    };
  },
});

/** A "buy it here" link whose address follows the store the ebook edition is for. */
export const StoreLinks = Node.create({
  name: 'storeLinks',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      label: { default: 'Buy now', parseHTML: (el) => el.getAttribute('data-label') ?? el.textContent?.trim() ?? 'Buy now' },
      links: {
        default: {},
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-links') ?? '{}');
          } catch {
            return {};
          }
        },
      },
    };
  },
  parseHTML() {
    return [{ tag: 'p.store-link[data-links]', priority: 60 }];
  },
  renderHTML({ node }) {
    return ['p', { class: 'store-link', 'data-label': node.attrs.label, 'data-links': JSON.stringify(node.attrs.links ?? {}) }, node.attrs.label];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'store-links-block';
      dom.contentEditable = 'false';
      const render = (attrs: { label: string; links: Partial<Record<Store, string>> }) => {
        const count = Object.values(attrs.links ?? {}).filter((url) => url?.trim()).length;
        dom.replaceChildren();
        const label = document.createElement('span');
        label.className = 'store-links-label';
        label.textContent = attrs.label || 'Buy now';
        const meta = document.createElement('span');
        meta.className = 'store-links-meta';
        meta.textContent = count ? `Store link · ${count} ${count === 1 ? 'store' : 'stores'}` : 'Store link · no addresses yet';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'btn btn-quiet';
        edit.textContent = 'Edit links';
        edit.addEventListener('click', () => {
          const pos = typeof getPos === 'function' ? getPos() : undefined;
          if (typeof pos === 'number') editor.view.dom.dispatchEvent(new CustomEvent('recto:edit-store-links', { detail: { pos }, bubbles: true }));
        });
        dom.append(label, meta, edit);
      };
      render(node.attrs as { label: string; links: Partial<Record<Store, string>> });
      return {
        dom,
        update: (next) => {
          if (next.type.name !== 'storeLinks') return false;
          render(next.attrs as { label: string; links: Partial<Record<Store, string>> });
          return true;
        },
      };
    };
  },
  addCommands() {
    return {
      insertStoreLinks:
        (attrs) =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name, attrs }, { type: 'paragraph' }]).run(),
    };
  },
});

/** Images carry a print layout and an optional caption besides their description. */
export const BookImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      layout: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-layout'),
        renderHTML: (attrs) => (attrs.layout && attrs.layout !== 'inline' ? { 'data-layout': attrs.layout } : {}),
      },
      caption: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-caption') ?? el.closest('figure')?.querySelector('figcaption')?.textContent ?? null,
        renderHTML: (attrs) => (attrs.caption ? { 'data-caption': attrs.caption } : {}),
      },
    };
  },
}).configure({ inline: false, allowBase64: true });

export const bookExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    horizontalRule: false,
  }),
  TextAlign.configure({ types: ['paragraph', 'heading'], alignments: ['left', 'center', 'right', 'justify'] }),
  BookImage,
  SmallCaps,
  SceneBreak,
  Verse,
  Callout,
  TextMessage,
  Note,
  StoreLinks,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];
