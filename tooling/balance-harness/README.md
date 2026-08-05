# Balance harness

Offline balance measurement. Turns tuning from a telemetry round-trip (ship →
play → wait for PostHog → analyse) into a loop measured in seconds.

```sh
pnpm balance -- --seeds 60                                  # all policies
pnpm balance -- --seeds 200 --policies greedy,hoarder
pnpm balance -- --seeds 60 --out reports/after.json
pnpm balance -- --seeds 60 --baseline reports/before.json --out reports/after.json
```

360 runs / ~1900 combats takes about 2 seconds.

*(`pnpm` isn't on PATH on the dev box — use `corepack pnpm run sim -- …` from
this directory, or put a `pnpm.cmd` → `corepack pnpm` shim on PATH.)*

## It drives the real-play path, not the corpus path

This is the single most important thing about it. `packages/sim/test/determinism/`
already contains a headless run driver, and it is the **wrong** one for balance —
the corpus path and real play are two different games:

| | corpus | real play |
|---|---|---|
| ghost items | `[2,2,3,3,4,4,5,5,6,6]` | `[1,1,2,3,4,5,5,6,7,8,5]` |
| ghost HP | bag-derived | `30 + floor((round−1)/2)*2` |
| ghost / shop pool | all 45 `ITEMS` | 44 `SHOP_OFFER_ITEMS` |
| round-11 boss | neutral, no mutators, ~67 HP | Forge Tyrant, 50 HP, +2 dmg, +15% |
| combat seed | fresh per round | the run seed, every round |
| mid relic | never granted | always offered at round 6 |

A harness on the corpus path would measure a game nobody plays. So the driver in
`src/realplay.ts` mirrors `useRun.ts`'s ordering and **imports** the client's own
derivations — `opponentForRound`, `generateShop`, `runCombat`, the item pools. It
does not copy them: a copy is a co-drift pair, the exact failure `trophyDeltaFor`
was created to unwind. Tune `ITEM_COUNT_BY_ROUND` and this harness moves with it.

## What it does not touch

`strategies.ts`, `generate.ts` and `ghost-generator.ts` in
`packages/sim/test/determinism/` are **import-only**. They are the *inputs* to
fixture generation: editing one leaves all 224 committed fixtures passing while
changing what the next regeneration produces — a divergence that surfaces months
later as unexplained corpus churn. `src/policies.ts` wraps `STRATEGIES` in an
adapter instead.

The harness adds **zero** diff to `packages/sim`, `packages/content` and
`apps/client`.

## Reading the report

**`[EXACT]`** — facts about the game. Win/draw rates, `endReason` mix, combat
ticks, playback seconds, empty rounds. These depend on content and sim, not on
how the bot plays. Cite them.

Playback seconds are not modelled — `playbackMs` replays the client's own
`advanceCombatTickClock` over the event stream, including dead-time
fast-forward. It is the same function the Phaser scene runs.

**`empty rounds`** is the pacing instrument: rounds presenting at most one
affordable-and-placeable offer and no ready recipe. The player spent time and
made no decision. No telemetry, no calibration, no wall clock required.

**`[POLICY-RELATIVE]`** — facts about the *bot*. `greedy` buys the first
affordable slot; `hoarder` buys max rarity. `balance-bible.md` §16's 2% / 35%
pick-rate thresholds are defined against **player telemetry** and must never be
read against this section. What the bot is authoritative on is **reachability**
(an item never offered, or never affordable when offered) and the **delta** under
a fixed policy across two revisions.

## Which policy is the player model

Five of the six come from the fixture corpus and their own header says they "are
heuristic and aim for path coverage, not realism". They buy by slot index or by
rarity — never by what an item *does*. Measured, they buy 0.6 items in round 1
and will walk past a weapon.

`resolver-first` is the harness's own, and it is the closest thing to a player:
it buys a damage source when one is affordable and it doesn't own one, then plays
greedily. Use it for "what does a person experience"; use the other five for
coverage and for deltas.

**Report both.** They diverge sharply — after the 2026-08-05 early-game work the
median run reached 4/11 under the full policy set and 10/11 under
`resolver-first`, because most of the corpus bots decline to buy anything. Citing
only one is how a balance claim becomes wrong.

## Validation

The harness was gated by ablation before any number from it was trusted:
reverting `ITEM_COUNT_BY_ROUND` to its pre-2026-08-04 values reproduces the known
too-easy band in rounds 4–10 (82–92% bot win, flat and hard to lose), and
restoring the shipped values pulls those rounds down 10–18 points while leaving
rounds 1–3 and round 11 **exactly** unchanged — which is precisely the span the
change touched. Moving the right rounds by a plausible magnitude, and moving
nothing else, is the evidence that it models real play.

## Limits, stated

- Bot ≠ player. Trust shapes and deltas; treat absolute rates as a floor.
- Wall-clock run length is **not** reported. Combat playback is exact, but
  player-paced arrange time cannot be known headlessly. It needs a telemetry fit,
  and that fit is currently blocked: `combat_start` is emitted only on a sim path
  real play never traverses (CF 62), so arrange time cannot be separated from
  playback time in the existing data.
- `endReason: 'timeout'` is structurally unreachable — the CF-83 ramp guarantees
  termination before the tick cap. Expect `ko` / `ramp_ko` only.
