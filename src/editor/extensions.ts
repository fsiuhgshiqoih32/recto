// The editor schema. The importers parse HTML with the same extensions, so
// imported manuscripts always fit what the editor and the renderer expect.

import { Mark, Node } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import StarterKit from '@tiptap/starter-kit';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smallCaps: { toggleSmallCaps: () => ReturnType };
    sceneBreak: { insertSceneBreak: () => ReturnType };
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

export const bookExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    bulletList: false,
    orderedList: false,
    listItem: false,
    code: false,
    codeBlock: false,
    strike: false,
    horizontalRule: false,
  }),
  TextAlign.configure({ types: ['paragraph', 'heading'], alignments: ['left', 'center', 'right', 'justify'] }),
  Image.configure({ inline: false, allowBase64: true }),
  SmallCaps,
  SceneBreak,
];
