# Decision Log

Append-only. Newest at top. Format: `YYYY-MM-DD — [decision]. [Rationale or source.]`

---

## 2026-04-28 — M1.2.3a Combat resolver prep (closed)

- M1.2.3 split into 3a (this) and 3b (resolver core, separate prompt later) per CONTRIBUTING.md branch-hygiene preference. 3a lands additive schema work + M1.2.2 follow-ups + the TriggerState module so the resolver in 3b consumes settled foundations.
- Schema patch (additive, M1.2.3a, v0.3): added `buff_remove` variant to `CombatEvent` (§ 11) in both `content-schemas.ts` and `packages/content/src/schemas.ts`. Carries `tick`, `target: ItemRef` (the buffed item), `stat: BuffableStat`, `amount` — pairs with the matching `buff_apply` for replay-log readers without a lookup table. `pnpm check-schemas-sync` confirms files remain byte-identical. Locked per `e48bac9`.
- Three M1.2.2 follow-ups applied:
  - **`_side` parameter dropped** from `tickStatusDamage` in `packages/sim/src/status.ts`. `EntityRef` import removed. Six test call sites in `status.test.ts` updated. The resolver attributes damage by which `StatusState` instance it passes in.
  - **`status.ts` re-application doc note** added above `applyStatus`: "Re-application adds stacks; does NOT reset `burnRemainingTicks`." Game-feel rationale: re-application can't extend lifespan.
  - **`balance-bible.md` § 4 burn-prose amended** — sequence "5+5+4+4+3+..." replaced with "5,4,4,3,3,2,2,1,1" matching the spec-pinned tick order (status_ticks at phase 4 BEFORE cleanup at phase 6) which produces 25 total. Bible's "≈ 25 over its lifetime" was load-bearing; the sequence text was the writeup error.
- TriggerState module landed in `packages/sim/src/triggers.ts`. Surface mirrors `status.ts` exactly: pure verbs over a mutable struct, no classes, no environment access. Surface: `createTriggerState`, `accumulateCooldown` (no-op when entries empty), `shouldFire`, `recordFire`, `isFiringCapped`. Lazy entry creation on first access in the keyed verbs (`shouldFire` / `recordFire` / `isFiringCapped`) — `accumulateCooldown` only increments existing entries. A trigger that "becomes eligible" mid-combat (future `summon_temp_item`) starts at `cooldownAccumulator = 0` and accumulates only ticks observed AFTER its first access. Documented in module doc-block: the alternative (a global tick counter consulted on lazy-init) makes a trigger's eligibility a function of resolver call order, not resolver state, breaking determinism.
- Test count: 112 (was 89 at M1.2.2, +23 on triggers). Coverage: 100% statements / 99.1% branches across the sim package; `triggers.ts` at 100% all four metrics. The remaining branch shortfall is the same `iteration.ts:151` rotation-270 path deferred from M1.2.1, scheduled for M1.2.3b when fixture suite exercises rotated bag layouts.
- Bundle delta vs. M1.2.2: zero. Sim still not imported by client. Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Deviation ratified: `triggers.ts` `accumulateCooldown` uses bare `Array.prototype.sort()` (ECMA262 default ToString + UTF-16 code-unit compare) over an internal `compareStrings` helper. Entry keys are unique by construction, so the helper's 3-way `a === b` branch would have been unreachable and blocked 100% branch coverage. Bare sort produces the same canonical order without the unreachable branch. `iteration.ts` retains its own `compareStrings` because it's a tiebreaker over potentially-equal placementIds in equal cells, where the unreachable branch is a real but unreached edge case worth keeping flagged.
- Branch hygiene: m1.2.3a-resolver-prep branched off main (b52d311), two commits (69b903f schema/follow-ups, 0a37034 triggers module). Ready for `--no-ff` merge to main.
- M1.2.3b (combat resolver core + hand-authored fixture suite) prompt drafts after this merge lands.

---

## 2026-04-28 — M1.2.2 review flags + bible amendment (ratified)

- M1.2.2 ratified for merge. Three follow-up items deferred from
  the review pass; tracked here so they don't go missing.
- **Flag 1 — `_side` parameter cleanup in `tickStatusDamage`.** The
  current API takes a `side: EntityRef` parameter the function never
  reads, named `_side` with a paired eslint-disable. The resolver
  attributes damage by which `StatusState` it passes in, not by a
  side label. Drop the parameter and the disable in M1.2.3 when the
  resolver becomes the first consumer. `cleanupStatus`'s `_currentTick`
  is kept — cleanup is conceptually time-aware and adding it back
  later would touch every call site.
