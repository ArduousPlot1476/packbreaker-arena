# Packbreaker Arena — Tech Architecture (v0)

> Source of truth for stack, monorepo layout, simulation contract, API shape, and deployment. UI flow lives in `gdd.md`. Content schemas live in `content-schemas.ts`. This doc decides the boring stuff so the interesting stuff stays unblocked.

---

## 1. Stack overview

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript 5.x, `strict: true` | Single language across sim, client, server. |
| Package manager | pnpm 9.x | Fast, strict workspaces, low disk. |
| Monorepo orchestrator | Turborepo | Caching for `build` / `test` / `lint`. Lighter than Nx, more than raw pnpm. |
| Client shell | React 18 + Vite | Fast HMR. Trey already runs React/Phaser. |
| Bag UI / shop / HUD | React + CSS (Tailwind v3) + `@dnd-kit` | Drag/drop is a solved problem in HTML; native a11y + responsive. |
| Combat playback | Phaser 3.80+ | Canvas overlay during combat phase only. Trey already comfortable with it. |
| Simulation | Pure TypeScript, no DOM, no globals | Importable in browser **and** Node. Deterministic. |
| Server (M1) | Node 20 + Fastify | Tiny — daily seeds + telemetry sink. |
| Server (M2+) | Same + Postgres + Redis | Ghosts, trophies, accounts. |
| Auth (M2) | Email magic-link or Discord OAuth — picked in M2 | Out of M1 scope. |
| Telemetry | PostHog (self-host or cloud — decide M2) | Event taxonomy in `telemetry-plan.md`. |
| Asset pipeline | Aseprite → PNG sheets, JSON atlases | Standard for 2D. |
| Audio | Howler.js | Trivial loops + SFX. |

---

## 2. The renderer split (locked decision)

The bag is fundamentally UI. Combat is fundamentally animation. Treating them as one renderer's problem leaks complexity in both directions.

- **React owns**: title, class select, relic select, top bar, left rail, right rail (shop / sell / continue), bag grid, drag/drop, recipe glow, item rotation, cursor states, modal dialogs, run-end summary.
- **Phaser owns**: combat playback only. During combat phase, an absolutely-positioned `<canvas>` overlays the bag area with a transparent background. Phaser plays VFX (hit flashes, damage numbers, status icons, particle effects) anchored to bag-cell coordinates that React publishes via a small shared coordinate registry.
- **Coordinate handshake**: a single `BagLayout` object (cell pixel positions, cell size) is computed in React and read by the Phaser scene at combat start. Static for the duration of combat — no live sync.

### Why this beats "all Phaser" or "all React"
- All-Phaser: re-implements drag/drop, accessibility, responsive layout, mobile touch ergonomics. Slow.
- All-React: combat juice (particles, tweens, screen shake) ranges from awkward to ugly. CSS keyframes can't carry the boss round.
- Split: React covers 95% of player time (shop / arrange) cleanly, Phaser covers the 8–20s combat window where canvas earns its keep.

### Phaser scope guardrails (M1)
Phaser does NOT own: scene routing, persistent state, input handling outside the combat overlay, asset preload for non-combat screens. One scene only: `CombatScene`. Asset preload runs on combat-phase entry, not app boot.

---

## 3. Monorepo layout

```
packbreaker/
├── apps/
│   ├── client/                  # Vite + React + Phaser. The web game.
│   └── server/                  # Fastify. M1: seeds + telemetry. M2+: ghosts, auth, trophies.
├── packages/
│   ├── sim/                     # ★ Deterministic combat + run simulation. Pure TS.
│   ├── content/                 # Item, class, recipe, relic data + schemas (re-exports content-schemas.ts).
│   ├── shared/                  # Shared types crossing the client/server boundary (API DTOs, telemetry events).
│   └── ui-kit/                  # React component primitives (Button, Card, RarityFrame). Tailwind-based.
├── tooling/
│   ├── eslint-config/
│   └── tsconfig/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json
```

### Package boundaries (enforced by ESLint `no-restricted-imports`)
- `sim` imports: `content` only. **Never** the DOM, React, Phaser, Node APIs, or `Date`/`Math.random`.
- `content` imports: nothing. Pure data + types.
- `shared` imports: nothing. Pure types.
- `ui-kit` imports: React, Tailwind utilities, `shared` types.
- `client` imports: everything (sim, content, shared, ui-kit, Phaser, React).
- `server` imports: sim, content, shared. Never `client` or `ui-kit`.

