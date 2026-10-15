import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/recto/").
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  build: { target: 'es2022' },
  // The EPUB validator's XML engine (libxml2-wasm) uses top-level await.
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  // Build outputs aren't source. Watching them also holds Windows directory
  // handles that make electron-builder's rename of release/win-unpacked fail.
  server: { watch: { ignored: ['**/release/**', '**/dist-electron/**', '**/out/**', '**/test-results/**'] } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
