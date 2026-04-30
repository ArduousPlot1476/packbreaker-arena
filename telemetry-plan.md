# Packbreaker Arena — Telemetry Plan (v0)

> Source of truth for events, properties, KPIs, and dashboards. Event TypeScript types live in `content-schemas.ts` § 15. This doc owns the *meaning* of those events: what we measure, why, and what decisions each measurement informs. Mechanics live in `gdd.md`. Tech wiring lives in `tech-architecture.md` § 12.
>
> Rule: telemetry exists to drive decisions. Every event in this doc maps to at least one KPI or guardrail. If an event is collected but nothing reads it, it gets cut.

---

## 1. Goals

Telemetry in M1 answers four questions, in priority order:

1. **Are players completing runs?** If they're not, why — onboarding, balance, or technical?
2. **Is the synergy depth real?** Pick-rate spread is the proxy. Item meta health is the long-term canary.
3. **What's the time-to-first-fun?** Time from first run start to first round won. The 4-minute target in `concept-brief.md` § Success metrics.
4. **Are deterministic combats actually deterministic?** Replay-vs-sim drift is a balance-emergency-class bug.

Everything below traces back to one of these four.

In M2 the question set expands to retention cohorts, ghost-match quality, daily-contract leaderboard health, and replay share rate. M2 telemetry plan is a v1 task — keep this doc focused on M1.

---

## 2. Architecture (cross-ref)

Per `tech-architecture.md` § 12:

- All events emit through `apps/client/src/telemetry/emit.ts`. No direct PostHog calls from feature code.
- Events are typed against `packages/shared/src/telemetry/events.ts` (mirrors `content-schemas.ts` § 15). Adding an event = adding a type. Lint enforced.
- Sim package never imports telemetry. Run controller observes sim outputs and emits events.
- Client batches and POSTs to `/v1/telemetry/batch`. Server forwards to PostHog.
- Anonymous ID (`telemetryAnonId`, uuid v4) generated on first run, stored in `LocalSaveV1`. No personally identifiable data collected in M1. No accounts in M1.

### Privacy posture (M1)

- No email, no IP retention beyond connection logs, no fingerprinting, no third-party analytics SDKs in the client.
- PostHog is the only sink. Self-host vs. cloud is open (see § 11).
- A "Reset analytics ID" affordance lives in Settings. Resetting issues a fresh uuid; old runs become unattributable.

---

## 3. Event taxonomy (M1)

Events are grouped by lifecycle. Property shapes are codified in `content-schemas.ts` § 15 — this section explains *why* each property exists.

### Run lifecycle

**`run_start`** — fires when the player commits to a run after class + relic select.
- `runId` — joins all events in the run together.
- `classId` — for class-balance KPIs.
- `contractId` — distinguishes neutral runs from daily contracts.
- `seed` — reproducibility. With seed + bag history we can replay any run.

**`run_end`** — fires when run resolves to one of `won` / `eliminated` / `abandoned`.
- `outcome` — the headline funnel metric.
- `roundReached` — where the run died.
- `heartsRemaining` — distinguishes "barely won" from "stomped."

### Round lifecycle

**`round_start`** — fires when shop is generated for a new round.
- `round` — 1–11.
- `hearts`, `gold`, `itemsInBag` — state snapshot. Powers the "what does a healthy round-7 player look like" cohort.

**`round_end`** — fires after combat resolves and rewards are credited.
- `outcome` — `win` or `loss`.
- `damageDealt`, `damageTaken` — combat shape. Used for class balance and item DPC validation.

### Shop

**`shop_purchase`** — every buy.
- `itemId`, `cost`, `round`. Drives item pick-rate.