The contract: anything new that crosses package lines goes through `shared`. No exceptions without a `decision-log.md` entry.

---

## 4. Simulation contract (★ critical section)

The sim is the heart of the product. It MUST be deterministic, framework-free, and identical on client and server.

### 4.1 Rules of determinism
1. **No `Math.random()`**, anywhere in `packages/sim`. Use the seeded PRNG from `sim/rng.ts` (mulberry32). Period.
2. **No `Date.now()`**, no `performance.now()`. Time is measured in **ticks** — 10 ticks per simulated second, fixed.
3. **No `Object.keys()`/`Set`/`Map` iteration where order matters** unless seeded by deterministic insertion. Prefer arrays + sorted iteration.
4. **No floating-point math in core resolution.** HP, damage, gold, cooldowns are integers. Effect modifiers like "+10%" resolve via `Math.floor((base * 110) / 100)` patterns, not float arithmetic.
5. **No DOM, Node, or async I/O** in sim code. Pure functions only.
6. **Iteration order over items**: always by `(row, col)` ascending, then by item `id` for ties. Documented in `sim/iteration.ts`.

### 4.2 Public API of `packages/sim`

```ts
// packages/sim/src/index.ts (illustrative — actual signatures finalized with content-schemas.ts)

export interface SimSeed { value: number }                        // 32-bit seed

export interface CombatInput {
  seed: SimSeed
  player: BagState
  ghost: BagState
  relics: { player: RelicState[]; ghost: RelicState[] }
}

export interface CombatEvent {
  tick: number
  type: 'damage' | 'heal' | 'status_apply' | 'status_tick' | 'item_trigger' | 'recipe_combine' | 'combat_end'
  source?: ItemRef
  target?: ItemRef | 'player' | 'ghost'
  payload: Record<string, number | string>
}

export interface CombatResult {
  events: CombatEvent[]      // full ordered log — replay material
  outcome: 'player_win' | 'ghost_win' | 'draw'
  finalHp: { player: number; ghost: number }
  endedAtTick: number
}

export function simulateCombat(input: CombatInput): CombatResult
export function replayCombat(input: CombatInput): Iterable<CombatEvent>  // same RNG, yields events for playback
```

`simulateCombat` and `replayCombat` consume the **same** input and produce the **same** events. The client uses `replayCombat` for animated playback; the server uses `simulateCombat` for validation in M2+. There is exactly one combat code path.

### 4.3 Replay invariant

> Given identical `(CombatInput)`, `simulateCombat` MUST produce byte-identical `CombatResult.events` on every platform, every Node version we support, every browser we support.

This is the test we never get to break. CI will run a fixture suite of 200+ recorded combats and bit-compare events.

### 4.4 Run-level state (out of sim)

The sim only handles individual **combats**. The **run** state machine (round progression, shop generation, gold, hearts, contract objectives) lives in `packages/sim/src/run/`. It's still pure and deterministic, just at a higher level. Same RNG rules apply.

---

## 5. Client architecture

### 5.1 Module map

```
apps/client/src/
├── main.tsx              # React entry, route to screens
├── screens/              # Title, ClassSelect, RelicSelect, RunScreen, RunEnd
├── run/                  # React-side run controller. Owns UI state, calls into sim.
│   ├── RunController.ts  # State machine wrapper around sim/run
│   ├── useRun.ts         # React hook exposing run state
│   └── ShopController.ts
├── bag/                  # The bag UI. CSS grid + dnd-kit.
│   ├── BagBoard.tsx
│   ├── BagCell.tsx
│   ├── DraggableItem.tsx
│   └── layout.ts         # Computes BagLayout for Phaser handoff
├── combat/               # Combat playback layer.
│   ├── CombatOverlay.tsx # Mounts Phaser, hands it the layout + replay events
│   ├── CombatScene.ts    # Phaser scene
│   └── effects/          # Particle configs, hit flashes, etc.
├── shop/
├── hud/
├── persistence/          # localStorage save/load (M1). API client wrapper (M2+).
├── telemetry/            # Event emit shim. Wraps PostHog or no-ops.
└── ui-kit-overrides/
```

