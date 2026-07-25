/// <reference types="vitest" />
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CF 54: telemetry clientVersion = pkg.version + short git SHA
// (tech-architecture.md § 8.3 — M1 internal builds are tagged by commit SHA).
// Fallback 'local' keeps builds working in any environment without git.
const configDir = fileURLToPath(new URL('.', import.meta.url));
const pkgVersion: string = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
).version;
let gitSha = 'local';
try {
  // stdio silences git's stderr so a git-less build's error line
  // ('not a git repository') does not leak into build output before the catch.
  gitSha = execSync('git rev-parse --short HEAD', {
    cwd: configDir,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  // git absent (e.g. a tarball build) — keep the 'local' fallback.
}
const clientVersion = `${pkgVersion}+${gitSha}`;

export default defineConfig({
  plugins: [react()],
  define: {
    __CLIENT_VERSION__: JSON.stringify(clientVersion),
  },
  server: {
    port: 5173,
    // Proxy /v1/* to the Fastify server on :4000 (tech-architecture.md
    // § 8.1). The client's telemetry transport POSTs to the relative
    // path /v1/telemetry/batch (emit.ts); in dev this proxy routes it to
    // the server (M1.5c PR 2 / CF 49). Same-origin in prod needs no proxy.
    // 127.0.0.1 (not localhost): the server binds IPv4 0.0.0.0, but on
    // Windows/Node 'localhost' resolves to IPv6 ::1 first, so a 'localhost'
    // target yields ECONNREFUSED ::1:4000 and every telemetry batch is
    // silently dropped at the proxy (client swallows the fetch error).
    proxy: {
      '/v1': 'http://127.0.0.1:4000',
    },
    // Watch source changes inside @packbreaker/* workspace packages so edits in
    // packages/content (etc.) HMR through to the client without manual rebuilds.
    watch: {
      ignored: ['!**/node_modules/@packbreaker/**'],
    },
  },
  // `vite preview` does NOT inherit `server.proxy` — it has its own block. Without
  // this, a preview build POSTs telemetry into a 404 and emit.ts's throw-safe
  // swallow (Catch 21 lineage) drops every batch SILENTLY: the game plays perfectly
  // and records nothing.
  //
  // Preview is the ONLY surface that emits a real clientVersion. Vite substitutes
  // `define` statically at build but neither rewrites the module nor injects a
  // global in dev, so `typeof __CLIENT_VERSION__` is 'undefined' under `vite dev`
  // and telemetry falls to the '0.0.0+unstamped' canary — a bucket shared with
  // every dev session ever run. Playtests whose telemetry must be attributable to a
  // build therefore run against `vite preview`, not `vite dev`.
  //
  // Same 127.0.0.1 rationale as server.proxy above: the Fastify server binds IPv4,
  // and on Windows 'localhost' resolves to IPv6 ::1 first.
  preview: {
    proxy: {
      '/v1': 'http://127.0.0.1:4000',
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
    // CF-71 — hermeticity: pin Clerk's publishable key to empty for the test
    // run so outcomes never depend on ambient shell / apps/client/.env state.
    // Every client test assumes the anonymous path (clerkEnabled=false — the
    // CI condition, where no .env exists), per AuthProvider.test.tsx's header
    // and the ClassSelect/AuthProvider "unconfigured" suites; NO test requires
    // clerk enabled. But nothing ENFORCED it: a local .env with a real
    // VITE_CLERK_PUBLISHABLE_KEY leaked into import.meta.env (src/auth/config.ts)
    // and flipped clerkEnabled=true, failing 8 tests locally while CI stayed
    // green. Empty string → config.ts materializes it as `undefined` →
    // clerkEnabled=false, deterministically. Fixed value, not sourced from .env;
    // CI (which sets no key) already ran clerkEnabled=false, so it is unchanged.
    // Test-harness only — no production Clerk-init behavior change.
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: '',
    },
  },
});
