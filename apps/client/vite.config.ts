/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Proxy /v1/* to the Fastify server on :4000 (tech-architecture.md
    // § 8.1). The client's telemetry transport POSTs to the relative
    // path /v1/telemetry/batch (emit.ts); in dev this proxy routes it to
    // the server (M1.5c PR 2 / CF 49). Same-origin in prod needs no proxy.
    proxy: {
      '/v1': 'http://localhost:4000',
    },
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