### 5.2 React → sim flow
1. User clicks **Continue** → `RunController.startCombat()`.
2. `RunController` calls `sim.simulateCombat(input)` and gets a full `CombatResult`.
3. `CombatOverlay` mounts Phaser, passes `events` array.
4. Phaser plays events tick-by-tick using its own scheduler keyed to fixed dt.
5. On final event, Phaser emits `combat_end`, React unmounts overlay, advances run.

The sim runs to completion **before** playback starts. Playback is just animation over a known event log. This keeps the sim pure and the playback layer dumb. (Nice side effect: skip-button is trivial — jump to last event.)

### 5.3 Sim-on-main-thread, for now
M1 keeps the sim on the main thread. Combat sims are tiny — even a 200-tick combat is sub-millisecond. Worker isolation costs `postMessage` serialization complexity for no measurable benefit at our scale. **Trigger to revisit**: any single combat exceeds 5ms, or run-state computations cause input lag. Decision deferred to telemetry.

---

## 6. Server / API

### 6.1 M1 server scope (minimal)
Only two endpoints:

```
GET  /v1/contract/daily          → { date, contract_id, seed, ruleset }
POST /v1/telemetry/batch         → 204 (accepts batched events)
```

That's it. No accounts, no ghosts, no persistence beyond a tiny in-memory daily contract registry seeded at deploy.

Local saves use `localStorage`, namespaced under `pba.v1.*`.

### 6.2 M2 server scope (full)
- Auth (TBD provider).
- `POST /v1/ghost` — submit bag snapshot.
- `GET /v1/ghost?round=X&trophy_band=Y` — fetch matchable ghost.
- `GET/POST /v1/run/save` — cloud save.
- `GET /v1/leaderboard/daily?date=Y` — daily contract leaderboard.
- `POST /v1/replay/validate` — server-side combat re-run for ranked integrity.

### 6.3 Server runtime
- Fastify 4.x.
- Zod for request validation, schemas live in `packages/shared`.
- Pino for logging.
- M1: single container, no DB. M2+: Postgres (RDS or Neon), Redis for ghost pool LRU.

### 6.4 API contract location
All request/response types in `packages/shared/src/api/`. Server validates with Zod schemas; client imports the inferred TS types and uses a thin `fetch` wrapper. No tRPC, no GraphQL — overkill for this surface.

---

## 7. Persistence

### 7.1 Local save format (M1)
```ts
// packages/shared/src/save.ts
interface LocalSaveV1 {
  schemaVersion: 1
  trophies: number
  dailyStreak: number
  lastDailyAttempted: string         // ISO date
  tutorialCompleted: boolean
  telemetryAnonId: string             // uuid v4, generated on first run
  inProgressRun?: SerializedRunState  // crash-recovery resume
}
```

Versioned from day one. Migrations live in `apps/client/src/persistence/migrations/`.

### 7.2 Server save format (M2)
Server stores authoritative trophy and daily streak; client save becomes a cache. Conflict resolution: server wins, client toasts "synced."

---

## 8. Build, dev, CI

### 8.1 Local dev
- `pnpm dev` at root: Turbo runs `client` (Vite on `:5173`) + `server` (Fastify on `:4000`) concurrently with shared sim hot-reload.
- Vite proxy: `/v1/*` → `localhost:4000`.

### 8.2 CI (GitHub Actions)
Per-PR pipeline:
1. `pnpm install --frozen-lockfile`
2. `pnpm turbo lint`
3. `pnpm turbo typecheck`
4. `pnpm turbo test` (Vitest in each package)
5. **Sim determinism suite** (`packages/sim` only) — runs the 200+ fixture comparison from § 4.3.
6. `pnpm turbo build`

Block merge on any failure. The determinism suite is the one nobody is allowed to skip.

### 8.3 Versioning
M1: no public versions, internal builds tagged by commit SHA. M2+: semver on the client app, content packs versioned independently (`content@2025-W42` pattern — picked in M2).

---

## 9. Deployment

| Env | Client | Server | DB | Notes |
|---|---|---|---|---|
| Local dev | Vite | Fastify | none | `pnpm dev` |
| Internal preview | Vercel (per-PR) | Fly.io single instance | none | M1 |
| M2 staging | Vercel | Fly.io 2× | Neon Postgres + Upstash Redis | Same shape as prod |
| M2 prod | Vercel + CDN | Fly.io multi-region | Neon + Upstash | Region-pinned for now |

