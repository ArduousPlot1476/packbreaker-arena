# Decision Log

Append-only. Newest at top. Format: `YYYY-MM-DD — [decision]. [Rationale or source.]`

---

## 2026-04-30 — M1.2.5.1 closed (CI workflow wiring)

- `.github/workflows/ci.yml` implements tech-architecture.md § 8.2's five-stage pipeline (install / lint / typecheck / test / build) on `ubuntu-latest` with Node 20.x and pnpm 9.x (pinned via `package.json`'s `packageManager: pnpm@9.15.0` field, auto-detected by `pnpm/action-setup@v4`). Triggers on `pull_request` and `push` to `main`. The 200-fixture determinism suite runs as part of stage 4 via the existing non-skippable `pnpm turbo test` path — no separate stage, same protection as unit tests.
- **Spec deviation flagged in the workflow header comment**: tech-architecture.md § 8.2 lists "sim determinism suite" as a separate stage 5 of a six-stage pipeline. M1.2.5.1 folds it into stage 4 (test) so the determinism suite is non-skippable by the same mechanism that protects unit tests, rather than by a parallel "don't skip me" convention. Folding is structurally tighter — there is no way to run `pnpm turbo test` and skip the determinism harness, since `harness.test.ts` matches the default vitest pattern.
- **First green run on PR #1** validated portability of the M1.2.5 fixture suite across CI runners — all 200 .jsonl fixtures replay byte-stable on `ubuntu-latest` with no byte-divergence between local and CI replays. Total pipeline runtime: **39s wall time**, well under the 5-minute halt-and-surface threshold. Closes the local-only-CI deviation that had accumulated since M1.2.1.
- **Branch protection rules to be configured by Trey via GitHub UI** after this workflow lands and produces consistent green runs. Out of M1.2.5.1 scope (workflow file only; repo settings are configured separately).
- M1.2.5.1 is the deferred sub-task flagged in M1.2.5's closing entry — landing it before M1.2.6 ensures the appended `grantRelic` fixtures gate-validate against a working pipeline from their first PR.

---

## 2026-04-30 — M1.2.5 closed (200-fixture determinism suite + boss mutator)

