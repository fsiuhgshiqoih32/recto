// Captures README screenshots from a running Recto (npm run dev / npm run preview).
//
//   npm run screenshots -- [http://localhost:5179] [--out docs/screenshots]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { launch } from '../cli/pdf';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args.splice(outIndex, 2)[1] : 'docs/screenshots';
const url = args[0] ?? 'http://localhost:5179/';
mkdirSync(outDir, { recursive: true });

async function waitForPrint(page: Page) {
  await page.locator('.print-info').filter({ hasText: /pages?$/ }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(300);
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(url);
await page.getByRole('button', { name: /^The Inventory/ }).click();
await page.getByRole('tab', { name: 'Edit', exact: true }).click();
await page.locator('.manuscript').waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, 'editor.png') });
await page.getByRole('tab', { name: 'Format', exact: true }).click();

await page.getByRole('tab', { name: 'Print' }).click();
await waitForPrint(page);
await page.screenshot({ path: join(outDir, 'print-preview.png') });

await page.getByRole('tab', { name: 'Style' }).click();
await page.getByRole('radio', { name: /Marginalia/ }).click();
await page.waitForTimeout(800);
await waitForPrint(page);
await page.screenshot({ path: join(outDir, 'styles.png') });

await page.getByRole('tab', { name: 'Whole book' }).click();
await waitForPrint(page);
await page.screenshot({ path: join(outDir, 'print-whole-book.png') });

await page.getByRole('tab', { name: 'Phone' }).click();
await page.getByRole('button', { name: /^Fog Season/ }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, 'phone-preview.png') });

// A dark theme, with the appearance menu open.
await page.getByRole('button', { name: /^Appearance/ }).click();
await page.getByRole('menuitemradio', { name: /^Ink/ }).click();
await page.getByRole('tab', { name: 'Print' }).click();
await page.getByRole('button', { name: /^The Inventory/ }).click();
await waitForPrint(page);
await page.getByRole('button', { name: /^Appearance/ }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, 'dark-mode.png') });
await page.keyboard.press('Escape');

// A right-to-left book: an Arabic manuscript pasted into the import dialog.
await page.getByRole('button', { name: 'File', exact: true }).click();
await page.getByRole('menuitem', { name: 'Import manuscript…' }).click();
await page.getByText('Or paste text').click();
await page.locator('.paste textarea').fill(
  [
    'الفصل 1: المنارة',
    'كانت منارة هارو بوينت تضاء كل مساء في الخامسة والربع. وكانت آدا تصعد الدرجات المئة والثماني وفي يدها ترمس وتحت ذراعها الدفتر الأخضر.',
    'كتبت التاريخ، وكتبت الريح، ثم خرجت إلى الشرفة وعدّت النوارس على حاجز الأمواج، لأن الدفتر القديم كان يعدّ النوارس، وبدا من غير اللائق أن تتوقف.',
    '* * *',
    'في نهاية الأسبوع الأول كانت قد تعلمت إيقاع المكان. لم يكن المصباح يحتاج إليها، لكن الدفتر كان يحتاج إليها.',
    'الفصل 2: موسم الضباب',
    'جاء الضباب في أكتوبر، ولم يستأذن.',
  ].join('\n\n'),
);
await page.getByRole('button', { name: 'Import pasted text' }).click();
await page.getByRole('button', { name: /^المنارة/ }).click();
await page.getByRole('tab', { name: 'Print' }).click();
await waitForPrint(page);
await page.getByRole('button', { name: /^Appearance/ }).click();
await page.getByRole('menuitemradio', { name: /^Paper/ }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, 'right-to-left.png') });

await browser.close();
console.log(`screenshots written to ${outDir}`);
