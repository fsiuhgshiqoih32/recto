// Recto's desktop shell. Serves the built web app from a private app:// origin,
// exports PDFs with Chromium's printToPDF, runs the spellchecker in the book's
// language and opens .recto files from the file manager.

import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BrowserWindow,
  type ContextMenuParams,
  Menu,
  type MenuItemConstructorOptions,
  type WebContents,
  app,
  dialog,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
} from 'electron';

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://recto`;
const DIST = join(__dirname, '..', 'dist');

// Tests run against a throwaway profile instead of the user's library.
if (process.env.RECTO_USER_DATA) app.setPath('userData', process.env.RECTO_USER_DATA);

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

interface OpenedFile {
  name: string;
  text: string;
}

let mainWindow: BrowserWindow | null = null;
let printWindow: BrowserWindow | null = null;
let pendingFile: OpenedFile | null = null;
/** Print documents waiting to be loaded by the print window, by id. */
const printDocuments = new Map<string, string>();

const debug = (...args: unknown[]) => {
  if (process.env.RECTO_DEBUG) console.log('[recto]', ...args);
};

const rectoPathIn = (argv: string[]) => argv.find((arg) => arg.toLowerCase().endsWith('.recto'));

async function readRecto(path: string): Promise<OpenedFile | null> {
  try {
    return { name: basename(path), text: await readFile(path, 'utf8') };
  } catch {
    return null;
  }
}

