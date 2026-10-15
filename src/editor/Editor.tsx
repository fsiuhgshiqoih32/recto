import Placeholder from '@tiptap/extension-placeholder';
import { type Editor as TiptapEditor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import type { CalloutTone, Doc, ImageLayout, InlineNode, Store } from '../model/book';
import type { Theme } from '../themes';
import { fontStack } from '../themes/fonts';
import { DropdownMenu } from '../ui/DropdownMenu';
import { Icon, type IconName, SmallCapsGlyph } from '../ui/icons';
import { languageInfo } from '../i18n/languages';
import { usePreference } from '../ui/preferences';
import { SmallCaps, bookExtensions } from './extensions';
import { useModal } from '../ui/useModal';
import { N_, t } from '../i18n/ui';

interface EditorProps {
  /** Changing the key element id recreates the editor (each element keeps its own undo history). */
  elementId: string;
  content: Doc;
  theme: Theme;
  /** The book's language: drives spellchecking, text direction and fonts. */
  lang: string;
  placeholder: string;
  onChange: (doc: Doc) => void;
  active?: boolean;
  /** Whether the print edition has bleed (full-bleed and two-page images need it). */
  bleed?: boolean;
  onEnableBleed?: () => void;
}

export function Editor({ elementId, content, theme, lang, placeholder, onChange, active = true, bleed = false, onEnableBleed }: EditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [spellcheck, setSpellcheck] = usePreference('recto:spellcheck', true);
  const [noteAt, setNoteAt] = useState<{ pos: number; anchor: DOMRect } | null>(null);
  const [storeLinksAt, setStoreLinksAt] = useState<number | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  const editor = useEditor(
    {
      extensions: [...bookExtensions, Placeholder.configure({ placeholder })],
      content,
      onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as Doc),
      // Re-render on selection changes so the toolbar's active states stay current.
      shouldRerenderOnTransaction: true,
      // lang, dir and spellcheck come from the wrapper below, so they can change without recreating the editor.
      editorProps: { attributes: { class: 'manuscript', 'aria-label': t('Manuscript text') } },
    },
    [elementId],
  );

  useEffect(() => {
    if (active && editor) editor.commands.focus(undefined, { scrollIntoView: false });
  }, [active, editor]);

  // Note markers and store-link blocks ask for their editors through DOM events.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onNote = (event: Event) => {
      const { pos, anchor } = (event as CustomEvent<{ pos: number; anchor: HTMLElement }>).detail;
      setNoteAt({ pos, anchor: anchor.getBoundingClientRect() });
    };
    const onStoreLinks = (event: Event) => setStoreLinksAt((event as CustomEvent<{ pos: number }>).detail.pos);
    dom.addEventListener('recto:edit-note', onNote);
    dom.addEventListener('recto:edit-store-links', onStoreLinks);
    return () => {
      dom.removeEventListener('recto:edit-note', onNote);
      dom.removeEventListener('recto:edit-store-links', onStoreLinks);
    };
  }, [editor]);

  const addNote = () => {
    if (!editor) return;
    editor.chain().focus().insertNote([]).run();
    // The new note sits just before the cursor; open it for typing.
    const pos = editor.state.selection.from - 1;
    const marker = editor.view.nodeDOM(pos);
    const rect = marker instanceof HTMLElement ? marker.getBoundingClientRect() : editor.view.coordsAtPos(pos);
    setNoteAt({ pos, anchor: rect instanceof DOMRect ? rect : new DOMRect(rect.left, rect.top, 0, rect.bottom - rect.top) });
  };

  const style = {
    '--editor-body': fontStack(theme.fonts.body, lang),
    '--editor-heading': fontStack(theme.fonts.heading, lang),
  } as CSSProperties;

  return (
    <div className="editor" style={style}>
      {editor && (
        <Toolbar
          editor={editor}
          spellcheck={spellcheck}
          onSpellcheck={setSpellcheck}
          onAddNote={addNote}
          onImageSettings={() => setImageOpen(true)}
          onAddStoreLinks={() => {
            editor.chain().focus().insertStoreLinks({ label: 'Buy now', links: {} }).run();
            const pos = editor.state.selection.from - 2;
            if (editor.state.doc.nodeAt(pos)?.type.name === 'storeLinks') setStoreLinksAt(pos);
          }}
        />
      )}
      <div className="editor-scroll">
        <EditorContent editor={editor} className="editor-page" lang={lang} dir={languageInfo(lang).dir} spellCheck={spellcheck} />
      </div>
      {editor && noteAt && <NotePopover key={noteAt.pos} editor={editor} pos={noteAt.pos} anchor={noteAt.anchor} lang={lang} onClose={() => setNoteAt(null)} />}
      {editor && storeLinksAt !== null && <StoreLinksDialog editor={editor} pos={storeLinksAt} onClose={() => setStoreLinksAt(null)} />}
      {editor && imageOpen && <ImageDialog editor={editor} bleed={bleed} onEnableBleed={onEnableBleed} onClose={() => setImageOpen(false)} />}
    </div>
  );
}

