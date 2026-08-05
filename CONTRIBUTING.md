# Contributing — Packbreaker Arena

Working notes for the two-person team. Not a public OSS guide.

## How work is organised

Stages, defined in `roadmap.md`. A stage ends in a merged, playable build that is visibly
better than the one before it. One branch in flight at a time.

Every merge adds **one line** to `CHANGELOG.md`: what changed, why, anything to watch.
`decision-log.md` is history and is no longer appended to — read it when you need to know
why the sim, schemas, or corpus are shaped the way they are.

### What gates a merge

- `pnpm turbo lint typecheck test build` green (what CI runs).
- Automated code review on PRs touching `packages/sim` or `apps/server`. UI, content, art,
  and copy ship without it.
- If the diff touches `packages/sim` or `packages/content`, see the determinism note below.

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

### Playtesting

```sh
pnpm --filter @packbreaker/server run dev   # :4000
pnpm --filter @packbreaker/client run dev   # :5173
```

Any **telemetry-bearing** playtest must run `vite preview` (:4173) instead of `vite dev`.
Vite substitutes `define` at build time only, so `vite dev` stamps the `0.0.0+unstamped`
clientVersion canary and the run lands in a bucket shared with every dev session ever run.
Preview binds IPv6 — use `http://localhost:4173/`, not `127.0.0.1`.

## Running tests

```sh
pnpm turbo test                          # all packages
pnpm --filter @packbreaker/sim test      # 557 tests, incl. the determinism corpus
pnpm --filter @packbreaker/client test   # 783 tests across 70 files
pnpm --filter @packbreaker/content test  # content cross-reference suite
```

`pnpm turbo lint typecheck test build` is the full pipeline that CI runs. There is **no
root `tsconfig.json`** — typecheck is per-package via turbo, never a root `tsc -b`.

## Determinism

`packages/sim/test/fixtures/runs/` holds 224 `.jsonl` action-stream fixtures that are
byte-replayed. They are frozen for **unchanged** sim behavior.

- A change under `packages/sim` or `packages/content` that alters combat or run behavior
  **re-baselines them**. That is sanctioned, not a failure. Prove determinism with a
  byte-identical double-write: regenerate twice, compare, confirm the two runs are
  identical.
- A change that should *not* move them — most client work — should be confirmed with
  `git diff --stat -- packages/sim packages/content content-schemas.ts` returning empty.
  Check it rather than assuming it.

`packages/sim/test/determinism/{strategies,generate,ghost-generator}.ts` are the **inputs**
to fixture generation. Editing one leaves all 224 committed fixtures passing while changing
what the next regeneration produces — a silent divergence that surfaces months later. Treat
them as import-only; wrap, don't edit.

Note there are two ghost generators and they are deliberately different: the corpus one in
`packages/sim/test/determinism/ghost-generator.ts` exists for path coverage, and
`apps/client/src/combat/ghost.ts` is the one real players fight. Balance conclusions must
come from the real-play path.

## Branch hygiene

- `main` holds the working baseline. M0 closed at `1f04c77`.
- Branch off `main` with a descriptive slug (`ghost-difficulty-lift`, `title-screen`).
- Merge back with `--no-ff` and a summary commit, then add the `CHANGELOG.md` line.
- Never base off another in-flight branch — that's how conflicting changes accumulate.
- One branch in flight at a time (this is a two-person team — no need for parallel feature
  branches).

## Local environment notes

- `pnpm` is not on PATH; use `corepack pnpm`. `turbo` needs a `pnpm.cmd` → `corepack pnpm`
  shim on PATH.
- `.nvmrc` pins Node 20 (matching CI); the dev machine runs 22 unless `nvm use`.
- The OneDrive parent directory leaks a postcss config into Vite. If styling behaves
  strangely, check that first.
