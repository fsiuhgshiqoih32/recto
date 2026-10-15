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
import { parseBook } from '../store/file';
import { applyTheme, resolveTheme, type UiThemeChoice, useAppearance } from './appearance';
import { AppearanceMenu } from './AppearanceMenu';
import { DropdownMenu } from './DropdownMenu';
import { ElementPane } from './ElementPane';
import { exportEpub, exportStoreEditions, printBook, savePdfDesktop, saveRectoFile } from './exporters';
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

type WorkspaceView = 'format' | 'edit';
type InspectorTab = 'style' | 'section' | 'book' | 'publish';
type Drawer = 'contents' | 'settings' | 'preview' | null;
type Notice = { kind: 'info' | 'success' | 'error' | 'busy'; message: string };
const VIEWS = [{ id: 'format', label: 'Format' }, { id: 'edit', label: 'Edit' }] as const;
const PANELS = [{ id: 'style', label: 'Style' }, { id: 'section', label: 'Section' }, { id: 'book', label: 'Book' }, { id: 'publish', label: 'Publish' }] as const;
type ExportFormat = 'epub' | 'stores' | 'pdf';
const EXPORT_PROGRESS: Record<ExportFormat, string> = { epub: 'Building EPUB…', stores: 'Building an EPUB for each store…', pdf: 'Laying out every page…' };
const EXPORT_NAME: Record<ExportFormat, string> = { epub: 'EPUB', stores: 'Store edition', pdf: 'PDF' };
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
  const elementTitle = element?.title || (element ? KIND_LABEL[element.kind] : 'Your manuscript');
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
    notify(EXPORT_PROGRESS[format], 'busy');
    try {
      if (format === 'epub') {
        const bytes = await exportEpub(book);
        notify(`EPUB downloaded (${formatSize(bytes)}; KDP delivery costs ${feeText(bytes)} a sale).`, 'success');
      } else if (format === 'stores') {
        const count = await exportStoreEditions(book);
        notify(`Downloaded ${count} store editions in one zip. Upload each store’s EPUB to that store.`, 'success');
      }
      else if (desktop) {
        const saved = await savePdfDesktop(book, (pages) => notify(`Laid out ${pages} pages. Choose where to save the PDF…`, 'busy'));
        notify(saved ? `Saved ${saved.pages}-page PDF to ${saved.path}` : 'PDF export canceled.', saved ? 'success' : 'info');
      } else {
        await printBook(book, (pages) => notify(`Laid out ${pages} pages. Opening the print dialog…`, 'busy'));
        notify('Print dialog opened. Choose “Save as PDF” to save your book.', 'success');
      }
    } catch (error) { notify(`${EXPORT_NAME[format]} export failed: ${error instanceof Error ? error.message : error}`, 'error'); }
    finally { exportLock.current = false; setExporting(false); }
  };
  const openText = (name: string, text: string) => {
    try { switchTo(parseBook(text)); notify(`Opened ${name}.`, 'success'); }
    catch (error) { notify(error instanceof Error ? error.message : 'That file could not be opened.', 'error'); }
  };
  const openFile = async (file: File) => {
    try { openText(file.name, await file.text()); }
    catch (error) { notify(error instanceof Error ? error.message : 'That file could not be read.', 'error'); }
  };
  useEffect(() => {
    let current = true;
    const name = languageInfo(book.meta.language).name;
    if (!desktop) { setSpellcheckNote('Spellcheck uses your browser’s languages'); return; }
    desktop.setSpellcheckLanguages([book.meta.language])
      .then(({ applied }) => current && setSpellcheckNote(
        // macOS spellchecks with the system's dictionaries, which detect the language themselves.
        applied[0] === 'system' ? 'Spellchecking with macOS’s dictionaries'
          : applied.length ? `Spellchecking in ${name} (${applied.join(', ')})` : `No ${name} spelling dictionary is available`,
      ))
      .catch(() => current && setSpellcheckNote(undefined));
    return () => { current = false; };
  }, [book.meta.language]);
  const commands = useRef({ runExport, openText, switchTo, book });
  commands.current = { runExport, openText, switchTo, book };
  useEffect(() => {
    if (!desktop) return;
    void desktop.takePendingFile().then((file) => file && commands.current.openText(file.name, file.text));
    const offOpen = desktop.onOpenFile((file) => commands.current.openText(file.name, file.text));
    const offMenu = desktop.onMenu((command) => {
      const current = commands.current;
      if (command === 'import') setImportOpen(true);
      else if (command === 'open') openInput.current?.click();
      else if (command === 'save') saveRectoFile(current.book);
      else if (command === 'export-epub') void current.runExport('epub');
      else if (command === 'export-pdf') void current.runExport('pdf');
      else if (command === 'new-book') current.switchTo(newBook());
    });
    return () => { offOpen(); offMenu(); };
  }, []);
  const showBookDetails = () => { setTab('book'); setView('format'); if (compactPanels) setDrawer('settings'); };
  const drawerHeader = (title: string) => <div className="drawer-heading"><strong>{title}</strong><button className="icon-btn" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={closeDrawer}><Icon name="close" /></button></div>;

  return (
    <div className="app" data-view={view} data-preview={showPreview}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><BrandMark /></span><span className="brand-name">Recto</span></div>
        <div className="file-actions">
          <DropdownMenu label="File" button={<>File <Icon name="chevron" size={12} /></>}>
            {(close) => <>
              <button type="button" role="menuitem" onClick={() => { close(); setImportOpen(true); }}><Icon name="upload" />Import manuscript…</button>
              <button type="button" role="menuitem" onClick={() => { close(); openInput.current?.click(); }}><Icon name="file" />Open Recto file…</button>
              <button type="button" role="menuitem" onClick={() => { close(); saveRectoFile(book); }}><Icon name="download" />Save a copy (.recto)</button>
            </>}
          </DropdownMenu>
          <DropdownMenu label="Books" button={<><Icon name="library" /><span>Books</span><Icon name="chevron" size={12} /></>}>
            {(close) => <LibraryItems currentId={book.id} onOpen={switchTo} onError={(message) => notify(message, 'error')} close={close} />}
          </DropdownMenu>
        </div>
        <div className="book-title" title={book.meta.title}>
          <span>{book.meta.title || 'Untitled'}</span>
          <span className="book-sub"><span className={`save-dot ${saveState}`} aria-hidden="true" />{wordCount(book).toLocaleString()} words · {saveState === 'saved' ? (desktop ? 'Saved' : 'Saved in this browser') : saveState === 'saving' ? 'Saving…' : 'Not saved (storage unavailable)'}</span>
        </div>
        <TabBar id="workspace" label="Workspace view" options={VIEWS} value={view} onChange={changeView} className="segmented view-switch" />
        <div className="topbar-actions">
          <AppearanceMenu choice={appearance} resolved={resolvedTheme} onChoose={chooseAppearance} />
          <DropdownMenu label="Export" align="right" className="btn btn-primary export-button" disabled={exporting} button={<><Icon name="download" />{exporting ? 'Exporting…' : 'Export'}<Icon name="chevron" size={12} /></>}>
            {(close) => <>
              <div className="menu-label">Export your book</div>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('epub'); }}><Icon name="book" /><span>Export EPUB<small>For e-readers and ebook stores</small></span></button>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('stores'); }}><Icon name="storeLink" /><span>EPUB for each store<small>{hasNode(book, 'storeLinks') ? 'Each links only to its own store, in one zip' : 'Same as one EPUB until the book has store links'}</small></span></button>
              <button type="button" role="menuitem" onClick={() => { close(); void runExport('pdf'); }}><Icon name="printer" /><span>{desktop ? 'Export PDF' : 'Print PDF'}<small>{desktop ? 'Save a print-ready PDF' : 'Print or save as PDF'}</small></span></button>
            </>}
          </DropdownMenu>
        </div>
        <input ref={openInput} type="file" accept=".recto,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void openFile(file); event.target.value = ''; }} />
      </header>
      <div className="workspace-toolbar">
        <button type="button" className="btn btn-quiet contents-toggle" aria-expanded={drawer === 'contents'} aria-controls="contents-panel" onClick={() => setDrawer('contents')}><Icon name="contents" />Contents</button>
        <div className="workspace-context"><span>{view === 'format' ? 'Book layout' : 'Manuscript'}</span><span className="context-divider">/</span><strong title={elementTitle}>{elementTitle}</strong></div>
        <div className="workspace-controls">
          {view === 'format' ? <button type="button" className="btn btn-quiet settings-toggle" aria-expanded={drawer === 'settings'} aria-controls="settings-panel" onClick={() => setDrawer('settings')}><Icon name="settings" />Settings</button> :
            <button type="button" className="btn btn-quiet preview-toggle" aria-pressed={compactPanels ? drawer === 'preview' : showPreview} onClick={() => compactPanels ? setDrawer('preview') : togglePreview()}><Icon name="preview" />{!compactPanels && showPreview ? 'Hide preview' : 'Preview'}</button>}
        </div>
      </div>
      <main className="workspace" id={`workspace-panel-${view}`} role="tabpanel" aria-labelledby={`workspace-tab-${view}`}>
        <aside ref={sidebar} id="contents-panel" className={`sidebar ${drawer === 'contents' ? 'drawer-open' : ''}`} role={drawer === 'contents' && compactNavigation ? 'dialog' : undefined} aria-modal={drawer === 'contents' && compactNavigation ? true : undefined} aria-label="Contents">
          {drawerHeader('Contents')}
          <div className="sidebar-title"><span>Contents</span><span className="section-count">{book.elements.length} sections</span></div>
          <Navigator book={book} actions={actions} selectedId={element?.id ?? null} onSelect={(id) => { setSelectedId(id); closeDrawer(); }} />
        </aside>
        <section className="center editor-region" aria-label="Editor" hidden={view !== 'edit'}>
          {element ? <ElementPane key={`${book.id}:${element.id}`} book={book} element={element} actions={actions} active={view === 'edit'} onShowBookDetails={showBookDetails} /> : <div className="empty-note">Add a chapter or import a manuscript to start writing.</div>}
        </section>
        <section ref={preview} className={`preview-region ${drawer === 'preview' ? 'drawer-open' : ''}`} role={drawer === 'preview' && compactPanels ? 'dialog' : undefined} aria-modal={drawer === 'preview' && compactPanels ? true : undefined} aria-label="Live preview">
          {drawerHeader('Preview')}
          <PreviewPanel book={book} element={element} device={device} onDevice={chooseDevice} active={previewVisible} />
        </section>
        <aside ref={inspector} id="settings-panel" className={`inspector ${drawer === 'settings' ? 'drawer-open' : ''}`} role={drawer === 'settings' && compactPanels ? 'dialog' : undefined} aria-modal={drawer === 'settings' && compactPanels ? true : undefined} aria-label="Book settings" hidden={view !== 'format'}>
          {drawerHeader('Settings')}
          <div className="inspector-heading"><span>Book settings</span><small>Changes apply to your book</small></div>
          <TabBar id="inspector" label="Book settings panels" options={PANELS} value={tab} onChange={setTab} />
          <div key={tab} className="inspector-content" id={`inspector-panel-${tab}`} role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
            {tab === 'style' && <StylePanel book={book} actions={actions} />}
            {tab === 'section' && (element ? <SectionPanel book={book} element={element} actions={actions} onEdit={() => changeView('edit')} onShowBookDetails={showBookDetails} /> : <p className="empty-note">Add a section to get started.</p>)}
            {tab === 'book' && <BookPanel key={book.id} book={book} actions={actions} spellcheckNote={spellcheckNote} />}
            {tab === 'publish' && <PublishPanel key={book.id} book={book} actions={actions} onOpen={(id) => { setSelectedId(id); changeView('edit'); }} />}
          </div>
        </aside>
        {drawer && <button type="button" className="drawer-backdrop" aria-label="Close panel" tabIndex={-1} onClick={closeDrawer} />}
      </main>
      <footer className={`statusbar ${notice?.kind ?? ''}`}>
        <span className="status" role={notice?.kind === 'error' ? 'alert' : 'status'} aria-live={notice?.kind === 'error' ? 'assertive' : 'polite'}>
          {exporting ? <span className="activity-spinner" aria-hidden="true" /> : <Icon key={`icon:${notice?.message ?? ''}`} className="status-icon" name={notice?.kind === 'error' ? 'alert' : notice?.kind === 'success' ? 'check' : 'shield'} size={14} />}
          <span key={`text:${notice?.message ?? ''}`} className="status-text">{notice?.message || 'Your book stays on this device.'}</span>
        </span>
        {notice && !exporting && <button className="icon-btn" type="button" aria-label="Dismiss status" onClick={() => setNotice(null)}><Icon name="close" size={14} /></button>}
        <span className="status-meta">{themeOf(book).name} · {book.elements.filter((entry) => entry.kind === 'chapter').length} chapters</span>
      </footer>
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={({ book: imported, summary }) => {
        setImportOpen(false); switchTo(imported);
        notify(`Imported ${imported.elements.filter((entry) => entry.kind === 'chapter').length} chapters (${summary}).`, 'success');
      }} />
    </div>
  );
}

