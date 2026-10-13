import { defineConfig } from '@playwright/test';

// Locally this drives an installed Chrome; in CI it uses Playwright's Chromium.
const ci = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: ci ? undefined : (process.env.RECTO_BROWSER ?? 'chrome'),
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !ci,
    timeout: 180_000,
  },
});
