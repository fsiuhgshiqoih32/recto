import Placeholder from '@tiptap/extension-placeholder';
import { type Editor as TiptapEditor, EditorContent, useEditor } from '@tiptap/react';
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import type { Doc } from '../model/book';
import type { Theme } from '../themes';
import { fontStack } from '../themes/fonts';
import { Icon, type IconName, SmallCapsGlyph } from '../ui/icons';
import { languageInfo } from '../i18n/languages';
import { usePreference } from '../ui/preferences';
import { bookExtensions } from './extensions';

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
}

export function Editor({ elementId, content, theme, lang, placeholder, onChange, active = true }: EditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [spellcheck, setSpellcheck] = usePreference('recto:spellcheck', true);

  const editor = useEditor(
    {
      extensions: [...bookExtensions, Placeholder.configure({ placeholder })],
      content,
      onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as Doc),
      // Re-render on selection changes so the toolbar's active states stay current.
      shouldRerenderOnTransaction: true,
      // lang, dir and spellcheck come from the wrapper below, so they can change without recreating the editor.
      editorProps: { attributes: { class: 'manuscript', 'aria-label': 'Manuscript text' } },
    },
    [elementId],
  );

  useEffect(() => {
    if (active && editor) editor.commands.focus(undefined, { scrollIntoView: false });
  }, [active, editor]);

  const style = {
    '--editor-body': fontStack(theme.fonts.body, lang),
    '--editor-heading': fontStack(theme.fonts.heading, lang),
  } as CSSProperties;

  return (
    <div className="editor" style={style}>
      {editor && <Toolbar editor={editor} spellcheck={spellcheck} onSpellcheck={setSpellcheck} />}
      <div className="editor-scroll">
        <EditorContent editor={editor} className="editor-page" lang={lang} dir={languageInfo(lang).dir} spellCheck={spellcheck} />
      </div>
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

function Toolbar({ editor, spellcheck, onSpellcheck }: { editor: TiptapEditor; spellcheck: boolean; onSpellcheck: (on: boolean) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();
  const align = (value: 'center' | 'right') =>
    editor.isActive({ textAlign: value }) ? chain().unsetTextAlign().run() : chain().setTextAlign(value).run();

  const insertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => chain().setImage({ src: String(reader.result), alt: file.name.replace(/\.[^.]+$/, '') }).run();
    reader.readAsDataURL(file);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="tool-group">
        <ToolButton label="Italic (Ctrl+I)" icon="italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
        <ToolButton label="Bold (Ctrl+B)" icon="bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
        <ToolButton label="Small caps (Ctrl+Shift+K)" active={editor.isActive('smallCaps')} onClick={() => chain().toggleSmallCaps().run()}>
          <SmallCapsGlyph />
        </ToolButton>
      </div>
      <div className="tool-group">
        <ToolButton label="Subheading" icon="heading" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
        <ToolButton label="Block quote" icon="quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
        <ToolButton label="Center" icon="alignCenter" active={editor.isActive({ textAlign: 'center' })} onClick={() => align('center')} />
        <ToolButton label="Align right" icon="alignRight" active={editor.isActive({ textAlign: 'right' })} onClick={() => align('right')} />
      </div>
      <div className="tool-group">
        <ToolButton label="Scene break (Ctrl+Shift+Enter)" icon="scene" onClick={() => chain().insertSceneBreak().run()} />
        <ToolButton label="Insert image" icon="image" onClick={() => fileInput.current?.click()} />
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
      <div className="tool-group tool-group-end">
        <ToolButton label={spellcheck ? 'Spellcheck on' : 'Spellcheck off'} icon="spell" active={spellcheck} onClick={() => onSpellcheck(!spellcheck)} />
      </div>
      <div className="tool-group">
        <ToolButton label="Undo (Ctrl+Z)" icon="undo" disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
        <ToolButton label="Redo (Ctrl+Shift+Z)" icon="redo" disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
      </div>
    </div>
  );
}
