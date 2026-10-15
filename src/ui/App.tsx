import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop } from '../desktop';
import { languageInfo } from '../i18n/languages';
import type { Book } from '../model/book';
import { KIND_LABEL, hasNode, wordCount } from '../model/book';
import { newBook } from '../model/defaults';
import { sampleBook } from '../model/sample';
import { PreviewPanel, type Device } from '../preview/PreviewPanel';
import { themeOf } from '../render/html';
import { type BookSummary, deleteBook, listBooks, loadBook, rememberOpenBook, saveBook } from '../store/db';
import { fileNameFor, parseBook, serializeBook } from '../store/file';
import { applyTheme, resolveTheme, type UiThemeChoice, useAppearance } from './appearance';
import { AppearanceMenu } from './AppearanceMenu';
import { DropdownMenu } from './DropdownMenu';
import { ElementPane } from './ElementPane';
import { exportDocx, exportEpub, exportStoreEditions, previewInKindle, printBook, savePdfDesktop, saveRectoFile } from './exporters';
import { feeText, formatSize } from '../preflight/checks';

import { BrandMark, Icon } from './icons';
import { ImportDialog } from './ImportDialog';
import { transition } from './motion';
import { BookPanel, SectionPanel, StylePanel } from './Inspector';
import { Navigator } from './Navigator';
import { PublishPanel } from './PublishPanel';
import { usePreference } from './preferences';
import { TabBar } from './TabBar';
import { useBook } from './useBook';
import { useDrawer, useMediaQuery } from './useDrawer';
import { LibraryPicker } from './BoxSetDialog';
import { newBoxSet } from '../model/boxset';
import { fileLink, linkFile } from '../store/fileLinks';
import type { DesktopTools } from '../desktop';
import { N_, t } from '../i18n/ui';

type WorkspaceView = 'format' | 'edit';
type InspectorTab = 'style' | 'section' | 'book' | 'publish';
type Drawer = 'contents' | 'settings' | 'preview' | null;
type Notice = { kind: 'info' | 'success' | 'error' | 'busy'; message: string };
const VIEWS = [{ id: 'format', label: N_('Format') }, { id: 'edit', label: N_('Edit') }] as const;
const PANELS = [{ id: 'style', label: N_('Style') }, { id: 'section', label: N_('Section') }, { id: 'book', label: N_('Book') }, { id: 'publish', label: N_('Publish') }] as const;
/** Tab labels in the interface language. */
const translated = <T extends { label: string }>(options: readonly T[]) => options.map((option) => ({ ...option, label: t(option.label) }));
type ExportFormat = 'epub' | 'stores' | 'pdf' | 'reading' | 'pdfx' | 'docx' | 'kindle';
const EXPORT_PROGRESS: Record<ExportFormat, string> = { epub: N_('Building EPUB…'), stores: N_('Building an EPUB for each store…'), pdf: N_('Laying out every page…'), reading: N_('Laying out every page…'), pdfx: N_('Laying out every page…'), docx: N_('Building the Word document…'), kindle: N_('Building the EPUB for Kindle Previewer…') };
const EXPORT_NAME: Record<ExportFormat, string> = { epub: 'EPUB', stores: N_('Store edition'), pdf: 'PDF', reading: 'PDF', pdfx: 'PDF/X', docx: 'Word', kindle: N_('Kindle preview') };
function firstChapterId(book: Book): string | null { return (book.elements.find((el) => el.kind === 'chapter') ?? book.elements[0])?.id ?? null; }

