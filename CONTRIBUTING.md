# Contributing — Packbreaker Arena

Working notes for the two-person team. Not a public OSS guide.

## Verifying behavior in the browser

Vite + pnpm workspaces are finicky about HMR through symlinked workspace
packages. After **any** change to `packages/content`, `packages/shared`,
`packages/sim`, or `packages/ui-kit` — and especially after pulling a new
branch — bust the cache before declaring a regression real:

```sh
# 1. Kill any running dev server (Ctrl+C in the pnpm dev terminal)
# 2. Wipe Vite + TS build artifacts
pnpm clean
# 3. Restart fresh
pnpm dev
# 4. In the browser, open DevTools → Network → check "Disable cache",
#    then hard-refresh (Ctrl+Shift+R / Cmd+Shift+R). Keep DevTools open.
```

This is the canonical cache-bust ritual. Most "it broke after pulling" reports
are a stale Vite cache, not a code regression. The M1.1.1 recipe-detection
"regression" was exactly this — confirmed by a clean restart. Always run the
ritual before opening a bug.

## Running tests

```sh
pnpm turbo test                          # all packages
pnpm --filter @packbreaker/content test  # content cross-reference suite (29 tests)
pnpm --filter @packbreaker/client test   # data-adapter regression suite (5 tests)
```

`pnpm turbo lint typecheck test build` is the full pipeline that CI runs.

## Branch hygiene

- `main` holds the working baseline. M0 closed at `1f04c77`.
- Each M1 phase branches off `main` as `m1.<n>-<slug>` (e.g. `m1.1-scaffold`,
  `m1.1.1-schema-patch`, `m1.2-sim`).
- Branch is closed by merging to `main` after the closing decision-log entry
  lands. The branch then stays in history but is no longer the working tip.
- Subsequent M1.x branches base off the new `main`. Never base off another in-flight
  M1.x branch — that's how phase-conflicting changes accumulate.
- One branch in flight at a time (this is a two-person team — no need for parallel feature branches).
