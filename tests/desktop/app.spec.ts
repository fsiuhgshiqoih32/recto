import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ElectronApplication, type Page, _electron as electron, expect, test } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName } from '@pdfme/pdf-lib';
import { findGhostscript } from '../../src/export/print/pdfx';

// RECTO_APP points at a packaged build (release/win-unpacked/Recto.exe) to test the installer's payload.
const executable = process.env.RECTO_APP;

let profile: string;
let app: ElectronApplication;
let window: Page;

async function launch(...files: string[]) {
  return launchWith({}, ...files);
}

async function launchWith(env: Record<string, string>, ...files: string[]) {
  profile = mkdtempSync(join(tmpdir(), 'recto-test-'));
  app = await electron.launch({
    ...(executable ? { executablePath: executable, args: files } : { args: ['.', ...files] }),
    env: { ...process.env, RECTO_USER_DATA: profile, ...env },
  });
  window = await app.firstWindow();
  // A packaged app's first start on a CI machine can take a while.
  await expect(window.locator('.book-title')).toContainText(/\w/, { timeout: 30_000 });
}

test.afterEach(async () => {
  await app?.close();
  rmSync(profile, { recursive: true, force: true });
});

test('runs the app from its private origin and saves the library', async () => {
  await launch();
  expect(window.url()).toBe('app://recto/index.html');
  await expect(window.locator('.book-title')).toContainText('The Lamp at Harrow Point');
  await expect(window.locator('.book-sub')).toContainText('Saved');
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(window.getByRole('menuitem', { name: /^Export PDF/ })).toBeVisible();
  await window.keyboard.press('Escape');
  // Fonts and paged.js load through the app:// handler: the print preview lays out.
  await window.getByRole('tab', { name: 'Print' }).click();
  await expect(window.locator('.print-info')).toHaveText(/· \d+ pages?$/, { timeout: 30_000 });
});

// macOS always spellchecks with the system's own dictionaries, which pick the language themselves.
const mac = process.platform === 'darwin';

test('spellchecks in the book’s language', async () => {
  await launch();
  const languages = () => app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages());
  await window.getByRole('tab', { name: 'Book' }).click();
  await expect(window.getByText(mac ? /Spellchecking with macOS/ : /Spellchecking in English/)).toBeVisible();
  if (!mac) expect((await languages()).some((l) => l.startsWith('en'))).toBe(true);

  await window.locator('.inspector').getByLabel('Language', { exact: true }).selectOption('es');
  if (!mac) {
    await expect(window.getByText(/Spellchecking in Spanish/)).toBeVisible();
    expect((await languages()).some((l) => l.startsWith('es'))).toBe(true);
  }
  // The editor carries the language so the spellchecker and right-to-left layout follow it.
  await expect(window.locator('.editor-page')).toHaveAttribute('lang', 'es');
  await expect(window.locator('.editor-page')).toHaveAttribute('spellcheck', 'true');
  // Default headings follow the language.
  const contents = window.getByRole('button', { name: 'Contents', exact: true });
  const compactNavigation = await contents.isVisible();
  if (compactNavigation) await contents.click();
  await expect(window.locator('.nav-primary', { hasText: 'Índice' })).toBeVisible();
  if (compactNavigation) await window.getByRole('button', { name: 'Close contents' }).click();

  if (mac) return;
  // No Arabic dictionary: spellchecking switches off instead of leaving Spanish running.
  const enabled = () => app.evaluate(({ session }) => session.defaultSession.isSpellCheckerEnabled());
  await window.locator('.inspector').getByLabel('Language', { exact: true }).selectOption('ar');
  await expect(window.getByText(/No Arabic spelling dictionary/)).toBeVisible();
  expect(await enabled()).toBe(false);
  await window.locator('.inspector').getByLabel('Language', { exact: true }).selectOption('en');
  await expect(window.getByText(/Spellchecking in English/)).toBeVisible();
  expect(await enabled()).toBe(true);
});

test('exports a print-ready PDF straight to a file', async () => {
  await launch();
  const out = join(profile, 'book.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, out);
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^Export PDF/ }).click();
  await expect(window.locator('.status')).toContainText('Saved', { timeout: 60_000 });

  const pdf = await getDocument({ data: new Uint8Array(readFileSync(out)) }).promise;
  expect(pdf.numPages).toBeGreaterThan(20);
  const [, , width, height] = (await pdf.getPage(1)).view;
  expect([Math.round(width), Math.round(height)]).toEqual([396, 612]);
});

test('exports a PDF for reading with bookmarks and live links', async () => {
  await launch();
  const out = join(profile, 'book-reading.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, out);
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^PDF for reading/ }).click();
  await expect(window.locator('.status')).toContainText('Saved', { timeout: 60_000 });

  const pdf = await getDocument({ data: new Uint8Array(readFileSync(out)) }).promise;
  expect((await pdf.getOutline())?.length).toBeGreaterThan(5);
  let links = 0;
  for (let i = 1; i <= Math.min(pdf.numPages, 8); i++) links += (await (await pdf.getPage(i)).getAnnotations()).filter((a: { subtype: string }) => a.subtype === 'Link').length;
  expect(links).toBeGreaterThan(5);
});

test('lays out a right-to-left book', async () => {
  await launch();
  const out = join(profile, 'arabic.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, out);
  await window.getByRole('tab', { name: 'Book' }).click();
  await window.locator('.inspector').getByLabel('Language', { exact: true }).selectOption('ar');
  await expect(window.locator('.editor-page')).toHaveAttribute('dir', 'rtl');
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^Export PDF/ }).click();
  await expect(window.locator('.status')).toContainText('Saved', { timeout: 60_000 });
  const bytes = readFileSync(out);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
});

