# Decision Log

Append-only. Newest at top. Format: `YYYY-MM-DD — [decision]. [Rationale or source.]`

---

## 2026-04-26 — M1.1 Scaffold + content (closed)

- Migrated single-Vite-app prototype into pnpm 9 + Turborepo 2.9 monorepo per `tech-architecture.md` § 3. Layout matches spec: `apps/{client,server}`, `packages/{sim,content,shared,ui-kit}`, `tooling/{eslint-config,tsconfig}`. Workspace symlinks resolve via `workspace:*`; turbo orchestrates `build / lint / typecheck / test` with `dependsOn: ["^build"]`. M0 prototype now runs from `apps/client` consuming `@packbreaker/content` for items + recipes (4 of 12 bible recipes survive the seed-set filter — steel-sword, healing-salve, fire-oil, ember-brand; the rest reference items not in the prototype's 12-slug seed shop+bag).
- **Content authored**: 45/45 items (20 Common + 12 Uncommon + 8 Rare + 4 Epic + 1 Legendary), 12/12 recipes, 12/12 relics (6 Tinker + 6 Marauder), 2/2 classes, 3/3 contracts (`neutral`, `forge-tyrant-boss`, `daily-placeholder`), Forge Tyrant `GhostBuild`. Cross-reference test suite (`packages/content/test/items.test.ts`) validates uniqueness, cost-vs-rarity, recipe I/O references, relic affinities, class-relic-pool integrity, and boss bag fits without overlap.
- **Schema gap surfaced**: balance-bible.md § 13 lists `bonusGoldOnWin: 3` on the Conqueror's Crown relic, but `RelicModifiers` (content-schemas.ts § 6) doesn't declare that field — only `ClassPassive` does. Field dropped from the relic for M1.1 with a code comment; ratify before M1.2 sim work either adds `bonusGoldOnWin?: number` to `RelicModifiers` (additive, low risk) or removes it from the bible (one less relic lever).
- **Spec deviation — `GhostBuild` allocation**: content-schemas.ts § 0 / § 12 and spec phase 5 step 8 put `GhostBuild` in `@packbreaker/shared` and have `boss.ts` import it from there. Combined with shared importing branded ID + struct types from content (for `TelemetryEvent` § 15 and `LocalSaveV1` § 13 — itself a deviation, see next bullet), this creates a true cyclic workspace dependency that turbo refuses to build. Resolved by moving the `GhostBuild` interface to `packages/content/src/ghost.ts` and having `packages/shared/src/ghost.ts` re-export it. Single-direction dep restored: `shared → content` only.
- **Spec deviation — shared imports content types**: lint rule says `packages/shared/** cannot import outside its own package`, but `TelemetryEvent`, `LocalSaveV1`, and `GhostBuild` all reference branded IDs and content schema types (`ItemId`, `RunId`, `BagState`, `RunState`, etc.). Strict isolation would force ~80 lines of duplicated type aliases. Chose the smaller evil: shared imports content for these types. Lint rule narrowed to forbid sim/ui-kit/runtime deps from shared, but allow content. Direction is `shared ← content` only, preserving the principle's spirit (shared types still don't reference *runtime* content code).
- **Spec deviation — `data.local.ts` retained as adapter**: spec phase 5 step 11 says delete the file. Could not — its non-content exports (UI styling `RARITY`, run-state seed `INITIAL`, demo `SEED_BAG` / `SEED_SHOP`, prototype's terser `ItemDef` / `BagItem` / `Cell` / `RunState` shapes, `cellsOf` / `dimsOf` helpers operating on prototype's BagItem) genuinely don't belong in `@packbreaker/content`. The file was rewritten to import `ITEMS` and `RECIPES` from the package and adapt them to the prototype's expected shape — the data SOURCE is now the package, satisfying the spec's intent. File retires when M1.3 splits App.tsx and the run controller starts consuming content directly.
- **Spec deviation — Forge Tyrant bag layout**: balance-bible.md § 15 lists `(2,2) 1×1 iron-mace` but § 6 declares iron-mace as 2×1 H — internal bible inconsistency. Items.ts is authoritative for shapes (45-item content port), so iron-mace stays 2×1 H. Apple's bag position shifted from (3,2) to (4,2) to clear iron-mace's footprint at (2,2)–(3,2). Boss-bag fit verified by the items.test.ts suite (no overlaps, all within 6×4). Ratify the layout edit, or amend bible § 15 / § 6 to agree.
- **`no-inner-declarations` ESLint rule disabled** in shared config. Strict-mode ESM TypeScript with let/const block scoping makes the pre-ES6 hoisting concern redundant, and the prototype's `detectRecipes` (App.tsx, deferred to M1.3 split) legitimately declares a `function*` generator inside a for-of loop that the rule would otherwise forbid.
- **Bundle delta**: M0 baseline 35 modules / 181.14 KB JS / 9.46 KB CSS → M1.1 final 43 modules / 194.69 KB JS / 9.46 KB CSS. +8 modules, +13.55 KB JS (+7.5%), CSS unchanged. Within the spec's ±10% tolerance. The delta is the unused tail of `@packbreaker/content`'s 45-item registry — Vite's prod minifier doesn't tree-shake `Object.fromEntries(...)`-built tables when consumers iterate the values, so all 33 currently-unused items ship in the bundle. Acceptable for M1.1; revisit at M1.3 when App.tsx splits and the run controller can `import { ITEMS_BY_RARITY }` for narrower payloads.
- **Lint enforcement verified**: dropped a temp `Math.random()` call into `packages/sim/src/rng-trip.ts`, ran `pnpm --filter @packbreaker/sim lint`, got the configured `no-restricted-syntax` error ("Sim must use the seeded mulberry32 RNG, not Math.random") — file deleted, lint back to green. The boundary is wired.
- **Decisions deferred** (tracked here so M1.2 doesn't re-discover them): (1) ratify or reject `RelicModifiers.bonusGoldOnWin` schema addition; (2) ratify or reject the `GhostBuild` allocation flip (content vs shared); (3) ratify or reject `shared → content` import direction; (4) ratify the Forge Tyrant apple shift (or amend the bible); (5) decide whether `data.local.ts` retires at M1.3 split or earlier; (6) confirm `bonusBaseDamage` on `PassiveStats` (declared per v0.1 changelog but reserved for future use — currently no item uses it).

---

## 2026-04-26

- Reviewed Run Screen prototype build (Claude Code port of the Claude Design artifact). Layout, palette, recipe-detection logic (multiset match + BFS connectivity over edge-adjacency), placement validation (O(1) occupied-cell map), and code structure pass review against `visual-direction.md` and `gdd.md` § 14. CSS variables carry the palette; Tailwind is layout-only — correct separation for token-driven UI. No `localStorage`, no fabricated mechanics, no library drift beyond dropping lucide-react in favor of inline SVG (acceptable: prototype already shipped its own icon system optimized for the silhouette discipline checklist).
- Identified five fix items for revision pass: (1) recipe-glow stroke must be data-driven from output rarity, currently hardcoded to `--r-uncommon` in `index.css`; (2) round-end victory button recolored from rarity-uncommon green to accent blue, matching run-screen Continue CTA — rejected adding a third semantic palette extension; (3) combine button anchor moves from cluster centroid to bounding-box upper-right (centroid overlaps neighboring items in tight bags); (4) `R` rotation gated/silenced for square items (1×1, 2×2) to prevent visual-rotation-as-bug perception; (5) drag cleanup on `pointercancel` + window `blur` to eliminate stuck-drag-ghost footgun. Single-file `App.tsx` (717 lines) deferred to M1 graybox refactor when Claude Code splits into `apps/client/src/{screens,bag,shop,hud}` per `tech-architecture.md` § 5.1.
- Six DoD screenshots and the three-anchor monochrome silhouette test still outstanding from the prototype build — Claude Code refused to fabricate (correctly; sandboxed code agent has no browser). Trey to capture during the revision pass: mid-drag valid outline, invalid drop shake, rotation in progress, recipe-ready glow, post-combine state, round 5 returned state, plus monochrome 32×32 renders of Iron Sword / Healing Herb / Ember Brand for `visual-direction.md` § 11.1 silhouette test.
- Resolved body-color rule tension via Option A: identity/tag colors (plant, fire, food, blood, gold) override the "body color ≠ another rarity's color" rule, with frame border + corner gem doing the rarity work. Updated `visual-direction.md` § 5 wording: "Body color must not collide with another rarity's frame color *unless the body color is the item's natural material or tag color (fire, ice, plant, food, gold, blood)*. The corner gem and frame border resolve any rarity ambiguity." No item recolors needed. Healing Herb green, Apple red, Spark Stone amber, Copper Coin gold all hold. Rejected Option B (recolor to sage/burgundy/burnt-orange) — the original rule was written to prevent unmotivated rarity collisions, not to ban natural identity colors, and demanding identity colors dodge rarity colors leaves no palette for plants, fire, food, or blood (most of the item set).
- Locked Run Screen UX prototype (Claude Design artifact, ported to Vite app at repo root). Validates run-screen layout, drag/drop ergonomics (raw pointer events, not @dnd-kit — preserved fidelity to design package, dnd-kit deferred to M1 graybox), recipe glow legibility, and shop loop tempo before Claude Code begins on `apps/client`. Single Vite app, not monorepo (M0 scope; Turborepo + package boundaries are M1 architecture work). Canned 4-second combat overlay in `src/combat.tsx`, not Phaser (combat overlay belongs to M1 packages/sim work). Discarded after M1 graybox lands. Stack: React 18 + Vite + Tailwind core utilities + inline SVG icons, no external libraries beyond what artifacts ship with.

## 2026-04-27

- Locked `telemetry-plan.md` v0. Four M1 goals: run completion, synergy depth, time-to-fun, determinism integrity. Three dashboards (Run Health / Item Meta / Onboarding Funnel). PostHog cloud for M1, revisit at M2. `error_boundary_caught` added to M1 event set for crash visibility.
- Established M1 alert thresholds: tick-cap draws > 1%, item pick-rate < 2% or > 35%, recipe completion 0% over 50 runs, class win-rate gap > 8pp, build win-rate > 60%. All inherit from `balance-bible.md` § 16.
- Locked second style frame (390×844 mobile vertical, Round 7). Gridline scales to mobile cleanly. Anchor icons identifiable at 52px cell + 24px mono swatch. Bag occupies 88% of horizontal dim. Mobile pillar validated.
- Floating CTA placement on mobile is unresolved — original spec (bottom: 72px) overlaps the reroll button. Three options (inline, swap-with-reroll, full-width-bar) deferred to M1 component design. Not blocking.
- Schema bumped to v0.1 (additive). `Item.passiveStats` added (`maxHpBonus` / `bonusBaseDamage` / `goldPerRound`) — applied by run controller, sim never reads. `Trigger.maxTriggersPerCombat` added — caps single-use and limited-use items. `ContractMutator['boss_only']` extended with `hpOverride` / `damageBonus` / `lifestealPctBonus` for Forge Tyrant.
- Locked status stack caps: burn 10, poison 10, stun 1 (boolean). Codified in `STATUS_STACK_CAPS` constant in `content-schemas.ts` § 16. `BASE_COMBATANT_HP = 30` also lifted into the schema as a named constant.
- Locked Forge Tyrant as M1 boss: scripted Marauder ghost, 50 HP, "Tyrant's Wrath" aura (+2 damage, +15% lifesteal). See `balance-bible.md` § 15.
- Visual direction v1.1: added semantic UI palette extensions (`life-red` `#EF4444` for hearts, `coin-gold` `#F59E0B` for gold glyph) and the body-color rule (frame ≠ body color, except self-rarity).
- Locked first style frame (1280×720 desktop, Round 7 mid-game) and the three anchor icons after one revision pass: Iron Sword, Healing Herb, Ember Brand. All six silhouette discipline tests pass on all three anchors. Established two principles: (1) "rarity = frame, tag = body+accents, body color ≠ a different rarity's color"; (2) two semantic UI palette extensions allowed (`life-red`, `coin-gold`) outside the rarity language.
- Locked balance bible v0. 45 items, 12 recipes, 12 relics, 2 classes (Tinker recipe-bonus +10%, Marauder +1 dmg / +2 win-gold), 3 status effects, Forge Tyrant boss. Power budget framework: damage-equivalent per 12s combat. Common 6, Uncommon 10, Rare 14, Epic 21, Legendary 30. Pick-rate guardrails 2%/35% inherit from `concept-brief.md`.

## 2026-04-26

- Locked visual direction: **Gridline**. Palette + Inter typography baked. Tabular numerals mandatory on numeric displays. See `visual-direction.md`.
- Anchor icon set locked: Iron Sword (Common 1×2), Healing Herb (Common 1×1), Ember Brand (Rare 2×1 with on-hit burn). System-anchor set for first style frame.
- Silhouette discipline checklist (6 tests) adopted as acceptance gate for all icon work.

## 2026-04-25

- Locked content schemas v0. Branded IDs across all entity types. Discriminated unions for `Trigger`, `Effect`, `CombatEvent`, `ContractMutator`. See `content-schemas.ts`.
- Sim integer math via basis points (`itemCostMultiplierBp`, `sellRecoveryBp`). Floats forbidden in sim inputs.
- Combat events carry inline `remainingHp` to prevent replay-vs-sim drift.
- `DEFAULT_RULESET` fixes M1 baseline: 6×4 bag, 11 rounds, 3 hearts, 5 shop slots, 4g base income +1g per 3 rounds.

## 2026-04-25

- Locked stack: TypeScript + pnpm + Turborepo monorepo. React 18 + Vite for client shell. Phaser 3 for combat overlay only. Fastify + Zod for server. Pure-TS deterministic sim package (mulberry32 RNG, 10 ticks/sec, integer math). See `tech-architecture.md`.
- Locked sim API: `simulateCombat` → `CombatResult` with full event log. Sim runs to completion before playback. Byte-identical events across platforms (CI fixture suite, 200+ combats).
- Locked monorepo layout: `apps/{client,server}`, `packages/{sim,content,shared,ui-kit}`. Sim forbidden from importing DOM, React, Phaser, `Date`, `Math.random`.
- Renderer split: React owns bag UI / shop / HUD. Phaser overlay owns combat playback only.

## 2026-04-25

- Locked run structure: 11 rounds (10 standard + 1 boss), 3 hearts, 24-cell bag (6×4), 5 shop slots. See `gdd.md`.
- M1 content targets: 45 items, 12 recipes, 12 relics, 2 classes, 3 status effects, 1 boss.
- Manual recipe combine via click in M1. Reconsider after graybox playtest.

## 2026-04-24

- Adopted Packbreaker Arena from 8-concept evaluation. Source: project PDF.
- Set M0–M3 milestone structure (durations: ~1wk / 4–6wk / 10–12wk / 18–24wk). See `roadmap.md`.
- Set M2 demo-gate metrics: D1 ≥ 35%, run completion ≥ 55%, median session ≥ 1.6 runs, time-to-first-fun ≤ 4 min.