export function App({ initial }: { initial: Book }) {
  const [book, actions] = useBook(initial);
  const [selectedId, setSelectedId] = useState<string | null>(() => firstChapterId(initial));
  const [view, setView] = useState<WorkspaceView>('format');
  const [tab, setTab] = useState<InspectorTab>('style');
  const [device, setDevice] = useState<Device>('ereader');
  const [showPreview, setShowPreview] = usePreference('recto:edit-preview', true);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [boxSetOpen, setBoxSetOpen] = useState(false);
  const [tools, setTools] = useState<DesktopTools | null>(null);
  useEffect(() => { void desktop?.findTools().then(setTools, () => setTools(null)); }, []);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unavailable'>('saved');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportLock = useRef(false);
  const [appearance, resolvedTheme, setAppearance] = useAppearance();
  const [spellcheckNote, setSpellcheckNote] = useState<string>();
  const openInput = useRef<HTMLInputElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const preview = useRef<HTMLElement>(null);
  const compactNavigation = useMediaQuery('(max-width: 1199px)');
  const compactPanels = useMediaQuery('(max-width: 899px)');
  const closeDrawer = useCallback(() => setDrawer(null), []);
  useDrawer(sidebar, drawer === 'contents' && compactNavigation, closeDrawer);
  useDrawer(inspector, drawer === 'settings' && compactPanels, closeDrawer);
  useDrawer(preview, drawer === 'preview' && compactPanels, closeDrawer);
  const element = book.elements.find((el) => el.id === selectedId) ?? book.elements[0];
  const elementTitle = element?.title || (element ? t(KIND_LABEL[element.kind]) : t('Your manuscript'));
  const previewVisible = view === 'format' || (compactPanels ? drawer === 'preview' : showPreview);

  useEffect(() => { setDrawer(null); }, [compactNavigation, compactPanels]);
  useEffect(() => {
    let current = true;
    setSaveState('saving');
    const timer = setTimeout(() => {
      saveBook(book).then(() => current && setSaveState('saved')).catch(() => current && setSaveState('unavailable'));
    }, 600);
    return () => { current = false; clearTimeout(timer); };
  }, [book]);
  useEffect(() => { document.title = `${book.meta.title || 'Untitled'} · Recto`; }, [book.meta.title]);
  useEffect(() => rememberOpenBook(book.id), [book.id]);
  const notify = (message: string, kind: Notice['kind'] = 'info') => setNotice({ message, kind });
  const switchTo = (next: Book) => transition('book', () => { actions.replace(next); setSelectedId(firstChapterId(next)); setView('format'); closeDrawer(); });
  const changeView = (next: WorkspaceView) => transition('view', () => { setView(next); closeDrawer(); });
  const chooseDevice = (next: Device) => transition('device', () => setDevice(next));
  const chooseAppearance = (choice: UiThemeChoice) => transition('theme', () => { applyTheme(resolveTheme(choice)); setAppearance(choice); });
  const togglePreview = () => transition('view', () => setShowPreview(!showPreview));

  const runExport = async (format: ExportFormat) => {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    notify((format === 'epub' || format === 'stores') && book.style.printPageNumbers ? t('Laying out the print pages for the ebook’s page numbers…') : t(EXPORT_PROGRESS[format]), 'busy');
    try {
      if (format === 'epub') {
        const bytes = await exportEpub(book);
        notify(t('EPUB downloaded ({size}; KDP delivery costs {fee} a sale).', { size: formatSize(bytes), fee: feeText(bytes) }), 'success');
      } else if (format === 'stores') {
        const count = await exportStoreEditions(book);
        notify(t('Downloaded {count} store editions in one zip. Upload each store’s EPUB to that store.', { count }), 'success');
      } else if (format === 'docx') {
        const bytes = await exportDocx(book);
        notify(t('Word document downloaded ({size}).', { size: formatSize(bytes) }), 'success');
      } else if (format === 'kindle') {
        await previewInKindle(book);
        notify(t('Opened in Kindle Previewer. It takes a moment to convert the book.'), 'success');
      }
      else if (desktop) {
        const kind = format === 'reading' ? 'reading' : format === 'pdfx' ? 'pdfx' : 'print';
        const standard = tools?.ghostscript?.standard ?? 'PDF/X';
        const saved = await savePdfDesktop(book, (pages) => notify(kind === 'pdfx' ? t('Laid out {pages} pages. Choose where to save; Ghostscript then converts it to {standard}…', { pages, standard }) : t('Laid out {pages} pages. Choose where to save the PDF…', { pages }), 'busy'), kind);
        notify(saved ? t('Saved {pages}-page {kind} to {path}', { pages: saved.pages, kind: kind === 'pdfx' ? standard : 'PDF', path: saved.path }) : t('PDF export canceled.'), saved ? 'success' : 'info');
      } else {
        await printBook(book, (pages) => notify(t('Laid out {pages} pages. Opening the print dialog…', { pages }), 'busy'), format === 'reading');
        notify(t('Print dialog opened. Choose “Save as PDF” to save your book.'), 'success');
      }
    } catch (error) { notify(t('{format} export failed: {error}', { format: t(EXPORT_NAME[format]), error: error instanceof Error ? error.message : String(error) }), 'error'); }
    finally { exportLock.current = false; setExporting(false); }
  };
  const openText = (name: string, text: string, link?: { path?: string; modified?: number }) => {
    try {
      const opened = parseBook(text);
      // Desktop: remember the file, so Save writes back to it.
      if (link?.path && link.modified !== undefined) linkFile(opened.id, { path: link.path, modified: link.modified });
      switchTo(opened);
      notify(t('Opened {name}.', { name }), 'success');
    }
    catch (error) { notify(error instanceof Error ? error.message : t('That file could not be opened.'), 'error'); }
  };
  /** Desktop: saves the book to its .recto file in place, asking first if the file changed on disk. */
  const saveToFile = async (target: Book, saveAs = false, force = false): Promise<void> => {
    if (!desktop) return saveRectoFile(target);
    const link = fileLink(target.id);
    try {
      const result = await desktop.saveRecto(serializeBook(target), { path: link?.path, modified: link?.modified, name: fileNameFor(target, 'recto'), saveAs, force });
      if (!result) return;
      if ('conflict' in result) {
        const replace = window.confirm(t('“{path}” has changed since Recto last opened or saved it, perhaps on another computer through a synced folder.\n\nReplace it with the book as it is here? Cancel leaves the file alone; Save As keeps both.', { path: link?.path ?? '' }));
        if (replace) return saveToFile(target, false, true);
        notify(t('Not saved: the file on disk changed. Use Save As to keep both versions.'), 'info');
        return;
      }
      linkFile(target.id, result);
      notify(t('Saved to {path}', { path: result.path }), 'success');
    } catch (error) { notify(t('Save failed: {error}', { error: error instanceof Error ? error.message : String(error) }), 'error'); }
  };
  const openFile = async (file: File) => {
    try { openText(file.name, await file.text()); }
    catch (error) { notify(error instanceof Error ? error.message : t('That file could not be read.'), 'error'); }
  };
  useEffect(() => {
    let current = true;
    const name = languageInfo(book.meta.language).name;
    if (!desktop) { setSpellcheckNote(t('Spellcheck uses your browser’s languages')); return; }
    desktop.setSpellcheckLanguages([book.meta.language])
      .then(({ applied }) => current && setSpellcheckNote(
        // macOS spellchecks with the system's dictionaries, which detect the language themselves.
        applied[0] === 'system' ? t('Spellchecking with macOS’s dictionaries')
          : applied.length ? t('Spellchecking in {language} ({dictionaries})', { language: name, dictionaries: applied.join(', ') }) : t('No {language} spelling dictionary is available', { language: name }),
      ))
      .catch(() => current && setSpellcheckNote(undefined));
    return () => { current = false; };
  }, [book.meta.language]);
  const commands = useRef({ runExport, openText, switchTo, saveToFile, book });
  commands.current = { runExport, openText, switchTo, saveToFile, book };
  useEffect(() => {
    if (!desktop) return;
    const shell = desktop;
    void shell.takePendingFile().then((file) => file && commands.current.openText(file.name, file.text, file));
    const offOpen = shell.onOpenFile((file) => commands.current.openText(file.name, file.text, file));
    const offMenu = shell.onMenu((command) => {
      const current = commands.current;
      if (command === 'import') setImportOpen(true);
      else if (command === 'open') void shell.openRecto().then((file) => file && commands.current.openText(file.name, file.text, file));
      else if (command === 'save') void current.saveToFile(current.book);
      else if (command === 'save-as') void current.saveToFile(current.book, true);
      else if (command === 'export-epub') void current.runExport('epub');
      else if (command === 'export-pdf') void current.runExport('pdf');
      else if (command === 'new-book') current.switchTo(newBook());
    });
    return () => { offOpen(); offMenu(); };
  }, []);
  const showBookDetails = () => { setTab('book'); setView('format'); if (compactPanels) setDrawer('settings'); };
  const drawerHeader = (title: string) => <div className="drawer-heading"><strong>{title}</strong><button className="icon-btn" type="button" aria-label={t('Close {panel}', { panel: title.toLowerCase() })} onClick={closeDrawer}><Icon name="close" /></button></div>;

  return (
    <div className="app" data-view={view} data-preview={showPreview}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><BrandMark /></span><span className="brand-name">{t('Recto')}</span></div>
        <div className="file-actions">
          <DropdownMenu label={t('File')} button={<>{t('File')} <Icon name="chevron" size={12} /></>}>
            {(close) => <>
              <button type="button" role="menuitem" onClick={() => { close(); setImportOpen(true); }}><Icon name="upload" />{t('Import manuscript…')}</button>
              <button type="button" role="menuitem" onClick={() => { close(); if (desktop) void desktop.openRecto().then((file) => file && openText(file.name, file.text, file)); else openInput.current?.click(); }}><Icon name="file" />{t('Open Recto file…')}</button>
              {desktop ? <>
                <button type="button" role="menuitem" onClick={() => { close(); void saveToFile(book); }}><Icon name="download" /><span>{t('Save')}<small>{fileLink(book.id)?.path.split(/[\\/]/).pop() ?? t('As a .recto file')}</small></span></button>
                <button type="button" role="menuitem" onClick={() => { close(); void saveToFile(book, true); }}><Icon name="download" />{t('Save as…')}</button>
              </> : <button type="button" role="menuitem" onClick={() => { close(); saveRectoFile(book); }}><Icon name="download" />{t('Save a copy (.recto)')}</button>}
            </>}
          </DropdownMenu>
          <DropdownMenu label={t('Books')} button={<><Icon name="library" /><span>{t('Books')}</span><Icon name="chevron" size={12} /></>}>
            {(close) => <LibraryItems currentId={book.id} onOpen={switchTo} onNewBoxSet={() => setBoxSetOpen(true)} onError={(message) => notify(message, 'error')} close={close} />}
          </DropdownMenu>
        </div>
        <div className="book-title" title={book.meta.title}>
          <span>{book.meta.title || t('Untitled')}</span>
          <span className="book-sub"><span className={`save-dot ${saveState}`} aria-hidden="true" />{t('{count} words', { count: wordCount(book).toLocaleString() })} · {saveState === 'saved' ? (desktop ? t('Saved') : t('Saved in this browser')) : saveState === 'saving' ? t('Saving…') : t('Not saved (storage unavailable)')}</span>
        </div>
        <TabBar id="workspace" label={t('Workspace view')} options={translated(VIEWS)} value={view} onChange={changeView} className="segmented view-switch" />
        <div className="topbar-actions">
          <AppearanceMenu choice={appearance} resolved={resolvedTheme} onChoose={chooseAppearance} />
          <DropdownMenu label={t('Export')} align="right" className="btn btn-primary export-button" disabled={exporting} button={<><Icon name="download" />{exporting ? t('Exporting…') : t('Export')}<Icon name="chevron" size={12} /></>}>
            {(close) => <>
              <div className="menu-label">{t('Export your book')}</div>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('epub'); }}><Icon name="book" /><span>{t('Export EPUB')}<small>{t('For e-readers and ebook stores')}</small></span></button>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('stores'); }}><Icon name="storeLink" /><span>{t('EPUB for each store')}<small>{hasNode(book, 'storeLinks') ? t('Each links only to its own store, in one zip') : t('Same as one EPUB until the book has store links')}</small></span></button>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('pdf'); }}><Icon name="printer" /><span>{desktop ? t('Export PDF') : t('Print PDF')}<small>{desktop ? t('Save a print-ready PDF') : t('Print or save as PDF')}</small></span></button>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('reading'); }}><Icon name="file" /><span>{t('PDF for reading')}<small>{desktop ? t('Live links and bookmarks, for direct sales') : t('Live links, for direct sales')}</small></span></button>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('docx'); }}><Icon name="edit" /><span>{t('Word document')}<small>{t('For an editor, or KDP’s Word upload')}</small></span></button>
              {tools?.ghostscript && <button type="button" role="menuitem" onClick={() => { close(); void runExport('pdfx'); }}><Icon name="printer" /><span>{tools.ghostscript.standard}<small>{t('{colour}, for IngramSpark (Ghostscript {version})', { colour: book.style.paper === 'color' ? 'CMYK' : t('Greyscale'), version: tools.ghostscript.version })}</small></span></button>}
              {tools?.kindlePreviewer && <button type="button" role="menuitem" onClick={() => { close(); void runExport('kindle'); }}><Icon name="preview" /><span>{t('Preview in Kindle Previewer')}<small>{t('Amazon’s own reader preview')}</small></span></button>}
            </>}
          </DropdownMenu>
        </div>
        <input ref={openInput} type="file" accept=".recto,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = ''; }} />
      </header>
      <div className="workspace-toolbar">
        <button type="button" className="btn btn-quiet contents-toggle" aria-expanded={drawer === 'contents'} aria-controls="contents-panel" onClick={() => setDrawer('contents')}><Icon name="contents" />{t('Contents')}</button>
        <div className="workspace-context"><span>{view === 'format' ? t('Book layout') : t('Manuscript')}</span><span className="context-divider">/</span><strong title={elementTitle}>{elementTitle}</strong></div>
        <div className="workspace-controls">
          {view === 'format' ? <button type="button" className="btn btn-quiet settings-toggle" aria-expanded={drawer === 'settings'} aria-controls="settings-panel" onClick={() => setDrawer('settings')}><Icon name="settings" />{t('Settings')}</button> :
            <button type="button" className="btn btn-quiet preview-toggle" aria-pressed={compactPanels ? drawer === 'preview' : showPreview} onClick={() => compactPanels ? setDrawer('preview') : togglePreview()}><Icon name="preview" />{!compactPanels && showPreview ? t('Hide preview') : t('Preview')}</button>}
        </div>
      </div>
      <main className="workspace" id={`workspace-panel-${view}`} role="tabpanel" aria-labelledby={`workspace-tab-${view}`}>
        <aside ref={sidebar} id="contents-panel" className={`sidebar ${drawer === 'contents' ? 'drawer-open' : ''}`} role={drawer === 'contents' && compactNavigation ? 'dialog' : undefined} aria-modal={drawer === 'contents' && compactNavigation ? true : undefined} aria-label={t('Contents')}>
          {drawerHeader(t('Contents'))}
          <div className="sidebar-title"><span>{t('Contents')}</span><span className="section-count">{t('{count} sections', { count: book.elements.length })}</span></div>
          <Navigator book={book} actions={actions} selectedId={element?.id ?? null} onSelect={(id) => { setSelectedId(id); closeDrawer(); }} />
        </aside>
        <section className="center editor-region" aria-label={t('Editor')} hidden={view !== 'edit'}>
          {element ? <ElementPane key={`${book.id}:${element.id}`} book={book} element={element} actions={actions} active={view === 'edit'} onShowBookDetails={showBookDetails} /> : <div className="empty-note">{t('Add a chapter or import a manuscript to start writing.')}</div>}
        </section>
        <section ref={preview} className={`preview-region ${drawer === 'preview' ? 'drawer-open' : ''}`} role={drawer === 'preview' && compactPanels ? 'dialog' : undefined} aria-modal={drawer === 'preview' && compactPanels ? true : undefined} aria-label={t('Live preview')}>
          {drawerHeader(t('Preview'))}
          <PreviewPanel book={book} element={element} device={device} onDevice={chooseDevice} active={previewVisible} />
        </section>
        <aside ref={inspector} id="settings-panel" className={`inspector ${drawer === 'settings' ? 'drawer-open' : ''}`} role={drawer === 'settings' && compactPanels ? 'dialog' : undefined} aria-modal={drawer === 'settings' && compactPanels ? true : undefined} aria-label={t('Book settings')} hidden={view !== 'format'}>
          {drawerHeader(t('Settings'))}
          <div className="inspector-heading"><span>{t('Book settings')}</span><small>{t('Changes apply to your book')}</small></div>
          <TabBar id="inspector" label={t('Book settings panels')} options={translated(PANELS)} value={tab} onChange={setTab} />
          <div key={tab} className="inspector-content" id={`inspector-panel-${tab}`} role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
            {tab === 'style' && <StylePanel book={book} actions={actions} />}
            {tab === 'section' && (element ? <SectionPanel book={book} element={element} actions={actions} onEdit={() => changeView('edit')} onShowBookDetails={showBookDetails} /> : <p className="empty-note">{t('Add a section to get started.')}</p>)}
            {tab === 'book' && <BookPanel key={book.id} book={book} actions={actions} spellcheckNote={spellcheckNote} />}
            {tab === 'publish' && <PublishPanel key={book.id} book={book} actions={actions} onOpen={(id) => { setSelectedId(id); changeView('edit'); }} />}
          </div>
        </aside>
        {drawer && <button type="button" className="drawer-backdrop" aria-label={t('Close panel')} tabIndex={-1} onClick={closeDrawer} />}
      </main>
      <footer className={`statusbar ${notice?.kind ?? ''}`}>
        <span className="status" role={notice?.kind === 'error' ? 'alert' : 'status'} aria-live={notice?.kind === 'error' ? 'assertive' : 'polite'}>
          {exporting ? <span className="activity-spinner" aria-hidden="true" /> : <Icon key={`icon:${notice?.message ?? ''}`} className="status-icon" name={notice?.kind === 'error' ? 'alert' : notice?.kind === 'success' ? 'check' : 'shield'} size={14} />}
          <span key={`text:${notice?.message ?? ''}`} className="status-text">{notice?.message || t('Your book stays on this device.')}</span>
        </span>
        {notice && !exporting && <button className="icon-btn" type="button" aria-label={t('Dismiss status')} onClick={() => setNotice(null)}><Icon name="close" size={14} /></button>}
        <span className="status-meta">{themeOf(book).name} · {t('{count} chapters', { count: book.elements.filter((entry) => entry.kind === 'chapter').length })}</span>
      </footer>
      {boxSetOpen && <LibraryPicker
        title={t('New box set')}
        intro={t('Gathers books from this device into one, each as a volume with its own opening page and chapters numbered from one. The box set takes the first book’s style and back matter. Your books stay as they are.')}
        confirmLabel={t('Create box set')}
        multiple
        onPick={(books) => {
          const boxSet = newBoxSet(books);
          switchTo(boxSet);
          notify(books.length === 1 ? t('Created a box set of 1 book. Give it a title in Book details.') : t('Created a box set of {count} books. Give it a title in Book details.', { count: books.length }), 'success');
        }}
        onClose={() => setBoxSetOpen(false)}
      />}
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={({ book: imported, summary }) => {
        setImportOpen(false); switchTo(imported);
        notify(t('Imported {count} chapters ({summary}).', { count: imported.elements.filter((entry) => entry.kind === 'chapter').length, summary }), 'success');
      }} />
    </div>
  );
}

