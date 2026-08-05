# Roadmap

## Current state — M2, mid-milestone (2026-08-04)

M0 (docs) and M1 (graybox prototype) are **closed**. M1's exit gate closed 2026-07-13: 10+
crash-free solo runs, item pick-rate spread visible, runs bounded.

M2 — **Public web demo** — is in progress. Account persistence largely shipped (Clerk auth,
`player_saves`, per-round trophy sync, daily-contract endpoint) and the mobile 390-wide
layout is built. The rest of M2's scope is untouched: refined art, a cosmetic trophy
economy, async ghost storage and matchmaking, and a portal build.

**The game has never been deployed.** Fixing that is the first thing on the list below.

### Honest gaps between what's built and what M2 needs

| | State |
|---|---|
| Deployment | None. The game has never been hosted anywhere. |
| Title / settings screen | Do not exist. The app boots straight into class select. |
| Audio | None at all — no library, no files, no mute. |
| Desktop layout | Fixed 1280×720, centred. A 1440p monitor shows a letterboxed island. |
| Difficulty curve | Rounds 4–10 fixed (2026-08-04) and the round-11 wall retuned to §15's ~30% (2026-08-05). Remaining: rounds 1–2 are unlosable — 0 losses in 3,200 combats — kept deliberately as an onboarding ramp and owned by Stage 5. |
| Late-game decisions | **The real remaining gap.** Rounds 10–11 are 65%/79% *bag-blocked* — the player can afford something and nothing fits. 24 fixed cells, two gold sinks (buy, reroll), no expansion, and a 50%-lossy sell as the only churn. Recipes are the designed cell sink and fire 0.6×/run against 12 authored. |
| Run length | Median 4.92 min against a 12–20 min design target. Combat playback is 43 s/run exact; the rest is arrange time and remains uncalibrated (CF 62 blocks the telemetry fit). |
| Draw rate | 3.4–3.7% against a <1% guardrail. **0% inert** — every draw is the ramp erasing a real lead. Deferred with the arithmetic in `CHANGELOG.md`; the fix is a sim change costing 200 fixtures. |
| Class balance | Gap 11.1 pts against a ≤8 guardrail, and it is an **economy** gap — Marauder's `bonusGoldOnWin` is a 3× multiplier on win income. Widens to 13.3 under competent play. Batched with the late-game economy re-baseline. |
| Meta progression | None. Trophies never accumulate for anonymous players and no cumulative total is rendered anywhere. |
| Onboarding | The `gdd.md` §15 tutorial is specced, flagged in persistence, and has no surfaces. |
| Ghosts | Procedurally generated client-side. No server storage, no submission, no queue. |

---

## How we work now

Stages, not phase-gates. Each stage ends in a merged, playable build that is visibly
better than the one before it. Nothing is internal-only.

**Kept, because it is real safety:** the Vitest suites (783 client / 557 sim), the CI gate
(lint → typecheck → test → build), the 224-fixture `.jsonl` determinism corpus, and the
`check-schemas-sync` byte-identity gate between `content-schemas.ts` and
`packages/content/src/schemas.ts`.

**Kept, scoped:** automated code review on PRs touching `packages/sim` or `apps/server`,
where a silent bug is expensive. UI, content, art, and copy ship without it.

**Retired:** per-merge decision-log essays, the catch/rule/pattern/drift counter, the
Phase 1 / 2 / 2.5 / 3a / 3b halt-gate sequence, and CF numbering as a work-tracking
system. `decision-log.md` stays as history and stops growing; `CHANGELOG.md` carries one
line per merge.

The open-CF backlog (55, carried by arithmetic and unverified by enumeration since
2026-05-23) is not re-enumerated. Items that block M2 are named in the stages below.

---

## The stages to the M2 demo

| | Stage | Outcome a player would notice |
|---|---|---|
| 1 | Make it a real product you can open | Title screen, fills any monitor, one consistent look, **live at a URL** |
| 2 | Make the run worth playing | No unlosable rounds, draws under guardrail, runs longer than 5 min |
| 3 | Make it feel good | Sound, and every action responds |
| 4 | Make you come back | Trophies that accumulate, a rank ladder, then the daily run |
| 5 | Make it teachable | A stranger wins a round without being told anything |
| 6 | Make it deep | More items, recipes, relics, a second boss, refined relic art |
| 7 | Make it social | Real player ghosts, stored and matched |
| 8 | Ship it | itch.io build, perf budget met, metrics gate open |

