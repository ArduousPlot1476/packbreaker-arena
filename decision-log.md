# Decision Log

Append-only. Newest at top. Format: `YYYY-MM-DD — [decision]. [Rationale or source.]`

---

## 2026-04-26

- M1.2.1 closed (sim package skeleton + RNG). Canonical mulberry32 PRNG (Math.imul + the standard chain + /4294967296 division), deterministic iteration helpers (canonicalPlacements, canonicalCells, stableSort), integer math utilities (applyPct, applyBp, clamp, sumInts with float-rejection). 55 tests passing, 100% line / 98.11% branch coverage on sim package. Cross-platform fixture file (test/fixtures/rng-sequences.json, 5 seed entries × 32 values each, generated on Node 18, locked with "DO NOT regenerate" header).
- Two operational additions: (1) content-schemas.ts § 0 allocation table updated to describe realized architecture (§§ 12–15 → content canonical, shared re-exports); (2) check-schemas-sync diff guard wired into turbo lint pipeline as a root-level task — edits to one schema file without the other now fail CI.
- Bundle delta vs. M1.1.1: 0 bytes (sim not imported by client yet, expected).
- Four open questions answered for M1.2.2: (1) tick ordering codified per balance-bible.md § 1.4 with two clarifications — within on_cooldown phase items fire in canonical placement order, within status_ticks phase player side resolves before ghost side; (2) status stack overflow caps silently at STATUS_STACK_CAPS, no event emitted for excess; (3) stun is per-side, one consumes at the moment any on_cooldown trigger would fire on that side; (4) random target selection rolls rng.next() at moment of effect application, empty filtered list short-circuits without rolling.
- Schema patch queued for M1.2.2: § 11 CombatEvent gains additive stun_consumed variant for replay log legibility.
- Branch hygiene operational decision: m1.1-scaffold (now carrying M1.1 + M1.1.1 + M1.2.1) to be merged to main as the M1.2.2 pre-flight step; M1.2.2 branches from clean main. Subsequent sub-phases follow the same pattern per CONTRIBUTING.md.
- Deviations ratified: nextInt uses simple floor formula (rejection-sampling not needed at sim scale); canonicalCells uses bounding-box generation (M1 content is exclusively rectangular; non-rectangular shapes are post-M1); stableSort is wrapper over Array.prototype.sort relying on engine stability guarantee; iteration.ts branch coverage at 95.45% (uncovered branch is rotation 270 path in boundingBox, deferred to M1.2.3 where rotated items appear in combat tests).

## 2026-04-26

- M1.1 closed (Scaffold + content). Branch m1.1-scaffold; main = M0 baseline. Bundle 194.69 KB JS / 9.46 KB CSS / 35→43 modules (+7.5% raw / +5.0% gzip vs M0 — within tolerance, ITEMS map tree-shaking deferred to M1.3).
- M1.1.1 closed (schema patch + ops prep). Three additive schema changes (§ 0 wording for shared ← content direction, § 3 buff_adjacent.matchTags optional, § 6 RelicModifiers.bonusGoldOnWin optional). Six content updates downstream (Conqueror's Crown +3 win-gold; Whetstone, Forge Anvil, Rune Pedestal, Master Alchemist's Kit explicit matchTags on buff_adjacent). 29 content tests pass (24 existing + 5 new, parameterized matchTags inheritance check across 4 items for granular failure messages). Bundle delta +0.14 KB / +0.07% vs M1.1.
- Schema consolidation side-effect of M1.1.1: §§ 12–15 (GhostBuild, LocalSaveV1, server DTOs, TelemetryEvent) lifted into the canonical schemas.ts. packages/shared/{save,telemetry,api,ghost} now re-export from @packbreaker/content. Public API surface preserved. content-schemas.ts and packages/content/src/schemas.ts are byte-identical post-patch.
- IsoTimestamp + IsoDate value constructors added to § 17 (cleanup — was inconsistent with the other 9 of 11 branded ID types in v0.1).
- Earlier "recipe detection regression" was a stale Vite dev-server cache, not a code bug. Confirmed via fresh dev-server restart + hard browser refresh: Iron Sword + Iron Dagger → Steel Sword fires, COMBINE button renders. 5 vitest cases added in apps/client during M1.1.1-bugfix as permanent regression coverage. detectRecipes extracted from App.tsx to apps/client/src/run/recipes.ts (free pre-payment toward M1.3 split).
- Operational additions for M1.2+: pnpm clean script (rimraf-based, portable); CONTRIBUTING.md with cache-bust ritual, test commands, branch hygiene. Prevents future false-positive regression reports.
- Schema interpretations ratified during M1.1: on_low_health threshold = 50% across all five panic-heal triggers; maxTriggersPerCombat = 1 on all on_low_health triggers; classAffinity tagged conservatively (8 Tinker, 5 Marauder, 32 neutral); Forge Tyrant Apple shifted from (3,2) to (4,2) per balance-bible.md § 6 iron-mace 2×1 H footprint.
- Architectural deviation ratified: shared imports branded types and structural primitives from content. Direction is unidirectional (shared ← content). Lint rules enforce.
- Long-tail items deferred: ITEMS map tree-shaking (M1.3); passiveStats.bonusBaseDamage kept reserved with no current consumers; passiveStats lint rule may need narrowing if non-Item symbols ever conflict.