**`shop_sell`** — every sell. Used to detect "buy-then-immediately-sell" patterns (a UX failure signal — the player didn't realize what they were buying).
- `itemId`, `recovered`, `round`.

**`shop_reroll`** — every reroll click.
- `cost`, `rerollIndex` (1, 2, 3...), `round`. Drives reroll-cost curve tuning.

### Bag interactions

**`item_placed`** — fires on drag-drop into a valid cell. Not on shop preview hover.
- `itemId`, `placementId`, `anchor`, `rotation`. The placement record powers heatmaps of where items end up in the bag.

**`item_rotated`** — fires when player rotates an item via R or rotate button.
- `placementId`, `newRotation`. Counts rotation usage. Low usage means the rotation affordance is undiscovered or unnecessary.

**`item_moved`** — fires when player relocates an already-placed item.
- `placementId`, `newAnchor`. High move counts per round indicate "fiddling," which is fine; very low counts may mean the bag-puzzle isn't engaging.

**`recipe_completed`** — fires when player clicks Combine on a recipe-ready cluster.
- `recipeId`, `round`. Drives recipe pick-rate. A recipe never completed across 50+ runs is a design failure.

### Relics

**`relic_granted`** — fires when `RunController.grantRelic` succeeds (M1.2.6 schema v0.5).
- `slot` (`'mid' | 'boss'`), `relicId`, `round`. Drives mid/boss relic pick-rate analysis. Answers "are mid/boss relic choices balanced?" in M1, seeds M2 ladder analytics. Phase-gated: mid only fires in round 6+ arranging, boss only after a round-11 player_win. Starter-relic equip is part of `run_start` and does NOT emit a separate `relic_granted`.

### Combat

**`combat_start`** — fires at first sim tick.
- `round`, `opponentGhostId` (null in M1 against bot ghosts).

**`combat_end`** — fires at last sim event.
- `outcome`, `endedAtTick`, `damageDealt`, `damageTaken`. Tick-cap draws (`endedAtTick === 600`) are an emergency signal — should be <1% of combats.

### Onboarding

**`tutorial_step_reached`** — fires on each scripted tutorial beat.
- `stepId` — see § 7 for the canonical step ID list. Drives drop-off-by-step funnel.

**`tutorial_completed`** — fires when player finishes round 3 of tutorial.

**`tutorial_abandoned`** — fires if player closes the tab or navigates away mid-tutorial.
- `stepId` — the step they were on when they bailed.

### Daily contract

**`daily_contract_started`** — fires when player commits to today's daily seed.
- `contractId`, `date`.

**`daily_contract_completed`** — fires at run end if and only if it was a daily run.
- `contractId`, `date`, `outcome`. Drives daily-engagement KPIs (M2-relevant; tracked from M1 for baselines).

---

## 4. KPIs (M1)

KPIs map directly to the four telemetry goals in § 1.

### Goal 1 — Run completion

- **Run completion rate** = `count(run_end where outcome in [won, eliminated]) / count(run_start)`.
  - Target: ≥ 55% by end of M1 graybox playtests. (`concept-brief.md` § Success metrics for M2.)
- **Abandon rate by round** = `count(run_end where outcome=abandoned, group by roundReached) / count(round_start at that round)`.
  - Cliffs flag where players quit. Round-1 abandons usually = onboarding. Round-7+ abandons usually = blowout.
- **Median run length (rounds reached)** = `median(roundReached) where outcome != abandoned`.
  - Target: 8–11 rounds. Median below 6 = lethality too high. Median pinned at 11 = boss too easy.

### Goal 2 — Synergy depth

- **Item pick rate** = `count(shop_purchase where itemId=X and round in valid_rarity_window(X)) / count(shop_purchase where round in valid_rarity_window(X))`.
  - Guardrail: no item < 2%, no item > 35%. (`balance-bible.md` § 16.)
  - "Valid window" excludes rounds where the item couldn't appear in the shop due to rarity gates.
- **Recipe completion rate** = `count(recipe_completed where recipeId=X) / count(run_end)`.
  - Guardrail: no recipe at 0% across 50+ runs. Recipes < 1% are design failures.
- **Build coherence proxy** = within a single run, `count(distinct itemIds purchased) / count(shop_purchase)`. Lower ratio = more focused builds (the player kept buying into one strategy). Higher ratio = scattergun.
  - No fixed target. Distribution shape matters more than mean — bimodal is healthy (some focused, some flexible), unimodal-flat is the warning sign.

### Goal 3 — Time to first fun

- **Time to first won round** = `tutorial_completed.tsClient - run_start.tsClient` for the player's first run, OR `round_end (first where outcome=win) - run_start` if they skipped tutorial.
  - Target: ≤ 4 minutes for ≥ 75% of new accounts.
- **Tutorial drop-off funnel** = `count(tutorial_step_reached) / count(tutorial_step_reached for previous step)`.
  - Step-to-step retention. Any step below 90% is a UX problem worth investigating.

### Goal 4 — Determinism integrity

- **Tick-cap draw rate** = `count(combat_end where endedAtTick == 600) / count(combat_end)`.
  - Target: < 0.5%. Anything higher means combats aren't resolving — usually a balance bug (insufficient damage), occasionally a sim bug.
- **Sim wall-time p95** = client-side timing wrapper around `simulateCombat` calls. Emitted as a custom event `sim_perf` (see § 9 — added if main-thread budget becomes a concern).
  - Target: ≤ 5ms p95. Above this triggers the worker-isolation revisit in `tech-architecture.md` § 5.3.

---

## 5. Pick-rate guardrails (telemetry-driven balance)

From `balance-bible.md` § 16, codified here as automated alerts:

| Signal | Threshold | Action |
|---|---|---|
| Item pick rate | < 2% in valid window over 100+ valid appearances | Buff candidate. Investigate before tuning. |
| Item pick rate | > 35% over 100+ valid appearances | Nerf candidate. Investigate before tuning. |
| Build win rate | > 60% across 100+ instances of that build | Balance emergency. Identify dominant item or relic combo. |
| Recipe completion rate | 0 across 50+ runs | Design failure. Inputs unbuyable, glow not legible, or recipe simply not worth it. |
| Class win rate gap | > 8 percentage points | Rebalance underperforming class passive or relic pool. |
| Tick-cap draw rate | > 1% | Combat lethality too low somewhere — usually a 2-armor-stacked stalemate. |

"100+ valid appearances" means the item was eligible to appear in shops 100+ times across all sessions. Computed as a derived metric in the dashboard.

---

## 6. Dashboards (M1)

Three dashboards. Built in PostHog. Each maps to a telemetry goal.

### D1 — Run Health Overview
- Run completion rate (line, daily)
- Abandon rate by round (bar, by round 1–11)
- Median rounds reached (single value + 7-day sparkline)
- Tick-cap draw rate (line, daily; alert if > 1%)
- Combat duration histogram (distribution of `endedAtTick`)

### D2 — Item & Build Meta
- Pick rate by item (sortable table; flagged red if < 2% or > 35%)
- Recipe completion rate by recipe (table; flagged red if < 1%)
- Win rate by class (Tinker vs Marauder, with confidence interval)
- Win rate by starter relic (table)
- Most-purchased pairs (top 20 itemId pairs co-purchased in the same run; surfaces emergent synergies)
- Boss win rate (`outcome=won` / `combat_end where round=11`)

### D3 — Onboarding Funnel
- Tutorial step retention (funnel chart)
- Time to first won round (histogram + p50/p75/p90 callouts)
- First-run abandon rate (count with `tutorial_abandoned` / total accounts created)
- New-account-to-second-run conversion (% who start a 2nd run within 24h)

---

## 7. Tutorial step IDs

Canonical list. The tutorial fires `tutorial_step_reached` with one of these `stepId` values, in order:

1. `tut_intro_screen` — title card shown, "Begin tutorial" tapped.
2. `tut_class_select` — class shown, picked.
3. `tut_starter_relic` — starter relic shown, picked.
4. `tut_round_1_arrange` — pre-built bag explained ("Drag this sword to a different cell"). Fires when player completes the suggested move.
5. `tut_round_1_continue` — Continue tapped, round 1 combat starts.
6. `tut_round_1_won` — combat resolves to player win. (Scripted ghost; should always win.)
7. `tut_round_2_shop` — shop appears with one obvious purchase highlighted. Fires when player buys it.
8. `tut_round_2_place` — player drops the bought item into the bag.
9. `tut_round_2_continue` — combat starts.
10. `tut_round_3_recipe` — recipe-ready glow appears. Fires when player clicks Combine.
11. `tut_round_3_continue` — combat starts.
12. `tut_complete` — tutorial run ends. Fires `tutorial_completed`.

Drop-off below any step → file an investigation ticket. Below 90% step-to-step is the bar.

---

## 8. Property conventions

- All event timestamps are `tsClient` (client-side ISO 8601). Server adds `tsServer` on ingest. Order events by `tsClient` for replay; use `tsServer` only for cross-session analytics.
- All numeric properties are integers (gold, cost, damage, ticks, round). No floats anywhere in event payloads.
- All ID properties use the branded types from `content-schemas.ts` (serialized as plain strings on the wire, type-checked on emit).
- All events carry `sessionId` (a uuid generated on app load, distinct from `telemetryAnonId`). One session = one tab/visit.
- Boolean properties are explicit `true`/`false`, never `0`/`1` or `null`.

---

## 9. Future events (M1 candidates, defer if scope tight)

These earned a mention in design discussions but didn't make the M1 cut. Add only if they answer a question we need answered:

- `bag_arrangement_snapshot` — full bag state every N seconds. Heavy; only useful if we want to study mid-round reorganization patterns. Defer to M2.
- `sim_perf` — per-combat timing. Adds if main-thread budget becomes a concern (see Goal 4 KPI). Cheap to add when needed.
- `replay_viewed` — fires when player taps "view opponent build" post-round. M2-relevant for replay share funnel.
- `setting_changed` — fires on any settings panel toggle. Useful only when settings exist; M1 has minimal settings.
- `error_boundary_caught` — React error-boundary captures. Worth adding day one if cheap; gives free crash visibility. **Recommend adding to M1.**

The `error_boundary_caught` recommendation is the only one I'd promote into M1 scope. Cheap, high signal.

---

## 10. Out of scope for M1

- A/B testing infrastructure. Defer to M2.
- Cohort retention analysis (D1 / D7 / D30). Requires accounts; M2 problem.
- Funnel analysis across sessions. Requires stable user identity beyond `telemetryAnonId`. M2.
- Replay share rate, ghost-match quality, daily leaderboard health. M2.
- Rage-quit detection (rapid abandon + return patterns). M2.
- Time-on-screen heatmaps. Out of scope entirely — too invasive for a small team to act on.
- Server-side events beyond ingest forwarding. M1 server is a thin pipe.

---

## 11. Open decisions

1. **PostHog: self-host vs. cloud.** Self-host is privacy-clean and free at our scale, but adds an ops surface. Cloud is fast to start and has predictable cost. Recommend cloud for M1, revisit at M2 when player counts make pricing real.
2. **Sample rate.** All M1 events are 100% sampled. Trivial volume. Revisit at M2 if event-count costs spike.
3. **Event retention.** PostHog default is 7 years. We don't need that. Recommend 12 months for M1, with monthly aggregate snapshots retained longer.
4. **Pixel/font perf events.** Whether to instrument client perf (LCP, FCP, INP) via PostHog session replay or a dedicated perf SDK. Defer to M2 unless mid-tier mobile testing reveals problems.

---

## 12. Cross-references

- Event TypeScript types: `content-schemas.ts` § 15.
- Architectural wiring rules: `tech-architecture.md` § 12.
- Pick-rate guardrails (balance side): `balance-bible.md` § 16.
- Telemetry surfaces required by GDD: `gdd.md` § 16.
- Demo-gate metrics that depend on these KPIs: `concept-brief.md` § Success metrics.