function serveApp(): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== 'recto') return new Response('Not found', { status: 404 });
    if (url.pathname.startsWith('/__print/')) {
      const html = printDocuments.get(url.pathname.slice('/__print/'.length));
      return html
        ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
        : new Response('Not found', { status: 404 });
    }
    const file = normalize(join(DIST, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(DIST + sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function showContextMenu(contents: WebContents, params: ContextMenuParams): void {
  const items: MenuItemConstructorOptions[] = [];
  if (params.misspelledWord) {
    for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
      items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
    }
    if (!params.dictionarySuggestions.length) items.push({ label: 'No spelling suggestions', enabled: false });
    items.push(
      { label: `Add “${params.misspelledWord}” to Dictionary`, click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord) },
      { type: 'separator' },
    );
  }
  if (params.isEditable) {
    items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
  } else if (params.selectionText.trim()) {
    items.push({ role: 'copy' });
  }
  if (!app.isPackaged) items.push({ type: 'separator' }, { label: 'Inspect Element', click: () => contents.inspectElement(params.x, params.y) });
  if (items.length) Menu.buildFromTemplate(items).popup();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Recto',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1a18' : '#faf8f4',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  contents.on('context-menu', (_event, params) => showContextMenu(contents, params));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(`${ORIGIN}/index.html`);
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const send = (command: string) => () => mainWindow?.webContents.send('menu', command);
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Book', accelerator: 'CmdOrCtrl+N', click: send('new-book') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: send('open') },
        { label: 'Import Manuscript…', accelerator: 'CmdOrCtrl+Shift+O', click: send('import') },
        { label: 'Save a Copy…', accelerator: 'CmdOrCtrl+S', click: send('save') },
        { type: 'separator' },
        { label: 'Export EPUB…', accelerator: 'CmdOrCtrl+E', click: send('export-epub') },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+P', click: send('export-pdf') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : ([{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[])),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'About Recto',
          click: () =>
            void dialog.showMessageBox(mainWindow!, {
              title: 'About Recto',
              message: `Recto ${app.getVersion()}`,
              detail: 'A free, open-source book formatter.\nMIT license. Fonts under the SIL Open Font License.',
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Matches book languages to the spellchecker's dictionaries ("es-MX" → "es-MX" or "es"). */
function pickDictionaries(codes: string[], available: string[]): string[] {
  const preferred: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', no: 'nb', nn: 'nb' };
  const find = (code: string) => available.find((a) => a.toLowerCase() === code.toLowerCase());
  const pick = (code: string) => {
    const base = code.toLowerCase().split('-')[0];
    return (
      find(code) ??
      find(preferred[base] ?? '') ??
      find(base) ??
      available.find((a) => a.toLowerCase().startsWith(`${base}-`))
    );
  };
  return [...new Set(codes.map(pick).filter((code): code is string => !!code))];
}

async function waitForLayout(contents: WebContents, timeoutMs = 180_000): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const pages = (await contents.executeJavaScript('window.__rectoPages || 0')) as number;
    if (pages) return pages;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('The print layout took too long.');
}

function closePrintWindow(): void {
  printDocuments.clear();
  if (printWindow && !printWindow.isDestroyed()) printWindow.destroy();
  printWindow = null;
}

function registerIpc(): void {
  ipcMain.handle('spellcheck:set-languages', (event, codes: string[]) => {
    // macOS always uses the system spellchecker, which picks languages itself.
    if (process.platform === 'darwin') return { applied: ['system'] };
    const spellSession = event.sender.session;
    const applied = pickDictionaries(codes, spellSession.availableSpellCheckerLanguages);
    // With no dictionary for the language, switch spellchecking off rather than
    // leave the previous book's dictionary marking up this one.
    spellSession.setSpellCheckerEnabled(applied.length > 0);
    if (applied.length) spellSession.setSpellCheckerLanguages(applied);
    return { applied };
  });

  ipcMain.handle('pdf:layout', async (_event, html: string) => {
    const id = randomUUID();
    printDocuments.clear();
    printDocuments.set(id, html);
    if (!printWindow || printWindow.isDestroyed()) {
      printWindow = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        // Offscreen rendering keeps animation frames running at full rate, which paged.js
        // paces its layout by; a merely hidden window is throttled to a crawl.
        webPreferences: { sandbox: true, contextIsolation: true, spellcheck: false, backgroundThrottling: false, offscreen: true },
      });
    }
    const started = Date.now();
    await printWindow.loadURL(`${ORIGIN}/__print/${id}`);
    debug('print document loaded in', Date.now() - started, 'ms');
    const pages = await waitForLayout(printWindow.webContents);
    debug('laid out', pages, 'pages in', Date.now() - started, 'ms');
    return { pages };
  });

  ipcMain.handle('pdf:save', async (_event, fileName: string) => {
    if (!printWindow || printWindow.isDestroyed()) throw new Error('Nothing has been laid out yet.');
    const choice = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export PDF',
      defaultPath: join(app.getPath('documents'), fileName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (choice.canceled || !choice.filePath) {
      closePrintWindow();
      return null;
    }
    const started = Date.now();
    const pdf = await printWindow.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true });
    debug('printToPDF took', Date.now() - started, 'ms');
    await writeFile(choice.filePath, pdf);
    closePrintWindow();
    return { path: choice.filePath };
  });

  ipcMain.handle('pdf:cancel', () => closePrintWindow());

  ipcMain.handle('file:take-pending', () => {
    const file = pendingFile;
    pendingFile = null;
    return file;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A second launch (e.g. double-clicking another .recto file) hands its file to this window.
  app.on('second-instance', async (_event, argv) => {
    const path = rectoPathIn(argv);
    const file = path ? await readRecto(path) : null;
    if (mainWindow) {
      if (file) mainWindow.webContents.send('file:open', file);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  // macOS delivers opened files as an event instead of argv.
  app.on('open-file', async (event, path) => {
    event.preventDefault();
    const file = await readRecto(path);
    if (!file) return;
    if (mainWindow) mainWindow.webContents.send('file:open', file);
    else pendingFile = file;
  });

  app.whenReady().then(async () => {
    const path = rectoPathIn(process.argv);
    if (path) pendingFile = await readRecto(path);
    serveApp();
    registerIpc();
    // EPUB and .recto downloads: offer the Documents folder. Registered once on the
    // shared session; windows come and go (macOS reopens them from the Dock).
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ defaultPath: join(app.getPath('documents'), item.getFilename()) });
    });
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