function ToolButton({
  label,
  icon,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  icon?: IconName;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tool${active ? ' is-active' : ''}`}
      data-tip={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
}

const TONE_LABEL: Record<CalloutTone, string> = { note: 'Note', tip: 'Tip', warning: 'Warning' };

function Toolbar({ editor, spellcheck, onSpellcheck, onAddNote, onImageSettings, onAddStoreLinks }: {
  editor: TiptapEditor;
  spellcheck: boolean;
  onSpellcheck: (on: boolean) => void;
  onAddNote: () => void;
  onImageSettings: () => void;
  onAddStoreLinks: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();
  const align = (value: 'center' | 'right') =>
    editor.isActive({ textAlign: value }) ? chain().unsetTextAlign().run() : chain().setTextAlign(value).run();

  const insertImage = (file: File) => {
    const reader = new FileReader();
    // The file name is a poor description, so the image settings open straight away to ask for one.
    reader.onload = () => {
      chain().setImage({ src: String(reader.result), alt: '' }).run();
      onImageSettings();
    };
    reader.readAsDataURL(file);
  };

  const inTable = editor.isActive('table');
  const inCallout = editor.isActive('callout');
  const inMessage = editor.isActive('textMessage');
  const onImage = editor.isActive('image');

  return (
    <div className="toolbar" role="toolbar" aria-label={t('Formatting')}>
      <div className="tool-group">
        <ToolButton label={t('Italic (Ctrl+I)')} icon="italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
        <ToolButton label={t('Bold (Ctrl+B)')} icon="bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
        <ToolButton label={t('Small caps (Ctrl+Shift+K)')} active={editor.isActive('smallCaps')} onClick={() => chain().toggleSmallCaps().run()}>
          <SmallCapsGlyph />
        </ToolButton>
        <ToolButton label={t('Footnote')} icon="footnote" onClick={onAddNote} disabled={!editor.can().insertNote()} />
      </div>
      <div className="tool-group">
        <ToolButton label={t('Subheading')} icon="heading" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
        <ToolButton label={t('Block quote')} icon="quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
        <ToolButton label={t('Bulleted list')} icon="listBullet" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
        <ToolButton label={t('Numbered list')} icon="listNumber" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
        <ToolButton label={t('Verse (Shift+Enter for a new line)')} icon="verse" active={editor.isActive('verse')} onClick={() => chain().toggleVerse().run()} />
        <ToolButton label={t('Callout box')} icon="callout" active={inCallout} onClick={() => chain().toggleCallout('note').run()} />
      </div>
      <div className="tool-group">
        <ToolButton label={t('Center')} icon="alignCenter" active={editor.isActive({ textAlign: 'center' })} onClick={() => align('center')} />
        <ToolButton label={t('Align right')} icon="alignRight" active={editor.isActive({ textAlign: 'right' })} onClick={() => align('right')} />
      </div>
      <div className="tool-group">
        <DropdownMenu label={t('Insert')} className="tool tool-menu" button={<><Icon name="plus" /><Icon name="chevron" size={11} /></>}>
          {(close) => <>
            <button type="button" role="menuitem" onClick={() => { close(); chain().insertSceneBreak().run(); }}><Icon name="scene" />{t('Scene break')}<small>{t('Ctrl+Shift+Enter')}</small></button>
            <button type="button" role="menuitem" onClick={() => { close(); fileInput.current?.click(); }}><Icon name="image" />{t('Image…')}</button>
            <button type="button" role="menuitem" onClick={() => { close(); chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }}><Icon name="table" />{t('Table')}</button>
            <button type="button" role="menuitem" onClick={() => { close(); chain().insertTextMessage('received').run(); }}><Icon name="message" />{t('Text message received')}</button>
            <button type="button" role="menuitem" onClick={() => { close(); chain().insertTextMessage('sent').run(); }}><Icon name="message" />{t('Text message sent')}</button>
            <button type="button" role="menuitem" onClick={() => { close(); onAddStoreLinks(); }}><Icon name="storeLink" />{t('Store link')}<small>{t('Points each store’s edition at its own page')}</small></button>
          </>}
        </DropdownMenu>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) insertImage(file);
            e.target.value = '';
          }}
        />
      </div>
      {(inTable || inCallout || inMessage || onImage) && (
        <div className="tool-group tool-context">
          {onImage && <button type="button" className="btn btn-quiet tool-text" onMouseDown={(e) => e.preventDefault()} onClick={onImageSettings}><Icon name="image" />{t('Image settings')}</button>}
          {inTable && (
            <DropdownMenu label={t('Table')} className="btn btn-quiet tool-text" button={<><Icon name="table" />{t('Table')}<Icon name="chevron" size={11} /></>}>
              {(close) => <>
                <button type="button" role="menuitem" onClick={() => { close(); chain().addRowAfter().run(); }}>{t('Add row below')}</button>
                <button type="button" role="menuitem" onClick={() => { close(); chain().addColumnAfter().run(); }}>{t('Add column to the right')}</button>
                <button type="button" role="menuitem" onClick={() => { close(); chain().toggleHeaderRow().run(); }}>{t('Header row on or off')}</button>
                <div className="menu-sep" />
                <button type="button" role="menuitem" onClick={() => { close(); chain().deleteRow().run(); }}>{t('Delete row')}</button>
                <button type="button" role="menuitem" onClick={() => { close(); chain().deleteColumn().run(); }}>{t('Delete column')}</button>
                <button type="button" role="menuitem" className="danger" onClick={() => { close(); chain().deleteTable().run(); }}>{t('Delete table')}</button>
              </>}
            </DropdownMenu>
          )}
          {inCallout && (
            <DropdownMenu label={t('Callout style')} className="btn btn-quiet tool-text" button={<><Icon name="callout" />{TONE_LABEL[(editor.getAttributes('callout').tone as CalloutTone) ?? 'note']}<Icon name="chevron" size={11} /></>}>
              {(close) => (Object.keys(TONE_LABEL) as CalloutTone[]).map((tone) => (
                <button key={tone} type="button" role="menuitemradio" aria-checked={editor.getAttributes('callout').tone === tone} onClick={() => { close(); chain().setCalloutTone(tone).run(); }}>{TONE_LABEL[tone]}</button>
              ))}
            </DropdownMenu>
          )}
          {inMessage && <MessageControls editor={editor} />}
        </div>
      )}
      <div className="tool-group tool-group-end">
        <ToolButton label={spellcheck ? t('Spellcheck on') : t('Spellcheck off')} icon="spell" active={spellcheck} onClick={() => onSpellcheck(!spellcheck)} />
      </div>
      <div className="tool-group">
        <ToolButton label={t('Undo (Ctrl+Z)')} icon="undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
        <ToolButton label={t('Redo (Ctrl+Shift+Z)')} icon="redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
      </div>
    </div>
  );
}

function MessageControls({ editor }: { editor: TiptapEditor }) {
  const { side, sender } = editor.getAttributes('textMessage') as { side?: string; sender?: string | null };
  const [name, setName] = useState(sender ?? '');
  useEffect(() => setName(sender ?? ''), [sender]);
  return (
    <span className="message-controls">
      <button type="button" className="btn btn-quiet tool-text" aria-pressed={side === 'sent'} onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextMessage({ side: side === 'sent' ? 'received' : 'sent' }).run()}>
        <Icon name="message" />{side === 'sent' ? 'Sent' : 'Received'}
      </button>
      <input className="message-sender" value={name} placeholder={t('Sender')} aria-label={t('Sender name')}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => editor.chain().setTextMessage({ sender: name.trim() || null }).run()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editor.chain().focus().setTextMessage({ sender: name.trim() || null }).run(); } }} />
    </span>
  );
}

/** Edits a note's text in a small editor of its own (italic, bold and small caps survive). */
function NotePopover({ editor, pos, anchor, lang, onClose }: { editor: TiptapEditor; pos: number; anchor: DOMRect; lang: string; onClose: () => void }) {
  const node = editor.state.doc.nodeAt(pos);
  const initial = (node?.type.name === 'note' ? (node.attrs.content as InlineNode[]) : []) ?? [];
  const box = useRef<HTMLDivElement>(null);
  const note = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, bulletList: false, orderedList: false, listItem: false, codeBlock: false, code: false, horizontalRule: false, strike: false, dropcursor: false, gapcursor: false }),
      SmallCaps,
      Placeholder.configure({ placeholder: t('Note text') }),
    ],
    content: { type: 'doc', content: [{ type: 'paragraph', content: initial.length ? initial : undefined }] },
    autofocus: 'end',
    editorProps: { attributes: { class: 'note-editor', 'aria-label': t('Note text') } },
  });

  const save = () => {
    if (!note) return;
    const paragraphs = (note.getJSON().content ?? []) as { content?: InlineNode[] }[];
    const content = paragraphs.flatMap((p, i) => [...(i ? [{ type: 'text', text: ' ' } as InlineNode] : []), ...(p.content ?? [])]);
    if (editor.state.doc.nodeAt(pos)?.type.name === 'note') {
      if (content.length) editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { content }); return true; }).run();
      else editor.chain().command(({ tr }) => { tr.delete(pos, pos + 1); return true; }).run();
    }
    onClose();
    editor.commands.focus();
  };
  const remove = () => {
    if (editor.state.doc.nodeAt(pos)?.type.name === 'note') editor.chain().command(({ tr }) => { tr.delete(pos, pos + 1); return true; }).run();
    onClose();
    editor.commands.focus();
  };

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) save();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  });

  const top = Math.min(anchor.bottom + 8, window.innerHeight - 220);
  const left = Math.max(12, Math.min(anchor.left - 24, window.innerWidth - 372));
  return (
    <div ref={box} className="note-popover" role="dialog" aria-label={t('Footnote')} style={{ top, left }} lang={lang}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); save(); }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
      }}>
      <div className="note-popover-head"><span>{t('Footnote')}</span><span className="field-hint">{t('Ctrl+I italic · Esc to finish')}</span></div>
      <EditorContent editor={note} />
      <div className="note-popover-actions">
        <button type="button" className="btn btn-quiet danger-text" onClick={remove}><Icon name="trash" size={14} />{t('Remove note')}</button>
        <button type="button" className="btn btn-primary" onClick={save}>{t('Done')}</button>
      </div>
    </div>
  );
}

const LAYOUTS: { id: ImageLayout; label: string; hint: string }[] = [
  { id: 'inline', label: N_('In the text'), hint: N_('Sits between paragraphs, as wide as the text.') },
  { id: 'page', label: N_('A page of its own'), hint: N_('Centered on its own page in print, inside the margins.') },
  { id: 'bleed', label: N_('Full page, to the edges'), hint: N_('Fills a whole printed page and runs off the edges. Needs bleed.') },
  { id: 'spread', label: N_('Across two pages'), hint: N_('One image over a left and a right page, for maps and art. Needs bleed.') },
];

function ImageDialog({ editor, bleed, onEnableBleed, onClose }: { editor: TiptapEditor; bleed: boolean; onEnableBleed?: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useModal(dialog);
  const attrs = editor.getAttributes('image') as { src?: string; alt?: string | null; caption?: string | null; layout?: ImageLayout | null };
  const [alt, setAlt] = useState(attrs.alt ?? '');
  const [caption, setCaption] = useState(attrs.caption ?? '');
  const [layout, setLayout] = useState<ImageLayout>(attrs.layout ?? 'inline');
  const needsBleed = (layout === 'bleed' || layout === 'spread') && !bleed;

  const save = () => {
    editor.chain().focus().updateAttributes('image', { alt: alt.trim(), caption: caption.trim() || null, layout: layout === 'inline' ? null : layout }).run();
    dialog.current?.close();
  };

  return (
    <dialog ref={dialog} className="dialog image-dialog" onClose={onClose} aria-labelledby={`${id}-title`}>
      <header className="dialog-head">
        <h2 id={`${id}-title`}>{t('Image')}</h2>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={() => dialog.current?.close()}><Icon name="close" /></button>
      </header>
      <div className="image-dialog-body">
        {attrs.src && <img className="image-dialog-preview" src={attrs.src} alt="" />}
        <div>
          <label className="field">
            <span className="field-label">{t('Description')}</span>
            <textarea rows={3} value={alt} onChange={(e) => setAlt(e.target.value)} placeholder={t('What the image shows, for readers who can\'t see it')} />
            <span className="field-hint">{t('Screen readers read this aloud. Leave it empty only for a purely decorative image.')}</span>
          </label>
          <label className="field">
            <span className="field-label">{t('Caption')}</span>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t('Optional; printed under the image')} />
          </label>
        </div>
      </div>
      <fieldset className="field layout-choices">
        <legend className="field-label">{t('In print')}</legend>
        {LAYOUTS.map((option) => (
          <label key={option.id} className="layout-choice">
            <input type="radio" name={`${id}-layout`} checked={layout === option.id} onChange={() => setLayout(option.id)} />
            <span><span className="toggle-label">{t(option.label)}</span><span className="field-hint">{t(option.hint)}</span></span>
          </label>
        ))}
      </fieldset>
      {needsBleed && (
        <p className="field-hint image-bleed-note">
          {t('The print edition doesn’t have bleed yet.')}{' '}
          {onEnableBleed && <button type="button" className="btn btn-quiet" onClick={onEnableBleed}>{t('Turn on bleed')}</button>}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>{t('Cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={save}>{t('Save')}</button>
      </div>
    </dialog>
  );
}

const STORES: { id: Store; label: string; placeholder: string }[] = [
  { id: 'amazon', label: 'Amazon Kindle', placeholder: 'https://www.amazon.com/dp/…' },
  { id: 'apple', label: 'Apple Books', placeholder: 'https://books.apple.com/…' },
  { id: 'kobo', label: 'Kobo', placeholder: 'https://www.kobo.com/…' },
  { id: 'google', label: 'Google Play Books', placeholder: 'https://play.google.com/store/books/…' },
  { id: 'nook', label: 'Barnes & Noble Nook', placeholder: 'https://www.barnesandnoble.com/…' },
  { id: 'universal', label: N_('Any other store (universal link)'), placeholder: 'https://books2read.com/…' },
];

function StoreLinksDialog({ editor, pos, onClose }: { editor: TiptapEditor; pos: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useModal(dialog);
  const node = editor.state.doc.nodeAt(pos);
  const [label, setLabel] = useState<string>(node?.attrs.label ?? 'Buy now');
  const [links, setLinks] = useState<Partial<Record<Store, string>>>({ ...(node?.attrs.links ?? {}) });

  const save = () => {
    if (editor.state.doc.nodeAt(pos)?.type.name === 'storeLinks') {
      const clean = Object.fromEntries(Object.entries(links).filter(([, url]) => url?.trim()).map(([store, url]) => [store, url!.trim()]));
      editor.chain().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { label: label.trim() || 'Buy now', links: clean }); return true; }).run();
    }
    dialog.current?.close();
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby={`${id}-title`}>
      <header className="dialog-head">
        <h2 id={`${id}-title`}>{t('Store link')}</h2>
        <button type="button" className="icon-btn" aria-label={t('Close')} onClick={() => dialog.current?.close()}><Icon name="close" /></button>
      </header>
      <p className="dialog-intro">{t('Each store’s edition links to its own page, and other stores get the universal link. Some stores reject ebooks that link to a competitor, so export one EPUB per store from the Export menu.')}</p>
      <label className="field">
        <span className="field-label">{t('Link text')}</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      {STORES.map((store) => (
        <label key={store.id} className="field">
          <span className="field-label">{t(store.label)}</span>
          <input type="url" value={links[store.id] ?? ''} placeholder={store.placeholder} onChange={(e) => setLinks({ ...links, [store.id]: e.target.value })} />
        </label>
      ))}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => dialog.current?.close()}>{t('Cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={save}>{t('Save')}</button>
      </div>
    </dialog>
  );
}