## 2026-04-26

- Resolved tech-architecture.md § 13 open decisions, M1 scope:
  - **Auth provider (M2):** Discord OAuth. Audience-fit (16-34 roguelite players), creator-loop fit (replay sharing in Discord servers), 2-hour implementation vs. 2-day magic-link build. Email magic-link deferred to M3 as a second option if M2 telemetry shows >15% drop-off at auth.
  - **Hosting (M2):** Vercel (client) + Fly.io (server) + Neon (Postgres) + Upstash (Redis). Fastify is not Workers-shaped; Postgres with jsonb fits the GhostBuild schema natively; all three providers are reversible. Cloudflare stack revisit if M3 sustained DAU > 10k.
  - **PostHog (M1+M2):** cloud, not self-hosted. M2 demo-gate event volume (~6k/month) sits 3 orders of magnitude under the free tier. Privacy posture is clean regardless. Revisit at M3 if events exceed 500k/month or compliance changes.
  - **Aseprite (M1+M2):** Trey-owned single seat. Source files belong to the repo, not the license. Revisit when art headcount > 1.
- All four decisions are reversible. Each has a named revisit trigger.
- M1 graybox to be executed in 5 phased sub-milestones (M1.1 scaffold + content / M1.2 sim / M1.3 bag UI rewrite + dnd-kit / M1.4 combat integration + Phaser / M1.5 tutorial + daily contract + telemetry + boss). Phased rather than mega-prompt to catch determinism contract drift before bag UI is built on top of it, dnd-kit integration shape before combat overlay assumes it, etc. Total ~20 working days at peer-review pace, slightly under the 4–6 week roadmap window.

## 2026-04-26

- Closed Run Screen prototype. Final verification pass complete.
- Verification A (rarity-keyed glow color): code-trace confirmed end-to-end. detectRecipes → glowCells rarity Map → inline `stroke: RARITY[rarity].color` at App.tsx:431, beating the CSS class default via specificity. Build clean with temp recipe; src/data.ts reverted. Screenshot skipped — trace is deterministic.
- Verification B (glow legibility at cluster edges): root cause was not grid-line clipping (my hypothesis) but items' own rarity-frame borders painting after the glow in DOM order, occluding outward-facing cell edges. Claude Code's audit caught it. Fix applied: `zIndex: 5` on the recipe-glow SVG (App.tsx:424-428). Two-line diff, build clean (+20 bytes). Combine buttons remain above at zIndex: 10; items drop below glow.
- Aesthetic caveat noted: dashed outline now paints over item rarity-frame borders on participating cells. Acceptable for prototype. If "busy" rather than "halo" in M1 graybox, replace per-cell rect rendering with a single perimeter `<path>` stroked once (~30 lines of edge-traversal geometry). Deferred to M1.
- M1 deferred items list: (1) combine-button anchor algorithm — four-direction first-fit replacing upper-right-with-top-fallback, surfaces when bags get dense; (2) recipe-glow perimeter-path approach if needed; (3) App.tsx (717 lines) split into apps/client/src/{screens,bag,shop,hud} per tech-architecture.md § 5.1; (4) @dnd-kit migration replacing raw pointer events; (5) real Phaser combat overlay replacing canned 4s sequence in src/combat.tsx.

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