function LibraryItems({ currentId, onOpen, onNewBoxSet, onError, close }: { currentId: string; onOpen: (book: Book) => void; onNewBoxSet: () => void; onError: (message: string) => void; close: () => void }) {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  useEffect(() => { void listBooks().then(setBooks, () => setBooks([])); }, []);
  return <>
    <button type="button" role="menuitem" onClick={() => { close(); onOpen(newBook()); }}><Icon name="plus" />{t('New blank book')}</button>
    <button type="button" role="menuitem" onClick={() => { close(); onOpen(sampleBook()); }}><Icon name="book" />{t('New copy of the sample book')}</button>
    <button type="button" role="menuitem" onClick={() => { close(); onNewBoxSet(); }}><Icon name="library" />{t('New box set…')}</button>
    <div className="menu-sep" /><div className="menu-label">{t('On this device')}</div>
    {books === null && <div className="menu-note">{t('Loading…')}</div>}
    {books?.length === 0 && <div className="menu-note">{t('No saved books yet.')}</div>}
    {books?.map((entry) => <div className={`menu-book${entry.id === currentId ? ' is-current' : ''}`} key={entry.id}>
      <button type="button" role="menuitem" onClick={() => { close(); void loadBook(entry.id).then((next) => next ? onOpen(next) : onError(t('That book could not be found.')), () => onError(t('That book could not be opened.'))); }}><span>{entry.title || t('Untitled')}</span><small>{new Date(entry.updatedAt).toLocaleString()}</small></button>
      {entry.id !== currentId && <button type="button" role="menuitem" className="icon-btn danger" aria-label={t('Delete {title}', { title: entry.title })} onClick={() => {
        if (!window.confirm(t('Delete “{title}” from this device? Save a .recto copy first if you want to keep it.', { title: entry.title }))) return;
        void deleteBook(entry.id).then(() => listBooks().then(setBooks)).catch(() => onError(t('That book could not be deleted.')));
      }}><Icon name="trash" size={14} /></button>}
    </div>)}
  </>;
}