- **Flag 2 — `balance-bible.md` § 4 burn-prose amendment.** The
  bible's sample sequence "5+5+4+4+3+..." is internally inconsistent
  (sums to 30, not the stated ~25). With the spec-pinned tick order
  (status_ticks at phase 4, cleanup at phase 6), a 5-stack burn
  produces 5,4,4,3,3,2,2,1,1,0 = 25. The "~25 total" is the
  load-bearing number; the sequence text is the writeup error.
  Amend § 4 prose to "5,4,4,3,3,2,2,1,1 ≈ 25 over its lifetime" or
  drop the sequence and keep "~25 damage over its lifetime." Folded
  into the M1.2.3 prompt as a docs-side task.
- **Flag 3 — burn re-application doc note in `status.ts`.** Current
  impl: `applyStatus` adds stacks but does NOT reset
  `burnRemainingTicks`. Burn at t=5 (5 stacks) followed by burn at
  t=15 (3 stacks) gives burn=8 with the decay clock still ticking
  from the first application. This is the right call for game feel
  (re-application doesn't extend lifespan), but undocumented. Add a
  one-liner to `status.ts` doc block in M1.2.3: "Re-application
  adds stacks; decay timer is not reset."
- M1.2.3 (combat resolver) locked answers, recorded here for the
  prompt:
  - Reaction firing order: single reaction round per top-level damage
    event, canonical placement order on each side. No cascade.
  - `buff_remove` event: add now as additive schema patch.
    Replay-log legibility for mid-combat buff expiry.
  - Damage cascade discipline: single-round, no cascade. Bloodmoon
    Plate's retaliation does NOT trigger Vampire Fang's `on_hit` on
    the boss side. Cascading is an M3 lever if a future item wants it.
  - Trigger state ownership: `TriggerState` struct, same shape as
    `StatusState`. Per-side mutable. Keys: (placementId, triggerIndex).
    Holds cooldownAccumulator, firedCount (gated by
    maxTriggersPerCombat), lowHealthFired boolean.
  - Damage cap / negative HP: floor inline at 0. CombatEvent.damage.amount
    = actual HP reduction (capped at current HP).
    remainingHp = max(0, hp − rawAmount).

---

## 2026-04-28 — M1.2.2 Status effects + status engine (closed)

- Branch hygiene reset: `m1.1-scaffold` merged to `main` as a `--no-ff` merge commit (`c9f555f`) carrying M1.1 + M1.1.1 + M1.2.1. New work branched as `m1.2.2-status-effects` from the merge commit. Per-milestone commits preserved underneath the merge. Going forward, each M1.x phase branches off `main` per CONTRIBUTING.md.
- Status engine landed in `packages/sim/src/status.ts`: `createStatusState`, `applyStatus`, `tickStatusDamage`, `cleanupStatus`, `consumeStunIfPending`. Pure-verb API mutating a single per-side `StatusState`; combat resolver (M1.2.3) owns one per combatant.
- Resolved four open questions from M1.2.1's report:
  - **Q1 (tick ordering)**: codified as `TICK_PHASES` const-asserted tuple in `iteration.ts` — `round_start`, `cooldowns`, `damage_resolution`, `status_ticks`, `low_health`, `cleanup`. Within `status_ticks`, player side resolves before ghost side. Within any phase, items iterate in `canonicalPlacements` order. Doc block added at the top of `iteration.ts`.
  - **Q2 (stack-cap overflow)**: silent cap at `STATUS_STACK_CAPS[type]`. No event for the overflow. `applyStatus(state, 'burn', 8)` on `burn=5` sets `burn=10`, drops the excess 3 stacks.
  - **Q3 (stun timing)**: per-side. `pendingStun` boolean on each combatant; `consumeStunIfPending` is the read-and-clear verb the resolver calls before any cooldown trigger fires on that side. When it returns true, the trigger's effects are skipped and a `stun_consumed` `CombatEvent` is emitted.
  - **Q4 (random target selection)**: `rng.next()` consumes at the moment of effect application via `resolveTarget`, never earlier. Empty filtered list returns null with zero rng consumption — the caller treats null as a no-op (no event).
- Schema patch (additive, M1.2.2): added `stun_consumed` variant to `CombatEvent` (§ 11) in both `content-schemas.ts` and `packages/content/src/schemas.ts`. Carries `tick`, `source: ItemRef` (the cooldown-skipped item), and `target: EntityRef` (the side whose `pendingStun` was consumed). `check-schemas-sync` confirms files remain byte-identical.
- Test count: 89 (was 55 at M1.2.1). New: 23 status cases + 7 `resolveTarget` cases + 2 `TICK_PHASES` cases + small extras. Coverage: 100% statements / 98.87% branches across the sim package; `status.ts` and `iteration.ts` both at 100% line coverage.
- Bundle delta vs. M1.2.1: zero (sim still not imported by client). Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Burn-decay timing fixed at "−1 stack per 20 cleanup ticks", first decay at the 20th cleanup post-application. This produces the bible's stated "~25 total damage from a 5-stack burn" total: the per-tick damage sequence becomes 5,4,4,3,3,2,2,1,1,0 (sum 25). The bible's sample sequence "5+5+4+4+3+..." appears to be a casual writeup; the spec-pinned tick order (status_ticks at step 4 BEFORE cleanup at step 6) makes 25 the correct total. Flagged as a deviation in the M1.2.2 report.
- Lint trip note: the spec asked for a demo of `apply_status` bypassing `STATUS_STACK_CAPS` via a literal 10. Skipped — the cap test in `status.test.ts` ("caps silently at STATUS_STACK_CAPS.burn (= 10)") catches the regression at the test level, which is more reliable than a syntax lint for a content-driven constant.
- Open questions for M1.2.3 (combat resolver): (1) on_hit / on_taken_damage reaction firing order when multiple items react to the same damage event; (2) buff_apply event lifecycle (when does an expired buff emit a removal event, if any); (3) whether the resolver flushes `damage_resolution` reactions to a fixed point (cascade allowed?) or strictly a single round of reactions per damage event; (4) heap state for `lastFiredAt` per cooldown trigger — owned by resolver or by a sim-internal "TriggerState" struct.

---

## 2026-04-27 — M1.2.1 Sim package skeleton + RNG (closed)

- `packages/sim` populated with the canonical mulberry32 PRNG, deterministic-iteration helpers (canonicalPlacements / canonicalCells / stableSort), integer-math utilities (applyPct / applyBp / clamp / sumInts), and an `invariant()` assertion stub. No combat code, no status effects, no run-state machine — those land in M1.2.2 through M1.2.4.
- Mulberry32 implementation matches the locked tech-architecture.md § 4.1 reference (Math.imul + `>>> 0` normalizer + `t | 1` / `t | 61` chain + `/4294967296` division). Single 32-bit state, `seed | 0` coercion at construction. Class is private; `createRng(seed)` is the only public constructor. Surface: `next()`, `nextInt(min, max)`, `clone()`, read-only `state` getter.
- 55 tests pass: 16 RNG (determinism + distribution + cross-platform fixture), 12 iteration, 23 math, 3 invariant, 1 barrel smoke. Coverage 100% statements / 98.11% branches across all sim files.
- Cross-platform fixture lives at `packages/sim/test/fixtures/rng-sequences.json`: 5 seeds × first 32 `next()` values each, captured on Node v18.20.5 from a byte-equivalent reference impl. Future Node updates / browser ports must match this fixture exactly — divergence is a bug, not a regeneration trigger.
- All tech-architecture.md § 4.1 determinism rules enforced or honored: no `Math.random` (lint trip demonstrated and reverted), no `Date.now` / `new Date()`, no DOM globals, no Node built-ins, no `@packbreaker/shared`, no read of `Item.passiveStats` (existing M1.1 lint rules cover all of these). Math utilities reject float input with NaN to prevent silent rounding errors.
- Housekeeping (M1.2 preamble items from M1.1.1 closure):
  - content-schemas.ts § 0 allocation table updated to describe realized M1.1 architecture: §§ 12–15 are canonical in `packages/content`, with `packages/shared` re-exporting for ergonomics. Mirrored to `packages/content/src/schemas.ts` (still byte-identical).
  - New CI diff guard `tooling/scripts/check-schemas-sync.cjs` wired into turbo as a root-level `//#check-schemas-sync` task, on which `lint` depends. `pnpm turbo lint` now runs the diff first and fails fast if the canonical and in-package schemas drift. Drift demo: appended a comment to one file, ran `pnpm check-schemas-sync`, got a useful `first diff at line N` error message; reverted; OK again.
- Bundle delta vs. M1.1.1: zero (sim not yet imported by client). Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Branch hygiene note: M1.2.1 was authored on `m1.1-scaffold` rather than a fresh `m1.2.1-sim-rng` branch off `main` (per CONTRIBUTING.md branch convention). `m1.1-scaffold` accumulates M1.1 + M1.1.1 + M1.2.1; main still holds M0 baseline. Trey's call whether to merge `m1.1-scaffold` to main and reopen a clean M1.2.x branch, or keep accumulating until M1.2 closes.
- M1.2.2 deferred items: status effect tick logic + `STATUS_STACK_CAPS` enforcement; `invariants.ts` will pick up real assertions there (combat module is the first sim consumer with shape-contract obligations beyond what types capture); coverage target on `iteration.ts` branches stays at 95.45% — the uncovered branch is the rotation 90/270 swap inside `boundingBox` which has a guard test, but exhaustive 4-rotation coverage across all 4 shape sizes is M1.2.3 work when the combat module exercises rotated bag layouts.

---

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
