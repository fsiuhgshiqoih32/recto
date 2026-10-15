import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import JSZip from 'jszip';

const nav = (page: import('@playwright/test').Page, title: string | RegExp) =>
  page.locator('.nav-select').filter({ hasText: title });

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.book-title')).toContainText('The Lamp at Harrow Point');
});

test.afterEach(() => {
  expect(errors, 'uncaught errors in the page').toEqual([]);
});

test('edits a chapter and keeps the change after a reload', async ({ page }) => {
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await nav(page, 'Fog Season').click();
  await expect(page.locator('.element-kind')).toHaveText('Chapter Two');
  await page.getByLabel('Title', { exact: true }).fill('Fog, Mostly');
  await expect(nav(page, 'Fog, Mostly')).toBeVisible();

  await page.locator('.manuscript').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' The end of the fog.');
  await expect(page.locator('.book-sub')).toContainText('Saved in this browser');

  await page.reload();
  await expect(nav(page, 'Fog, Mostly')).toBeVisible();
  await nav(page, 'Fog, Mostly').click();
  await expect(page.locator('.manuscript')).toContainText('The end of the fog.');
});

test('previews the ebook in the chosen style', async ({ page }) => {
  await nav(page, 'The Inventory').click();
  const preview = page.frameLocator('iframe[title="Ebook preview"]');
  await expect(preview.locator('.chapter-label')).toHaveText('Chapter One');
  await expect(preview.locator('.dropcap')).toHaveText('T');

  await page.getByRole('tab', { name: 'Style' }).click();
  await page.getByRole('radio', { name: /Ledger/ }).click();
  await expect(page.locator('.preview-region')).toBeVisible();
  await expect(preview.locator('.chapter-label')).toHaveText('1');
  await expect(preview.locator('.dropcap')).toHaveCount(0);
});

test('lays out print pages with paged.js', async ({ page }) => {
  await nav(page, 'The Inventory').click();
  await page.getByRole('tab', { name: 'Print' }).click();
  await expect(page.locator('.print-info')).toHaveText(/5\.5 × 8\.5 in · \d+ pages?$/, { timeout: 30_000 });
  const frame = page.frameLocator('iframe[title="Print preview"]');
  await expect(frame.locator('.pagedjs_page').first()).toBeVisible();
  await expect(frame.locator('.pagedjs_page')).not.toHaveCount(0);

  await page.getByRole('tab', { name: 'Whole book' }).click();
  await expect(page.locator('.print-info')).toHaveText(/· (2\d|3\d) pages$/, { timeout: 60_000 });
});

test('Print PDF lays out the whole book and opens the print dialog', async ({ page }) => {
  // Stand in for the (blocking) native print dialog: report what would have been printed.
  await page.addInitScript(() => {
    if (window.parent !== window) {
      window.print = () =>
        window.parent.postMessage(
          {
            type: 'test:printed',
            pages: document.querySelectorAll('.pagedjs_page').length,
            folios: Array.from(document.querySelectorAll('[data-folio]'), (el) => el.getAttribute('data-folio')),
          },
          '*',
        );
    } else {
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'test:printed') (window as unknown as { printed: unknown }).printed = e.data;
      });
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Print PDF/ }).click();
  const printed = () => page.evaluate(() => (window as unknown as { printed?: { pages: number; folios: string[] } }).printed);
  await expect.poll(async () => (await printed())?.pages ?? 0, { timeout: 60_000 }).toBeGreaterThan(20);
  const { folios } = (await printed())!;
  // Prologue opener (1), blank (2), part page (3), blank (4) and chapter opener (5) carry no folio.
  expect(folios[0]).toBe('6');
  expect(folios.map(Number)).toEqual([...folios.map(Number)].sort((a, b) => a - b));
  await expect(page.locator('iframe[title="Print layout"]')).toHaveCount(0);
});

test('exports a valid EPUB', async ({ page }) => {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /^Export EPUB/ }).click()]);
  expect(download.suggestedFilename()).toBe('the-lamp-at-harrow-point.epub');
  const bytes = readFileSync((await download.path())!);
  const zip = await JSZip.loadAsync(bytes);
  expect(Object.keys(zip.files)[0]).toBe('mimetype');
  expect(await zip.file('mimetype')!.async('string')).toBe('application/epub+zip');
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  expect(opf).toContain('<dc:title id="title">The Lamp at Harrow Point</dc:title>');
});