function LibraryItems({ currentId, onOpen, onError, close }: { currentId: string; onOpen: (book: Book) => void; onError: (message: string) => void; close: () => void }) {
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  useEffect(() => { void listBooks().then(setBooks, () => setBooks([])); }, []);
  return <>
    <button type="button" role="menuitem" onClick={() => { close(); onOpen(newBook()); }}><Icon name="plus" />New blank book</button>
    <button type="button" role="menuitem" onClick={() => { close(); onOpen(sampleBook()); }}><Icon name="book" />New copy of the sample book</button>
    <div className="menu-sep" /><div className="menu-label">On this device</div>
    {books === null && <div className="menu-note">Loading…</div>}
    {books?.length === 0 && <div className="menu-note">No saved books yet.</div>}
    {books?.map((entry) => <div className={`menu-book${entry.id === currentId ? ' is-current' : ''}`} key={entry.id}>
      <button type="button" role="menuitem" onClick={() => { close(); void loadBook(entry.id).then((next) => next ? onOpen(next) : onError('That book could not be found.'), () => onError('That book could not be opened.')); }}><span>{entry.title || 'Untitled'}</span><small>{new Date(entry.updatedAt).toLocaleString()}</small></button>
      {entry.id !== currentId && <button type="button" role="menuitem" className="icon-btn danger" aria-label={`Delete ${entry.title}`} onClick={() => {
        if (!window.confirm(`Delete “${entry.title}” from this device? Save a .recto copy first if you want to keep it.`)) return;
        void deleteBook(entry.id).then(() => listBooks().then(setBooks)).catch(() => onError('That book could not be deleted.'));
      }}><Icon name="trash" size={14} /></button>}
    </div>)}
  </>;
}
