/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Watch source changes inside @packbreaker/* workspace packages so edits in
    // packages/content (etc.) HMR through to the client without manual rebuilds.
    watch: {
      ignored: ['!**/node_modules/@packbreaker/**'],
    },
  },
  // Don't pre-bundle workspace packages — they're TS source, not built libs.
  optimizeDeps: {
    exclude: [
      '@packbreaker/content',
      '@packbreaker/shared',
      '@packbreaker/sim',
      '@packbreaker/ui-kit',
    ],
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
  },
});