test('exports an EPUB with the print edition’s page numbers', async ({ page }) => {
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page.getByText('Print page numbers in the ebook', { exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Print page numbers in the ebook' })).toBeChecked();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByRole('menuitem', { name: /^Export EPUB/ }).click()]);
  const zip = await JSZip.loadAsync(readFileSync((await download.path())!));
  const nav = await zip.file('OEBPS/nav.xhtml')!.async('string');
  const pages = nav.match(/#page-\w+"/g) ?? [];
  expect(pages.length).toBeGreaterThan(20);
  expect(pages).toContain('#page-1"');
  const opf = await zip.file('OEBPS/content.opf')!.async('string');
  expect(opf).toContain('property="source-of">pagination</meta>');
});

test('imports a Word manuscript as a new book', async ({ page }) => {
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import manuscript…' }).click();
  await page.locator('.dropzone input[type=file]').setInputFiles('samples/the-lamp-at-harrow-point.docx');
  await expect(page.locator('.book-title')).toContainText('The Lamp At Harrow Point');
  await expect(page.locator('.status')).toContainText('Imported 5 chapters');
  await expect(nav(page, 'What the Ledger Knew')).toBeVisible();
  await expect(nav(page, /^Part One/)).toHaveCount(0);
  await expect(nav(page, /^The Ledger/)).toContainText('Part One');
  await expect(nav(page, 'What the Ledger Knew')).toContainText('Chapter Three');
});

test('imports a manuscript in another language and a legacy encoding', async ({ page }, testInfo) => {
  const text = [
    'Глава 1: Маяк',
    'Маяк на мысе зажигался каждый вечер в четверть шестого, и Ада записывала в книгу ветер и туман.',
    '* * *',
    'Утром она пересчитала чаек на волнорезе.',
    'Глава 2: Туман',
    'Туман пришел в октябре и не спешил уходить.',
  ].join('\r\n\r\n');
  // Windows-1251, the old Cyrillic code page: А–я map to 0xC0–0xFF.
  const bytes = Uint8Array.from(text, (ch) => {
    const cp = ch.codePointAt(0)!;
    return cp >= 0x410 && cp <= 0x44f ? cp - 0x410 + 0xc0 : cp;
  });
  const file = testInfo.outputPath('roman.txt');
  writeFileSync(file, bytes);

  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import manuscript…' }).click();
  await page.locator('.dropzone input[type=file]').setInputFiles(file);
  await expect(page.locator('.status')).toContainText('Imported 2 chapters (detected Russian, read as windows-1251)');
  await expect(nav(page, /^Маяк/)).toContainText('Глава 1');
  await expect(nav(page, /^Туман/)).toContainText('Глава 2');
  await expect(nav(page, 'Содержание')).toBeVisible();
  await nav(page, /^Маяк/).click();
  await expect(page.locator('.editor-page')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('.manuscript hr.scene-break')).toHaveCount(1);
});

test('reopens the book that was open, not the one edited last', async ({ page }) => {
  // The sample is saved first; a new blank book is then saved later (newer updatedAt).
  await expect(page.locator('.book-sub')).toContainText('Saved in this browser');
  await page.getByRole('button', { name: /Books/ }).click();
  await page.getByRole('menuitem', { name: 'New blank book' }).click();
  await expect(page.locator('.book-title')).toContainText('Untitled');
  await expect(page.locator('.book-sub')).toContainText('Saved in this browser');
  // Go back to the sample without editing it, then restart.
  await page.getByRole('button', { name: /Books/ }).click();
  await page.getByRole('menuitem', { name: /^The Lamp at Harrow Point/ }).click();
  await expect(page.locator('.book-title')).toContainText('The Lamp at Harrow Point');
  await page.reload();
  await expect(page.locator('.book-title')).toContainText('The Lamp at Harrow Point');
});

test('resets the language picker when another book opens', async ({ page }) => {
  await page.getByRole('tab', { name: 'Book' }).click();
  const picker = page.locator('.inspector').getByLabel('Language', { exact: true });
  await picker.selectOption('other');
  await page.locator('.inspector').getByLabel('Language code').fill('sw');
  await expect(page.locator('.inspector')).toContainText('Swahili');
  await page.getByRole('button', { name: /Books/ }).click();
  await page.getByRole('menuitem', { name: 'New copy of the sample book' }).click();
  await expect(picker).toHaveValue('en');
  await expect(page.locator('.inspector').getByLabel('Language code')).toHaveCount(0);
});

test('switches app themes, remembers the choice and follows the system setting', async ({ page }) => {
  const theme = () => page.evaluate(() => document.documentElement.dataset.uiTheme);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  expect(await theme()).toBe('paper');
  const light = await background();

  await page.getByRole('button', { name: /^Appearance/ }).click();
  await page.getByRole('menuitemradio', { name: /Midnight/ }).click();
  // The switch runs inside a view transition, so it lands a frame or two after the click.
  await expect.poll(theme).toBe('midnight');
  await expect.poll(background).not.toBe(light);

  // Applied before first paint on reload, not just after React mounts.
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'))).toBe('midnight');
  await page.getByRole('button', { name: /^Appearance/ }).click();
  await expect(page.getByRole('menuitemradio', { name: /Midnight/ })).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('menuitemradio', { name: /System/ }).click();
  await expect.poll(theme).toBe('paper');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(theme).toBe('ink');
});

test('adds, reorders and deletes chapters', async ({ page }) => {
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await nav(page, 'Epilogue').click();
  await page.getByRole('button', { name: 'Add element' }).nth(1).click();
  await page.getByRole('menuitem', { name: 'Chapter' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Coda');
  await expect(page.locator('.nav-group').nth(1).locator('.nav-primary').last()).toHaveText('Coda');

  await page.getByRole('button', { name: 'Actions for Coda' }).click();
  await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
  const titles = await page.locator('.nav-group').nth(1).locator('.nav-primary').allTextContents();
  expect(titles.slice(-2)).toEqual(['Coda', 'Epilogue']);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Actions for Coda' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(nav(page, 'Coda')).toHaveCount(0);
});

test('gathers books into a box set and adds another volume', async ({ page }) => {
  await expect(page.locator('.book-sub')).toContainText('Saved in this browser');
  await page.getByRole('button', { name: 'Books' }).click();
  await page.getByRole('menuitem', { name: 'New box set…' }).click();
  const create = page.getByRole('dialog', { name: 'New box set' });
  await create.getByLabel(/The Lamp at Harrow Point/).check();
  await create.getByRole('button', { name: 'Create box set' }).click();
  await expect(page.locator('.book-title')).toContainText('Box Set');
  await expect(page.locator('.nav-item.is-volume')).toHaveCount(1);
  await expect(page.locator('.nav-item.is-volume')).toContainText('Book One');

  const chapters = page.locator('.nav-group', { has: page.getByRole('heading', { name: 'Chapters' }) });
  await chapters.getByRole('button', { name: 'Add element' }).click();
  await page.getByRole('menuitem', { name: 'Book from your library…' }).click();
  const add = page.getByRole('dialog', { name: 'Add a volume' });
  await expect(add.getByText('Box Set')).toHaveCount(0); // not itself
  await add.getByLabel(/The Lamp at Harrow Point/).check();
  await add.getByRole('button', { name: 'Add volume' }).click();
  await expect(page.locator('.nav-item.is-volume')).toHaveCount(2);
  await expect(page.locator('.nav-item.is-volume').nth(1)).toContainText('Book Two');
  // Chapter numbers start again in the second volume.
  await expect(page.locator('.nav-item.in-volume .nav-select[data-num="1"]')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Section', exact: true }).click();
  await expect(page.getByText(/Copied from “The Lamp at Harrow Point”/)).toBeVisible();
  await expect(page.getByLabel('Volume author')).toHaveValue('Mara Quill');
});

test('shows the interface in the chosen language', async ({ page }) => {
  await page.getByRole('button', { name: /^Appearance/ }).click();
  await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await expect(page.getByRole('button', { name: 'Exportieren' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Veröffentlichen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  // Book words stay in the book's language.
  await expect(page.locator('.nav-primary', { hasText: 'The Inventory' })).toBeVisible();
  await page.getByRole('button', { name: /^Erscheinungsbild/ }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeVisible();
});