Stage 2 leads with an **offline balance harness** — most of it already exists as fixture
scaffolding (`packages/sim/test/determinism/strategies.ts` has six player policies;
`generate.ts` already drives full runs and tallies coverage). Repointing it at balance
statistics turns tuning from a weeks-long telemetry round-trip into a minutes-long loop.
It must drive the **real-play** path, not the corpus path — those are two different games
(different ghost curves, different boss, different shop RNG, different combat seeding).

### Next lever, named from measurement (2026-08-05)

The late game is the remaining Stage 2 gap, and the candidates are not equally priced:

1. **Recipes as the cell sink — do this first.** A combine is the only mechanism in the game
   that frees cells *and* raises power (2–3 placements → 1). It fires 0.6×/run against 12
   authored recipes, so the sink never opens; it is also the only lever that revives Tinker,
   whose `recipeBonusPct` is conditional on a combine having happened and floors to **+0** on
   any base under 10, and whose `firstRecipeFreeAction` has zero consumers repo-wide. A
   shop-side recipe-input guarantee mirroring `guaranteeResolver` is **client-only, zero
   fixture cost** — the same seam that shipped the early-game fix.
2. **The gold curve — measured non-responsive.** At `--win-bonus 6` the player reaches round
   11 holding 87 gold and buying 0.00 items. More money does not buy space. 224 + 6 fixtures.
3. **`bagDimensions` — the direct fix and the most expensive.** A ruleset field, but
   `apps/client/src/bag/layout.ts` derives `BAG_COLS`/`BAG_ROWS` from `DEFAULT_RULESET` at
   module scope, and `combat-ramp.test.ts:194`'s termination invariant explicitly breaks past
   32 cells (`30 + 15 + 32*8 = 301 > 300`), so growing the bag re-derives the ramp window.

---

## Milestones

### M0 — Foundation — **CLOSED**
Goal: approved docs, zero code. Exit: all nine canonical files locked, visual direction
picked, sim contract decided.

### M1 — Graybox prototype — **CLOSED 2026-07-13**
Goal: one playable run end-to-end, deterministic, internal-only.
Shipped: drag/drop bag, shop/sell/reroll, deterministic combat package, 2 classes, 45
items, 12 recipes, 12 relics, 3 status effects, 1 boss, replay log, telemetry hooks,
placeholder art.
Exit met: 10+ crash-free solo runs (self-cert path ratified 2026-07-12), pick-rate spread
visible, runs bounded. True 12–20 min pacing validation was deferred to M2 and is Stage 2
above.

### M2 — Public web demo — **IN PROGRESS**
Goal: public browser build, portal-ready.
In scope: refined art in the approved direction · ranked trophies (cosmetic-only economy) ·
ghost battle queue (async) · account persistence (auth, save, ghost build storage) · mobile
vertical layout (390-wide) · portal build (itch.io first, then CrazyGames).
Exit: `concept-brief.md` § Success metrics hit over 200+ sessions.

### M3 — Feature-complete alpha
Goal: live-ops-ready product.
In scope: seasonal relics · alt bag shapes · limited-time mutators · friend ghosts / clan
rosters · cosmetic store · live-ops calendar.
Exit: 4 weeks of live content cadence shipped without regressions. D30 ≥ 6%.

---

## Kill lists

**M2 — do NOT build:** seasonal content beyond the launch set · mutators or alt rules
beyond one daily contract type · clans, friends, chat · native ports · editor / UGC tools.

**M3 — do NOT build:** real-time PvP · 3D · native wrappers (still web-first) · heavy
narrative content · new genres bolted on.

---

## Open risks

| Risk | Severity | Where it's tracked |
|---|---|---|
| Time-to-first-fun > 4 min sinks D1 | High | Stage 5 (tutorial). Currently unmeasurable — the onboarding funnel has no emit sites. |
| Item meta collapses to one dominant build | Medium | Stage 2 harness makes the §16 pick-rate guardrails offline-checkable. |
| Async match quality with a small early player base | Medium | Stage 7. Bot fallback stays as the empty-bucket path. |
| Browser perf on mid-tier mobile | Medium | Stage 8, against `tech-architecture.md` §10. |
| Telemetry provenance corrupts the 200-session gate | High | CF 96. Probe runs emit into the live dataset and `clientVersion` doesn't uniquely identify a build. Must be fixed before the gate opens. |

---

## Replanning triggers

Replan the active milestone if any of:
- Two consecutive playtest cohorts miss the milestone's success metric.
- A pillar is violated to ship a feature.
- Effort on a single deliverable slips > 50%.