Choices are reversible. Vercel/Fly/Neon are all "good defaults that don't lock us in" — happy to swap for Cloudflare Pages + Workers if Trey prefers. Open question.

---

## 10. Performance budget

| Metric | M1 target | M2 target |
|---|---|---|
| Initial load (3G fast, cold) | ≤ 6s to interactive | ≤ 3s to interactive |
| Initial JS bundle (gzip) | ≤ 800kb | ≤ 500kb |
| Phaser asset preload (combat entry) | ≤ 1.5s on 4G | ≤ 800ms |
| Sustained framerate (combat, mid-tier mobile) | 60fps | 60fps |
| Single combat sim wall time | ≤ 5ms p95 | ≤ 5ms p95 |
| Drag/drop input lag | ≤ 16ms | ≤ 16ms |

Bundle policing: code-split Phaser + combat module — they do not load until first combat. Title screen ships React + bag UI only.

---

## 11. Testing strategy

| Layer | Tool | Coverage target |
|---|---|---|
| `sim` unit tests | Vitest | ≥ 90% line, 100% on combat resolution + RNG |
| `sim` determinism suite | Vitest + fixture JSON | 200+ recorded combats, bit-compare |
| `content` schema tests | Vitest + Zod | Every item, recipe, relic parses + validates power-budget bounds from `balance-bible.md` |
| Client component tests | Vitest + React Testing Library | Bag drag/drop, shop interactions, recipe-glow trigger |
| E2E happy path | Playwright | Tutorial run completion, one full normal run, daily contract entry |
| Visual regression | Deferred to M2 | Not worth it during graybox |

---

## 12. Telemetry integration (cross-ref)

Full event taxonomy lives in `telemetry-plan.md`. Architectural requirements:

- All events flow through `apps/client/src/telemetry/emit.ts`. Never call PostHog directly from feature code.
- Events are typed against `packages/shared/src/telemetry/events.ts`. Adding an event = adding a type = required by lint.
- Sim package is **never** allowed to import telemetry. Events are emitted by the React run controller observing sim outputs.
- Server-side telemetry batches: client posts to `/v1/telemetry/batch`, server forwards to PostHog. This shields the analytics provider behind our API and keeps an option open to swap providers.

---

## 13. Open decisions

These don't block M0 sign-off but should be settled before they bite:

1. **Auth provider for M2** — Discord OAuth (lower friction, target audience overlap) vs. email magic-link (broader). Defer to M2 kickoff.
2. **Hosting flavor** — Vercel + Fly + Neon (proposed) vs. Cloudflare Pages + Workers + D1 (cheaper at scale, more vendor lock). Defer; M1 scope works on either.
3. **Self-host PostHog vs. cloud** — privacy/cost tradeoff. Defer to telemetry-plan.md.
4. **Aseprite license model** — Trey-owned vs. team license at M2. Trivially cheap; defer.
5. **Asset atlas tooling** — TexturePacker, free-tex-packer, or Aseprite's native export. Decide when first VFX sheet is built.

## 14. Closed decisions (this doc)

- ✅ TypeScript everywhere, strict.
- ✅ pnpm + Turborepo monorepo.
- ✅ React for UI/bag, Phaser for combat playback overlay.
- ✅ Pure-TS deterministic sim, main thread for M1.
- ✅ Fastify + Zod for server.
- ✅ Vite for client build.
- ✅ Tailwind for styling.
- ✅ `@dnd-kit` for drag/drop.
- ✅ Vitest + Playwright for testing.
- ✅ Sim API surface: `simulateCombat` / `replayCombat` returning a `CombatEvent[]` log.
- ✅ Replay invariant: byte-identical events across platforms.

---

## 15. Out of scope for this document

- Game mechanics, content tuning, UI flow → `gdd.md`, `balance-bible.md`.
- TypeScript domain types (Item, Recipe, etc.) → `content-schemas.ts`.
- Visual style, palette, motion → `visual-direction.md`.
- Event property schemas → `telemetry-plan.md`.
- Specific item / recipe / relic catalogs → `balance-bible.md`.
