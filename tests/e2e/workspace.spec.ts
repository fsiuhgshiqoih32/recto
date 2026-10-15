import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.book-title')).toContainText('The Lamp at Harrow Point');
});

test('keeps the preview visible for every style and remembers the selection', async ({ page }) => {
  await page.locator('.nav-select').filter({ hasText: 'The Inventory' }).click();
  await expect(page.getByRole('tab', { name: 'Format', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const name of ['Octavo', 'Ledger', 'Marginalia', 'Broadsheet', 'Almanac']) {
    const style = page.getByRole('radio', { name: new RegExp(name) });
    await style.click();
    await expect(style).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('iframe[title="Ebook preview"]')).toBeVisible();
    await expect(page.frameLocator('iframe[title="Ebook preview"]').locator('.chapter-title')).toHaveText('The Inventory');
  }
  await expect(page.locator('.book-sub')).toContainText('Saved in this browser');
  await page.reload();
  await expect(page.getByRole('radio', { name: /Almanac/ })).toHaveAttribute('aria-checked', 'true');
});

test('preserves the editor instance, selected text, undo, and preview choice across views', async ({ page }) => {
  await page.locator('.nav-select').filter({ hasText: 'Fog Season' }).click();
  await page.getByRole('tab', { name: 'Phone', exact: true }).click();
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  const manuscript = page.locator('.manuscript');
  await manuscript.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText(' transientword');
  await page.keyboard.press('Control+Shift+ArrowLeft');
  const selection = await page.evaluate(() => window.getSelection()?.toString());
  const originalNode = await manuscript.elementHandle();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  await expect(page.locator('.workspace-context')).toContainText('Fog Season');
  await expect(page.getByRole('tab', { name: 'Phone', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  expect(await manuscript.evaluate((node, old) => node === old, originalNode)).toBe(true);
  await expect(manuscript).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(selection);
  await page.keyboard.press('Control+z');
  await expect(manuscript).not.toContainText('transientword');
  await page.getByRole('button', { name: 'Hide preview' }).click();
  await expect(page.locator('.preview-region')).toBeHidden();
  await page.getByRole('tab', { name: 'Format', exact: true }).click();
  await expect(page.locator('.preview-region')).toBeVisible();
  await page.getByRole('tab', { name: 'Edit', exact: true }).click();
  await expect(page.locator('.preview-region')).toBeHidden();
});

test('supports keyboard menus, settings tabs, and style selection', async ({ page }) => {
  const file = page.getByRole('button', { name: 'File', exact: true });
  await file.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Import manuscript…' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Open Recto file…' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(file).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Books', exact: true })).toBeFocused();
  await expect(page.getByRole('menu', { name: 'File', exact: true })).toBeHidden();
  await page.getByRole('radio', { name: /Octavo/ }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: /Ledger/ })).toBeFocused();
  await expect(page.getByRole('radio', { name: /Ledger/ })).toHaveAttribute('aria-checked', 'true');
  const styleTab = page.getByRole('tab', { name: 'Style', exact: true });
  await styleTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Section', exact: true })).toBeFocused();
  await expect(styleTab).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tabpanel', { name: 'Section', exact: true })).toBeVisible();
  await page.getByLabel('Section title').fill('Renamed section');
  await expect(page.locator('.nav-select').filter({ hasText: 'Renamed section' })).toBeVisible();
});

for (const width of [1440, 1200, 1024, 768, 390]) {
  test(`works without horizontal overflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator('iframe[title="Ebook preview"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width < 1200) {
      const contents = page.getByRole('button', { name: 'Contents', exact: true });
      await contents.click();
      await expect(page.getByRole('dialog', { name: 'Contents', exact: true })).toBeVisible();
      await page.locator('.nav-select').filter({ hasText: 'Fog Season' }).click();
      await expect(contents).toBeFocused();
      await expect(page.locator('.workspace-context')).toContainText('Fog Season');
    }
    if (width < 900) {
      const settings = page.getByRole('button', { name: 'Settings', exact: true });
      await settings.click();
      await expect(page.getByRole('dialog', { name: 'Book settings', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Close settings' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      expect(await page.locator('.inspector').evaluate((node) => node.contains(document.activeElement))).toBe(true);
      await page.getByRole('radio', { name: /Ledger/ }).click();
      await page.keyboard.press('Escape');
      await expect(settings).toBeFocused();
      await page.getByRole('tab', { name: 'Edit', exact: true }).click();
      await expect(page.locator('.manuscript')).toBeVisible();
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Live preview' })).toBeVisible();
      await page.frameLocator('iframe[title="Ebook preview"]').locator('body').click({ position: { x: 20, y: 20 } });
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Close preview' })).toBeFocused();
      await page.frameLocator('iframe[title="Ebook preview"]').locator('body').click({ position: { x: 20, y: 20 } });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Preview', exact: true })).toBeFocused();
      await page.getByRole('tab', { name: 'Format', exact: true }).click();
      await expect(page.frameLocator('iframe[title="Ebook preview"]').locator('.chapter-label')).toHaveText('2');
    }
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`format-${width}.png`), animations: 'disabled' });
  });
}

test('retains visible export failures on a compact screen until dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Download unavailable'); }; });
  await page.clock.install();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Export EPUB/ }).click();
  await expect(page.getByRole('alert')).toContainText('Download unavailable');
  await page.clock.fastForward(6000);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Dismiss status' }).click();
  await expect(page.getByRole('status')).toContainText('Your book stays on this device');
});

test('guards exports from both UI and desktop commands and handles cancellation', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { calls: 0, finish: (_result: { pages: number }) => {}, menu: (_command: string) => {} };
    Object.assign(window, { testExport: state, rectoDesktop: {
      platform: 'win32',
      setSpellcheckLanguages: async () => ({ applied: ['en'] }),
      takePendingFile: async () => null,
      onOpenFile: () => () => {},
      onMenu: (handler: (command: string) => void) => { state.menu = handler; return () => {}; },
      layoutPdf: () => { state.calls++; return new Promise((resolve) => { state.finish = resolve; }); },
      savePdf: async () => null,
      findTools: async () => ({ kindlePreviewer: false, ghostscript: null }),
      openRecto: async () => null,
      saveRecto: async () => null,
    } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Export PDF/ }).click();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();
  await expect(page.locator('.status')).toContainText('Laying out every page');
  await expect.poll(() => page.evaluate(() => (window as unknown as { testExport: { calls: number } }).testExport.calls)).toBe(1);
  await page.evaluate(() => {
    const state = (window as unknown as { testExport: { menu: (command: string) => void; finish: (result: { pages: number }) => void } }).testExport;
    state.menu('export-pdf'); state.menu('export-epub'); state.finish({ pages: 24 });
  });
  await expect(page.locator('.status')).toContainText('PDF export canceled.');
  expect(await page.evaluate(() => (window as unknown as { testExport: { calls: number } }).testExport.calls)).toBe(1);
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});

test('respects reduced motion and preserves the dark preview and controls', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.uiTheme)).toBe('ink');
  await page.getByRole('button', { name: /^Appearance/ }).click();
  expect(await page.locator('.floating-menu').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await page.keyboard.press('Escape');
  expect(await page.locator('.preview-region').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
  await expect(page.locator('iframe[title="Ebook preview"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('format-dark.png'), animations: 'disabled' });
});
