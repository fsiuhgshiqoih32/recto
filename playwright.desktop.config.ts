import { defineConfig } from '@playwright/test';

// Drives the Electron app (run `npm run test:desktop`, which builds it first).
export default defineConfig({
  testDir: 'tests/desktop',
  timeout: 120_000,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
});