test('opens a .recto file passed on the command line', async () => {
  await launch(resolve('samples/the-lamp-at-harrow-point.recto'));
  await expect(window.locator('.status')).toContainText('Opened the-lamp-at-harrow-point.recto');
});

test('handles PDF cancellation and allows another export', async () => {
  await launch();
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as typeof dialog.showSaveDialog;
  });
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^Export PDF/ }).click();
  await expect(window.locator('.status')).toContainText('PDF export canceled.', { timeout: 60_000 });
  await expect(window.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});

test('shows persistent desktop export errors and unlocks the controls', async () => {
  await launch();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('pdf:layout');
    ipcMain.handle('pdf:layout', () => { throw new Error('Layout unavailable'); });
  });
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^Export PDF/ }).click();
  await expect(window.getByRole('alert')).toContainText('Layout unavailable');
  await expect(window.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await window.getByRole('button', { name: 'Dismiss status' }).click();
  await expect(window.getByRole('status')).toContainText('Your book stays on this device');
});

const clickMenu = (id: string) => app.evaluate(({ Menu }, itemId) => Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click(), id);

test('saves the book in place and asks before overwriting a file changed elsewhere', async () => {
  await launch();
  const out = join(profile, 'harrow.recto');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, out);
  await clickMenu('save');
  await expect(window.locator('.status')).toContainText(`Saved to ${out}`);
  expect(JSON.parse(readFileSync(out, 'utf8')).book.meta.title).toBe('The Lamp at Harrow Point');

  // Saving again writes in place, without a dialog.
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => { throw new Error('should not ask'); }) as typeof dialog.showSaveDialog;
  });
  await window.getByRole('tab', { name: 'Book', exact: true }).click();
  await window.locator('.inspector').getByLabel('Title', { exact: true }).fill('Harrow, Revised');
  await clickMenu('save');
  await expect.poll(() => JSON.parse(readFileSync(out, 'utf8')).book.meta.title).toBe('Harrow, Revised');

  // Another computer changes the file (through a synced folder, say).
  writeFileSync(out, readFileSync(out, 'utf8').replace('Harrow, Revised', 'Edited Elsewhere'));
  const later = new Date(Date.now() + 60_000);
  utimesSync(out, later, later);
  await window.locator('.inspector').getByLabel('Title', { exact: true }).fill('Harrow, Third Draft');
  window.once('dialog', (dialog) => void dialog.dismiss());
  await clickMenu('save');
  await expect(window.locator('.status')).toContainText('Not saved: the file on disk changed');
  expect(JSON.parse(readFileSync(out, 'utf8')).book.meta.title).toBe('Edited Elsewhere');

  window.once('dialog', (dialog) => void dialog.accept());
  await clickMenu('save');
  await expect.poll(() => JSON.parse(readFileSync(out, 'utf8')).book.meta.title).toBe('Harrow, Third Draft');
});

test('checks GitHub for a newer release only when asked', async () => {
  let tag = 'v99.0.0';
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ tag_name: tag, html_url: `https://github.com/fsiuhgshiqoih32/recto/releases/tag/${tag}` }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    await launchWith({ RECTO_RELEASES_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/latest` });
    expect(requests).toBe(0);
    await app.evaluate(({ dialog }) => {
      const seen: string[] = ((globalThis as { messages?: string[] }).messages = []);
      dialog.showMessageBox = (async (...args: unknown[]) => {
        seen.push((args[args.length - 1] as { message: string }).message);
        return { response: 1, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
    });
    const messages = () => app.evaluate(() => (globalThis as { messages?: string[] }).messages ?? []);
    await clickMenu('check-updates');
    await expect.poll(messages).toEqual(['Recto 99.0.0 is available.']);
    tag = `v${await app.evaluate(({ app: electronApp }) => electronApp.getVersion())}`;
    await clickMenu('check-updates');
    await expect.poll(messages).toEqual(['Recto 99.0.0 is available.', 'Recto is up to date.']);
  } finally {
    server.close();
  }
});

test('opens the book in Kindle Previewer when it is installed', async () => {
  // Any program stands in for Kindle Previewer: the test checks what Recto hands it.
  await launchWith({ RECTO_KINDLE_PREVIEWER: process.execPath });
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^Preview in Kindle Previewer/ }).click();
  await expect(window.locator('.status')).toContainText('Opened in Kindle Previewer');
  const epub = join(tmpdir(), 'recto-kindle', 'the-lamp-at-harrow-point.epub');
  expect(existsSync(epub)).toBe(true);
  expect(readFileSync(epub).subarray(0, 2).toString()).toBe('PK');
});

test('exports PDF/X-1a through an installed Ghostscript', async () => {
  const gs = await findGhostscript();
  test.skip(!gs, 'Ghostscript is not installed');
  await launch();
  const out = join(profile, 'book-pdfx.pdf');
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: path })) as typeof dialog.showSaveDialog;
  }, out);
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByRole('menuitem', { name: /^PDF\/X-(1a|3)/ }).click();
  await expect(window.locator('.status')).toContainText(/Saved \d+-page PDF\/X-(1a|3)/, { timeout: 120_000 });
  const bytes = readFileSync(out);
  expect(bytes.subarray(0, 8).toString()).toBe('%PDF-1.3');
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  // No object streams, so the document info is readable as it stands.
  expect(bytes.toString('latin1')).toMatch(/\/GTS_PDFXVersion\s*\(PDF\/X-[13]/);
  expect(String(pdf.catalog.get(PDFName.of('OutputIntents')))).toBeTruthy();
  expect(pdf.getPages().every((page) => page.node.get(PDFName.of('TrimBox')))).toBe(true);
});
