import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { type ElectronApplication, type Page, _electron as electron, expect, test } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// RECTO_APP points at a packaged build (release/win-unpacked/Recto.exe) to test the installer's payload.
const executable = process.env.RECTO_APP;

let profile: string;
let app: ElectronApplication;
let window: Page;

async function launch(...files: string[]) {
  profile = mkdtempSync(join(tmpdir(), 'recto-test-'));
  app = await electron.launch({
    ...(executable ? { executablePath: executable, args: files } : { args: ['.', ...files] }),
    env: { ...process.env, RECTO_USER_DATA: profile },
  });
  window = await app.firstWindow();
  await expect(window.locator('.book-title')).toContainText(/\w/);
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

test('spellchecks in the book’s language', async () => {
  await launch();
  const languages = () => app.evaluate(({ session }) => session.defaultSession.getSpellCheckerLanguages());
  await window.getByRole('tab', { name: 'Book' }).click();
  await expect(window.getByText(/Spellchecking in English/)).toBeVisible();
  expect((await languages()).some((l) => l.startsWith('en'))).toBe(true);

  await window.locator('.inspector').getByLabel('Language', { exact: true }).selectOption('es');
  await expect(window.getByText(/Spellchecking in Spanish/)).toBeVisible();
  expect((await languages()).some((l) => l.startsWith('es'))).toBe(true);
  // The editor carries the language so the spellchecker and right-to-left layout follow it.
  await expect(window.locator('.editor-page')).toHaveAttribute('lang', 'es');
  await expect(window.locator('.editor-page')).toHaveAttribute('spellcheck', 'true');
  // Default headings follow the language.
  const contents = window.getByRole('button', { name: 'Contents', exact: true });
  const compactNavigation = await contents.isVisible();
  if (compactNavigation) await contents.click();
  await expect(window.locator('.nav-primary', { hasText: 'Índice' })).toBeVisible();
  if (compactNavigation) await window.getByRole('button', { name: 'Close contents' }).click();

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