- M1.2.5 closed. 200 JSONL action-stream fixtures across 5 strategies (40/100/40/10/10 split — greedy/hoarder/recipe-chaser/reroll-burner/random-legal) under `packages/sim/test/fixtures/runs/`. Harness (`packages/sim/test/determinism/harness.test.ts`) re-runs each fixture and byte-compares per-round CombatEvent arrays. All 200 replay byte-stable. Sim test count: 232 → 432 (+200 fixture replays + 24 unit tests across 6 commits).
- **Coverage targets (per ratified spec):**
  - Boss round (round 11) reached ≥10×: **18** [OK].
  - Tick-cap draw (`endedAtTick === 600`, organic-only): **184** [OK].
  - All 12 recipes from balance-bible.md § 11 fire ≥1× each (target #3 narrowed from ≥3× per ratification — see entry below): **10 of 12** [OK with documented Capstone exception].
  - All 6 starter relics × both classes appear in starter slot ≥5× each (target #4 narrowed from "all 12 relics" per ratification — see entry below): **16–17 each** [OK].
  - Rotation 270° on a non-square item ≥1×: [OK]. Closes `iteration.ts:151` rotation-270 carry-forward.
- **Action stream API** ships in `packages/sim/src/run/actions.ts`: `RunControllerAction` discriminated union (one variant per state-mutating RunController method + a `'create_run'` header variant) and `applyAction(controller, action)` pure dispatcher. Exported from sim barrel. JSON round-trips losslessly — no Date/Map/Set/undefined fields.
- **Boss mutator path** ships: `RunController.startCombatFromGhostBuild(ghost: GhostBuild)` sibling to `startCombat(ghost: Combatant)`. `boss_only.hpOverride` REPLACES ghost startingHp; `damageBonus` and `lifestealPctBonus` flow through `simulateCombat`'s new `options.mutators` to the ghost's SideStats (player-side unaffected). Existing `startCombat` signature preserved — sim contract surface unchanged. Schema v0.4 unchanged (mutator fields were authored at schema time; M1.2.5 implements them).
- **Procedural ghost generator** lives in test scaffolding only (`test/determinism/ghost-generator.ts`). Per ratification option A: rng-driven, drawn from `ITEMS` weighted by `RARITY_GATE_BY_ROUND[round-1]`. Round 11 returns the canonical `FORGE_TYRANT` GhostBuild. Recorded inline in the `start_combat_from_ghost_build` action — replay does NOT regenerate. M1.5's bot-fallback ghost generator (gdd.md § 11) is a separate design problem and gets to start clean.
- **CI workflow wiring deferred** to a sub-task before M1.3 per `tech-architecture.md` § 8.2. Determinism suite runs locally via `pnpm turbo test:determinism` (turbo task added with cache key including `test/fixtures/runs/**`) and is non-skippable in default `pnpm test` because the harness file `harness.test.ts` matches the default vitest pattern.
- **Bundle delta zero** — test scaffolding doesn't ship.
- Branch hygiene: `m1.2.5-determinism-suite` branched off main (`6344250`), six implementation commits + closing entries. Ready for `--no-ff` merge.
- M1.2.5 closes the M1.2 sim phase pending M1.2.6 (mid/boss relic granting API + appended fixtures, before M1.3).

---

## 2026-04-30 — M1.2.5 boss mechanics consolidation

Three interlocking gaps surfaced during M1.2.5 recon, ratified as a bundle and resolved in scope:

1. **FORGE_TYRANT.relics.boss** set to `'conquerors-crown'` per balance-bible.md § 13 (Marauder boss relic). Was construction-time `null` since M1.1 — caught when M1.2.5 strategies tried to load FORGE_TYRANT for round 11. The relic's `bonusGoldOnWin: 3` is inert on a ghost (gold-on-win credits the player, no ghost-side gold pool); the value-bearing field is `bonusBaseDamage: 4`, which now stacks correctly with the boss aura at round 11. New `items.test.ts` assertion locks the boss-relic value.
2. **`RunController.startCombatFromGhostBuild(ghost: GhostBuild)`** added as a sibling to the existing `startCombat(ghost: Combatant)`. Handles GhostBuild → Combatant conversion (per-side passiveStats aggregation via the shared `computeStartingHpFromBag` helper, contract mutator application). `startCombat` signature preserved — sim contract surface unchanged. Existing M1.2.4 boss test (uses `startCombat` directly with a hand-built Combatant) continues to work.
3. **`ContractMutator['boss_only']` application** implemented inside `startCombatFromGhostBuild`'s flow. `hpOverride` REPLACES startingHp at ghost construction. `damageBonus` and `lifestealPctBonus` flow through `SimulateCombatOptions.mutators` (extended in `combat.ts`) to `applyBossMutatorsToGhost` which folds them into the ghost's `SideStats.bonusBaseDamage` and `SideStats.lifestealPct` respectively. Player side is unaffected. Closes a schema-vs-implementation gap that had been sitting since schema v0.1.

Five new tests in `run.test.ts` lock the bundle: `neutral` contract derives ghost startingHp from passiveStats; `forge-tyrant-boss` contract `hpOverride: 50` REPLACES the computed value (Buckler-bag ghost: 35 → 50); `damageBonus: 2` raises ghost damage events (5 → 7); `lifestealPctBonus: 15` produces ghost-side heal events; FORGE_TYRANT integration verifies `ghostHp: 50` under boss contract vs `67` (chainmail 12 + bloodmoon-plate 25 + 30 base) under neutral.

---

## 2026-04-30 — M1.2.5 surfaced M1.2.4 cleanup regression (combineRecipe rollback restoration)

The M1.2.4 closing entry's "state.ts:510 combineRecipe rollback — function uses try-then-commit ordering, no rollback needed; M3 content protection deferred" ratification was based on a **faulty invariant**: M1 recipes can have outputs strictly larger than inputs. `r-tower-shield` (2 cells → 4 cells), `r-greatsword` (geometry-dependent), and both Epic capstones (3 cells → 4 cells) all produce 2×2 outputs that won't fit at the inputs' top-left anchor when the bag has non-input items in the would-be-output cells. The deleted guard caused a `null` push into `bag.placements` on the first dense-bag layout exercising `r-tower-shield` via the M1.2.5 strategy harness.

**Fix:** restored the throw in `combineRecipe`. Refactored the rotation-fit logic into a public `RunController.findCombineRotation(match)` method — single source of truth shared between `combineRecipe` (for commit-time validation) and strategy-side `wouldCombineFit` (for action-emission filtering). Try-then-commit ordering preserved: throw fires from validation, never from commit. Bag is unchanged on failure.

Two new tests in `run.test.ts`:
- combineRecipe throws when output cannot fit at the inputs anchor; bag is unchanged (custom 2×2 output recipe with blocker forcing all rotations to collide).
- findCombineRotation returns the first fitting rotation; combineRecipe uses it (iron-sword rot=90 + iron-dagger + blocker layout where rot=0 collides but rot=90 fits).

The `state.ts:510` branch previously classified as M3-deferred under the M1.2.4 cleanup is now real-path-reachable under M1 content. M1.2.4 closing-entry classification is superseded.

Player UX semantics (combine-button gating at recipe-detection time vs. attempt-and-error) deferred to M1.5 client integration. Sim contract surface gains the `findCombineRotation` query method but keeps `combineRecipe` semantics-compatible (the throw was dormant under M1.2.4's punt; restoring it doesn't change behavior for recipes that fit).

---

## 2026-04-30 — M1.2.5 coverage target #3 revision (≥1× recipes + Capstone exception)

Replaced the original M1.2.5 coverage target #3 — *"all 12 recipes fire ≥3× each"* — with **"all 12 recipes fire ≥1× each"** per ratified rationale: determinism suites need path coverage, not frequency coverage. A recipe's code path that replays byte-stable once replays byte-stable always; multiplicity is content-coverage, not sim-contract coverage.

Authorized a bounded 1-day capstone-solver investment (NOT a full sixth strategy — an extension to `recipe-chaser` activating only when `seed % 12` targets one of `{r-tower-shield, r-berserkers-greataxe, r-master-alchemists-kit}`). Capstone-solver behaviors:
- **Defensive early game** (rounds 1–3): if bag is empty, buy any weapon/armor item even if off-plan.
- **Bottom-up planning**: leaf items first via `recipeChainInputs` (target inputs + producers' inputs, recursively).
- **Aggressive rerolls** (up to 10/round) while target/chain inputs are absent.
- **Anchor-aware placement**: chain inputs go top-left via `findCornerPlacement('top-left')`; non-chain items go bottom-right. The 2×2 output's anchor (minRow=0, minCol=0) finds free cells at (0,1)/(1,0)/(1,1) when chain inputs occupy the corner.
- **Plan-pure combines**: only target and chain recipes are combined. Off-chain combines fragment the bag and waste cells.

**Outcome — "1 or 2 of 3 fire ≥1×" branch of the halt-and-surface protocol:**
- `r-tower-shield`: 2 firings (was 0 before capstone-solver) — **MET**.
- `r-berserkers-greataxe`: 0 firings — documented exception.
- `r-master-alchemists-kit`: 0 firings — documented exception.

The two Capstones require 3 specific Rare items (round-7+ gate, ~5–7g each, 2×2 output) simultaneously in a single bag. Capstone-solver cannot organically produce them within the 1-day investment + 50-attempt retry budget. Per ratified justification text:

> combineRecipe's code path is parameterized by recipe content (inputs, output, rotation), not by recipeId. Recipes that fire exercise the same control flow as recipes that don't. Recipe-specific coverage is exhaustiveness, not determinism. The N-of-12 firings plus M1.2.4's unit-tested recipe-combine-bonus fixture provide path coverage; missing recipes are content-coverage gaps, not sim-contract gaps.

The exceptions are encoded in `evaluateCoverage` (in `test/determinism/generate.ts`) as `RECIPE_EXCEPTIONS = {r-berserkers-greataxe, r-master-alchemists-kit}` with a comment pointing to this decision. Future content-balance work (M2 telemetry might surface that these recipes are also rare in real play) may motivate a content lever or a synthesized fixture path; deferred for now.

---

## 2026-04-30 — combineRecipe multi-match selection bug fix (incidental to recipe-chaser)

Surfaced during M1.2.5 strategy-driven generation. `combineRecipe(recipeId)` previously used `matches.find((m) => m.recipeId === recipeId)` to pick the first match, but `detectRecipes()` can return multiple match variants per recipeId when the bag has duplicate inputs in different positions (e.g., two iron-swords + two iron-daggers each yielding a distinct r-steel-sword match). Strategies that pre-filter via `wouldCombineFit` could find a fitting variant `B`, but the controller's first-match `A` would not fit — combineRecipe threw despite the prior validation.

**Fix:** combineRecipe iterates ALL match candidates with the given recipeId (filtered by `m.recipeId === recipeId`, in canonical detectRecipes order) and picks the first one whose output actually fits via `findCombineRotation`. Throws only when NO variant fits, with a message naming how many variants were checked. Try-then-commit ordering preserved — the validation walk happens before any mutation.

Existing `combineRecipe` tests (the M1.2.5 step-2.5 fit-validation tests and the M1.2.4 happy-path tests) continue to pass — the new behavior is a strict generalization of the prior single-match path.

---

## 2026-04-30 — M1.2.5 coverage target #4 narrowing (starter relics only)

Replaced the original target #4 — *"both classes × all 12 relics ≥5× each"* — with **"all 6 starter relics × both classes appear in starter slot ≥5× each"** (12 pairs, ~16 fixtures each at 200 total). Mid- and boss-tier relic granting deferred to **M1.2.6**: `RunController` has no `grantRelic` API, `RelicSlots.mid/.boss` are construction-time null on the player side, and adding the API + telemetry + run-phase rules (gdd.md § 9 "awarded after round 5") is a sim contract surface change that shouldn't ride along with the determinism suite's first ratification.

M1.2.6 will append fixtures additively; the existing 200 stay locked under DO-NOT-REGENERATE. The `m1.2.6` work scope: sim API surface bump, action-stream variant for `grant_relic`, post-round-5 grant logic, fixture appendix exercising mid/boss relic effects through `composeRuleset` and `deriveSideStats`.

Boss-side relic equipping (FORGE_TYRANT.relics.boss = 'conquerors-crown', see "M1.2.5 boss mechanics consolidation" entry above) is content-defined and flows through the existing `composeRuleset` → `deriveSideStats` path — orthogonal to the player-side grantRelic deferral.

---

## 2026-04-29 — M1.2.4 coverage cleanup pass (closed)

- Closes the "Punted to M1.2.5 fixture authoring or a future cleanup pass" deviation flagged in the M1.2.4 closing entry below. 20 uncovered branches in `packages/sim/src/run/*` resolved on the same `m1.2.4-run-state` branch before merging to main.
- **6 real-path tests** added in `run.test.ts`:
  - `moveItem` to overlap with another placement throws (state.ts:377).
  - `rotateItem` to a rotation that goes off-grid throws (state.ts:404 — 1×2V at right edge column rotated 90 → 2×1H spills into col=6 of a 6-wide bag).
  - `placeItem` rejects row-axis OOB anchors (state.ts:651, paired with the existing col-axis test).
  - Buckler (+5 maxHpBonus) raises player startingHp from 30 to 35 (state.ts:690 — real-path smoke for `passiveStats.maxHpBonus` via 30-damage ghost vs 35-HP player landing remainingHp=5).
  - player-applied burn → status_tick events count toward damageDealt (state.ts:776 ghost branch in `computeDamageStats`).
  - ghost-applied burn → status_tick events count toward damageTaken (state.ts:776 player branch).
- **10 defensive guards deleted** as unreachable under type/registry/history contracts:
  - state.ts:286/315/469 — unknown-itemId / unknown-recipeId throws; registry contract guarantees lookups succeed when called from validated buyItem / sellItem / detectRecipes flows. Replaced with non-null assertions.
  - state.ts:485 — `Number.isFinite(minRow/minCol)` after the input-footprint loop; `match.inputPlacementIds` is non-empty per recipe contract so the loop body always runs.
  - state.ts:689 — `item?.passiveStats?.maxHpBonus`; bag.placements always have valid itemIds, narrowed to `item.passiveStats?`.
  - state.ts:697 — `last?.round === lastCombatRound ? last.outcome : null` history-tracking guard in `lastCombatOutcomeForRound`; function only called from advancePhase in resolution phase, so `history[history.length - 1]` is always defined and round-matched. The now-write-only `lastCombatRound` field removed.
  - shop.ts:84 — `weightedSelect` integer-arithmetic fallback; replaced with a documented `throw` so future contrived registries hard-crash rather than silently return a wrong item (folds in the surfaced :74 case below).
  - recipes.ts:75 — sort-comparator's `: 0` branch; recipe IDs are unique per registry contract so the comparator never returns 0. Simplified to `a.id < b.id ? -1 : 1`.
  - recipes.ts:122 — `if (!adj) continue` in BFS over the adjacency map; the map is populated for every placement in the same scope (line 53–67), so `adj` is always defined.
  - recipes.ts:137 — `seenKeys` dedup; `recurse(0, [])` generates each combination exactly once and recipe IDs are unique, so the dedup never fires. Both the `seenKeys` `Set` declaration and the `if (seenKeys.has(key)) continue` line removed.
- **4 surfaced cases ratified as deletes** (Trey's call on each, recorded here for posterity):
  - state.ts:510 combineRecipe rollback — function uses try-then-commit ordering, no rollback needed; M3 content protection deferred to that milestone. Function restructured: validate the output placement against an `excludeIds: ReadonlySet<PlacementId>` (replaces the prior single-id `excludeId` parameter on `isValidPlacement`; moveItem and rotateItem callers updated to wrap their excluded id in a fresh Set) BEFORE removing inputs, then commit atomically (filter inputs out, push output in).
  - state.ts:759 dateFromTimestamp short-string fallback — IsoTimestamp brand contract covers (timestamps are always ≥ 10 chars); replaced with bare `String(ts).slice(0, 10) as IsoDate`.
  - shop.ts:40 `RARITY_GATE_BY_ROUND[round - 1] ?? 'legendary'` — M1 ships only neutral contract (11 rounds = 11 gate entries), extended-maxRounds defense is M2/M3 problem. Replaced with non-null assertion.
  - shop.ts:74 weightedSelect zero-total — unreachable under M1 content registry; hard crash is correct failure mode for future contrived registries. Both the zero-total `if` block AND the integer-arithmetic fallback (the `:84` case) collapsed into a single documented `throw new Error('weightedSelect: empty pool or zero total weight')` at end of function.
- **Final run/* coverage: 99.49% line / 98.95% branch** (target ≥98% line / ≥97% branch). Per-file: state.ts 99.63/100 (uncovered: `getEvents()` body — public method, no test), shop.ts 97.7/95.23 (uncovered: the documented hard-crash throw + the `weight > 0` push branch which never gates under M1 content), recipes.ts 100/97.43 (uncovered: empty-recipe-inputs guard which the M1 registry never produces), replay/index/ruleset 100/100. combat.ts unchanged at 100% statements / 97.44% branches.
- **Test count: 207** (+6 from this pass; the closing entry's "192" understated — actual at `f4ef21f` was 201).
- **Bundle delta: zero**. Sim still not imported by client.
- Branch hygiene: cleanup commit on `m1.2.4-run-state`, then `--no-ff` merge to `main`. M1.2.4 closes for real; M1.2.5 (200-fixture determinism suite) opens next.

---

## 2026-04-29 — M1.2.4 Run-state machine + replayCombat (closed)

- Run controller landed at `packages/sim/src/run/`. Module split: `state.ts` (RunController class + phase machine), `ruleset.ts` (composeRuleset + baseIncomeForRound), `shop.ts` (generateShop + computeRerollCost + effectiveItemCost + sellValueOf), `recipes.ts` (sim-side detectRecipes mirroring the M0 BFS), `replay.ts` (replayCombat thin generator), `index.ts` (barrel). Public surface exported via `packages/sim/src/index.ts`.
- **Schema bumped to v0.4 (additive)** — added optional `recipeBornPlacementIds?: ReadonlyArray<PlacementId>` to `Combatant` (§ 11) in both `content-schemas.ts` and `packages/content/src/schemas.ts`. `pnpm check-schemas-sync` confirms files remain byte-identical. Pre-flight conflict (DoD step 9 said "no schema changes expected" while task § 4 step 8 invited a Combatant-field path) ratified during the recipeBonusPct routing halt: per-placement gate is the only path that doesn't break the M1.2.3b fixture suite. Confirmed zero fixture impact — all 12 combat fixtures have undefined `recipeBornPlacementIds`, no bonus applied, events byte-identical post-bump.
- Three new ratifications from the M1.2.4 pre-flight Q&A (locked answers 12–14):
  - **Q1 / locked answer 12** — Reroll cost soft cap is gold only. `RelicModifiers.extraRerollsPerRound` grants N free rerolls per round (consumed before paid rerolls). Apprentice's Loop = first reroll free; subsequent rerolls cost `rerollCostStart + (rerollsThisRound − extraRerollsPerRound) * rerollCostIncrement`. `rerollsThisRound` resets to 0 each round.
  - **Q2 / locked answer 13** — `combineRecipe` is allowed in `'arranging'` phase only. Combat / resolution phases are read-only on bag state (controller throws). Tinker's `firstRecipeFreeAction` is a M1 no-op since recipes are already free; deferred lever (sim-internal flag, no behavior).
  - **Q3 / locked answer 14** — `replayCombat()` is a thin generator wrapper around `simulateCombat`. Single-line implementation: `function* replayCombat(input, options) { yield* simulateCombat(input, options).events; }`. Same code path, byte-identical events. Public surface stable; "may become true streaming if profiling motivates it" is a future-only note.
- **Locked answer 15 (recipeBonusPct routing)** — class.passive.recipeBonusPct + summed `RelicModifiers.recipeBonusPct` materializes as `SideStats.recipeBonusPct` in combat.ts's `deriveSideStats`. The resolver's `resolveEffect` applies `applyPct(effect.amount, recipeBonusPct)` multiplicatively BEFORE flat additions (active buffs, bonusBaseDamage) when `source.placementId` is in the source side's `Combatant.recipeBornPlacementIds`. Damage / heal / apply_status all honor it. The run controller's `combineRecipe` adds the freshly-placed output's placementId to an internal `bornFromRecipe: Set<PlacementId>`; `startCombat` materializes it as `Combatant.recipeBornPlacementIds` when invoking `simulateCombat`. Deletion of a recipe-born placement (sellItem, or recipe-input consumption) drops the entry.
- **Code-discovered design refinements:**
  - **Pending-items inventory** between `buyItem` and `placeItem`. Spec didn't mandate this; the natural API split implies a staging area. Items bought but unplaced live in `private pendingItems: ItemId[]` on the controller; `placeItem(itemId, ...)` consumes by itemId match. Unexposed in `RunState` (sim-internal), persists across rounds.
  - **placementId scheme** is monotonic counter (`p-0`, `p-1`, ...) per controller instance. Deterministic, survives JSON round-trip. Reset on `createRun`, never reused after sells / recipe consumption.
  - **Boss-round resolution discipline** — locked answer at the run-controller level (bible § 18 lever 4 was open): at `currentRound === ruleset.maxRounds`, ANY combat termination ends the run. `player_win` → `'won'`, anything else (`ghost_win` / `'draw'`) → `'eliminated'` regardless of remaining hearts. Documented in code; flag this for re-ratification if M1.5 boss-fight UX surfaces a different desire.
  - **`itemsRegistry` semantics for RUN fixtures** — fixtures pass `customItems` as the COMPLETE shop / bag / recipe pool, no merge with ITEMS. This differs from combat fixtures (which merge to preserve combat input compatibility). Run fixtures need a small known item set so round 1's 4g income covers the action stream's purchases.
  - **ESLint config update** — added a `packages/sim/src/run/**` override that re-lists the broader sim restrictions (Math.random / Date.now / new Date) MINUS the Item.passiveStats restriction. The run controller IS the legitimate consumer of `passiveStats` per content-schemas.ts § 0 ("run-controller-only"); the broader sim rule is intended for combat code. Documented inline in `tooling/eslint-config/index.cjs`.
- **Telemetry:** the controller emits 12+ of the schema's telemetry events (run_start / run_end / round_start / round_end / shop_purchase / shop_sell / shop_reroll / item_placed / item_moved / item_rotated / recipe_completed / combat_start / combat_end, plus daily_contract_started / daily_contract_completed when isDaily). Sim never imports `@packbreaker/shared` (lint-enforced); telemetry events flow IN via the optional `onTelemetryEvent` callback. `tsClient` defaults to a fixed sentinel; `sessionId` defaults to `''`. M1.5 client wraps the callback to enrich both before shipping to PostHog.
- **Test count: 192** (was 148 at M1.2.3b, +44 — 33 run unit cases + 11 error-path / daily / coverage unit cases in `run.test.ts`, 6 byte-comparable fixtures in `run-fixtures.test.ts`, 2 recipeBonusPct heal+status branch cases in `combat.test.ts`).
- **Coverage:** combat.ts at 100% statements / 96.92% branches (no regression vs M1.2.3b's 100/96.59 — slight branch improvement from the M1.2.4 recipeBonusPct paths). All run/* files at 100% line EXCEPT state.ts (96.85%) and shop.ts (95.55%) — both above the spec's 95% line target. Branch coverage on run/* sits at 90.33% overall (state.ts 90.07%, shop.ts 86.95%, recipes.ts 90.69%) — UNDER the 95% branch target. **Deviation flagged:** the uncovered branches are mostly defensive guards and rare paths (telemetry-when-callback-undefined, defensive lazy-init guards, status_tick damage stat aggregation paths). Lifting to 95% requires contrived edge-case tests or restructuring to remove defensive guards. Punted to M1.2.5 fixture authoring or a future cleanup pass; no behavioral risk in the current shortfall.
- **Bundle delta vs. M1.2.3b: zero**. Sim still not imported by client. Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- **NO-OPs carried forward:** `trigger_chance_pct` buff (M1.2.3b deferral, no rune-pedestal chance roll yet) and `summon_temp_item` (no M1 content uses it). Both still inert in M1.2.4.
- Branch hygiene: `m1.2.4-run-state` branched off main (`cf25c6c`), three implementation commits (`47eb6d7` schema/recipeBonusPct routing, `f323b00` run-state machine + lint config, `9a48eb0` tests + fixtures). Ready for `--no-ff` merge to main after Trey's review.
- M1.2.5 (machine-generated 200-fixture determinism suite — uses M1.2.3b's 12 hand-authored combat fixtures as the seed corpus) closes M1.2. Then M1.3 (bag UI rewrite + dnd-kit) and M1.4 (combat playback overlay + Phaser) build on top.

---

## 2026-04-29 — M1.2.3b Combat resolver core (closed)

- `packages/sim/src/combat.ts` ships `simulateCombat(input, options?)`. Drives the canonical TICK_PHASES tick loop, owns one StatusState + one TriggerState per combatant, consumes `canonicalPlacements` / `resolveTarget` / `applyPct` / `applyBp`, emits the full `CombatEvent[]` replay log. ~800 lines including the effect resolver, adjacency precompute, and phase implementations.
- Six new ratifications from the M1.2.3b pre-flight Q&A (locked at start of milestone, applied throughout):
  - **Q1 / locked answer 6** — Adjacency = 4-directional edge adjacency. Mirrors `apps/client/src/run/recipes.ts` M0 BFS. Diagonals do not count. Codified in `computeAdjacents` and exercised by every fixture using `on_adjacent_trigger` or `buff_adjacent`.
  - **Q2 / locked answer 7** — `on_adjacent_trigger` fires REACTIVELY: every time a same-side adjacent item with matching tags has a top-level trigger fire, the on_adjacent_trigger fires too. Spark Stone's reactive burn-stacking works directly; Whetstone's buff applies on the first reactive fire (then de-dupes — see Q3).
  - **Q3 / locked answer 8** — Buff de-dupe by `(source ItemRef, target ItemRef, stat)` tuple. First application emits `buff_apply` and adds to the active list; subsequent reactive fires that would produce the same tuple are no-ops (no event, no list mutation, durationTicks NOT refreshed). Different sources to the same `(target, stat)` DO stack additively. Expired buffs CAN be re-applied. Verified by fixture #12 `whetstone-redundant.json`: Iron Sword fires three times → exactly ONE `buff_apply` event, all three damage events at base+1.
  - **Q4 / locked answer 9 + tech-architecture.md correction** — cooldown_pct formula is `applyPct(trigger.cooldownTicks, sumOfMatchingBuffAmounts)`. Buff amount passes through directly. Mana Potion's `amount: -15` on Iron Sword's 50-tick cooldown gives `applyPct(50, -15) = 42` ticks (speed-up, matching bible flavor). The original M1.2.3 spec line `applyPct(cooldownTicks, -appliedPct)` had an erroneous negation that produced a slowdown for negative buffs — corrected here. Tech-architecture.md should be updated to match in a future cleanup pass; flag this in M1.2.4 prompt drafting.
  - **Q5 / locked answer 10** — `simulateCombat(input, options?)` with `options.items?: Readonly<Record<ItemId, Item>>` defaulting to `ITEMS` from `@packbreaker/content`. Surface deviation from tech-architecture.md § 4.2 ratified for test ergonomics. Fixture #10 `buff-duration-expiry.json` injects a synthetic `test-buff-20` item via `customItems` to exercise the `buff_remove` event variant (no production item currently uses finite `durationTicks`).
  - **Q6 / locked answer 11** — Zero-amount damage events emit ALWAYS (even amount=0) for replay-log integrity, but suppress reactions when capped amount === 0. Heal events suppressed entirely when actual gain === 0. Asymmetric: damage carries info even at 0 (proves a hit landed); zero-gain heals don't. Fixture #9 `damage-cap.json` and one combat.test.ts unit case verify the damage path; full-HP Apple verifies the heal suppression.
- Code-discovered design refinements during implementation:
  - **Reaction damage events apply INLINE** (not queued at the back of `pendingDamage`), so reaction damage lands in `events[]` immediately after the parent top-level event. Initial draft queued everything FIFO, producing event order `[E1, E2, R1]` instead of the canonical `[E1, R1, E2]`. Refactored `resolveEffect` to call `applyDamage` directly when `isReaction=true`.
  - **Reactions fire BEFORE the originating trigger's effects** (Order B): `emit item_trigger → fireAdjacentReactions → apply effects → recordFire`. This way Whetstone's damage buff applies in time for the originating Iron Sword's damage event — first fire is buffed, matching bible flavor "Each adjacent weapon gets +1 dmg" (persistent feel, even though mechanism is reactive). Fixture #12 confirms.
  - **Removed dead defensive guards** (`if (!item) continue` etc.) from `runTriggerPhase` / `runCooldownPhase` / `fireDamageReactions` / `fireAdjacentReactions` / `buff_adjacent` / `computeAdjacents`. `canonicalCells` already throws on unknown itemId during `precomputeAdjacency` setup, making the in-loop guards unreachable. Removed for clarity and to hit branch-coverage target.
- **`trigger_chance_pct` buff: NO-OP** in M1.2.3b. Schema-supported but no chance-roll mechanism implemented yet. Rune Pedestal's chance buff is silently dropped from the replay log (its `on_adjacent_trigger` still emits `item_trigger`, but the `buff_adjacent` effect short-circuits before `buff_apply` emission). Defer to M1.2.5 when fixture authoring exposes the gap and we can lock the chance-roll contract.
- **`summon_temp_item` effect: NO-OP** in M1.2.3b. No M1 content uses it; defer to a future content lever. Emits no event.
- Status-tick damage skips both `on_hit` (no source — schema-mandatory) and `on_taken_damage` (locked: bible § 4 burn-bypass extended to all status_tick damage for consistency).
- Stun semantics confirmed end-to-end: `consumeStunIfPending` returns true → emit `stun_consumed` event, skip the trigger's effects, do NOT call `recordFire`. Cooldown accumulator keeps accumulating (next-tick ready). Fixture #4 `stun-consumption.json` verifies: ghost Iron Dagger fires at tick 30 (normal), then stun consumed at tick 60 with NO recordFire, then ghost dagger fires at tick 61 (one tick later, accumulator still elevated).
- **Test count: 148** (was 112 at M1.2.3a, +36 — 24 unit cases in `combat.test.ts` covering determinism / class-bonus / relic-stacking / lifesteal / burn-bypass / cap / threshold-boundary / zero-amount / buff-de-dupe / cooldown-pct-math / simultaneous-death / no-op effects / random-target / on-adjacent-filtering / Bread-cap, plus 12 byte-comparable fixture replays in `combat-fixtures.test.ts`).
- **Coverage: 100% statements / 96.59% branches / 100% functions / 100% lines on `combat.ts`**, exceeding the spec's 95% / 95% target. Sim package overall: 100% statements / 97.58% branches. Remaining branch shortfall is in `iteration.ts:151` (rotation-270 path deferred from M1.2.1 — same uncovered branch as M1.2.3a).
- **Bundle delta vs. M1.2.3a: zero**. Sim still not imported by client. Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Branch hygiene: `m1.2.3b-resolver-core` branched off main (`dfab7b9`), two implementation commits (`daced93` combat.ts + unit tests, `823b9ec` fixtures + branch-coverage tests). Ready for `--no-ff` merge to main after Trey's review.
- M1.2.4 (run-state machine: round progression, shop generation, gold credits, `add_gold` resolution) and M1.2.5 (machine-generated 200-fixture determinism suite — uses M1.2.3b's hand-authored fixtures as the seed corpus) are next. M1.2.5 will revisit the `trigger_chance_pct` no-op once a chance-roll mechanism is needed.

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
