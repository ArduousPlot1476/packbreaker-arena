# Balance harness

Offline balance measurement. Turns tuning from a telemetry round-trip (ship →
play → wait for PostHog → analyse) into a loop measured in seconds.

```sh
pnpm balance -- --seeds 60                                  # all policies
pnpm balance -- --seeds 200 --policies greedy,hoarder
pnpm balance -- --seeds 60 --out reports/after.json
```

`--seeds` defaults to 100, and a run is `seeds × 2 classes × policies`, so the
bare default is 1400 runs. Roughly 2 seconds per 360 runs.

*(`pnpm` isn't on PATH on the dev box — use `corepack pnpm run sim -- …` from
this directory, or put a `pnpm.cmd` → `corepack pnpm` shim on PATH.)*

### Diffing two reports

`--baseline` does **not** run a sweep. It reads two reports that already exist
and prints the delta, so a before/after is three commands, not one:

```sh
pnpm balance -- --seeds 200 --out reports/before.json     # on the old code
#   ... make the change ...
pnpm balance -- --seeds 200 --out reports/after.json      # on the new code
pnpm balance -- --baseline reports/before.json --out reports/after.json
```

`formatDiff` refuses to compare reports built over different populations —
different `--seeds`, `--policies`, or sweep overrides. Keep them identical.

### Sweep knobs — measurement without a content edit

Economy: `--hearts --gold --gold-step --gold-step-amount --shop --reroll-start
--win-bonus`, folded onto `DEFAULT_RULESET` and injected via `CreateRunInput`'s
`rulesetOverride`. Boss: `--boss-hp --boss-damage --boss-lifesteal`, applied to
the `forge-tyrant-boss` `boss_only` mutator at the harness boundary (the shipped
`opponentForRound` reads `CONTRACTS` directly and takes no parameter).

Both are measurement-only and cost nothing. **Landing** a number is where the
prices differ, and they differ enormously — the boss mutator fields are free
(all 224 `.jsonl` fixtures run `contractId: "neutral"`, so the corpus never
exercises them), while any ruleset or class change re-baselines the corpus.

Unknown flags are a hard error. `--policy` (singular) used to be silently
ignored and quietly ran all six policies, which is how a number that looks like
the player model turns out not to be one.

## It drives the real-play path, not the corpus path

This is the single most important thing about it. `packages/sim/test/determinism/`
already contains a headless run driver, and it is the **wrong** one for balance —
the corpus path and real play are two different games:

| | corpus | real play |
|---|---|---|
| ghost items | `[2,2,3,3,4,4,5,5,6,6]` | `[1,1,2,4,6,8,10,12,13,14,5]` |
| ghost HP | bag-derived | `20 + (round−1)*2` |
| ghost / shop pool | all 45 `ITEMS` | 44 `SHOP_OFFER_ITEMS` |
| round-11 boss | neutral, no mutators, ~67 HP | Forge Tyrant, 45 HP, +1 dmg, +15% |
| combat seed | fresh per round | the run seed, every round |
| mid relic | never granted | always offered at round 6 |

The right-hand column is **derived** — every value comes from a module the
harness imports, so the behaviour moves when the game moves. This table does
not. Three of these six rows were stale when audited on 2026-08-05. Re-read it
against `ghost.ts` and `contracts.ts` whenever either changes.

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
affordable-and-placeable offer and no recipe decision. The player spent time and
made no decision. No telemetry, no calibration, no wall clock required.

**`bag-blocked rounds`** is its discriminator: the player could afford something
and *nothing fit*. When `blocked%` tracks `empty%` — as it does in rounds 9–11 —
the late game is short of space, not short of money, and no economy lever will
touch it.

> **The sample point is the whole point, and it was wrong until 2026-08-05.**
> Both inputs to `empty rounds` were measured at Continue, i.e. *after* the
> player had spent. That inverted the metric: buying three items scored the round
> EMPTY (you were down to 1 gold by then), and *combining* a recipe erased the
> evidence that one had been available. Measured on `f381637`, rounds 1–5 read
> 100% empty while the bot bought 1.0–2.5 items a round, and round 11 read 4%
> empty holding 39 gold with a full bag. Repaired, the same population reads 0.0%
> empty in rounds 1–6 and 50/77/91% in rounds 9/10/11. `countLiveOffers` also
> never checked placeability at all despite its docstring claiming it did, and
> used the raw `item.cost` rather than `effectiveItemCost`. Three defects, all in
> the direction of hiding the late game.

**`[POLICY-RELATIVE]`** — facts about the *bot*. `greedy` buys the first
affordable slot; `hoarder` buys max rarity. `balance-bible.md` §16's 2% / 35%
pick-rate thresholds are defined against **player telemetry** and must never be
read against this section. What the bot is authoritative on is **reachability**
(an item never offered, or never affordable when offered) and the **delta** under
a fixed policy across two revisions.

## Which policy is the player model

Five of the seven come from the fixture corpus and their own header says they
"are heuristic and aim for path coverage, not realism". They buy by slot index or
by rarity — never by what an item *does*. Measured, they buy 0.6 items in round 1
and will walk past a weapon.

Two are the harness's own, and they form a ladder:

- **`resolver-first`** — buys a damage source when one is affordable and it
  doesn't own one, then plays greedily. The floor of someone who understands that
  you need a weapon.
- **`sell-to-fit`** — a superset that adds the two moves greedy structurally
  cannot make:
  - **rotating.** Every corpus buy gate is rotation-0-only
    (`findFirstValidPlacement(bag, id, [0])`), while their *placement* calls take
    the all-four default — so they rotate what they own and refuse to buy
    anything that needs rotating. 12 of 45 items are non-square, so the
    instrument counted rotated fits as live offers that no policy would ever
    take.
  - **selling.** Greedy only sells to place an item it has *already bought*, so
    a full bag is an absorbing state — no buy, therefore no sell, therefore no
    buy.

Measured over 1600 runs on an identical population, `sell-to-fit` against
`resolver-first`: round-11 win **18.5% → 31.9%**, round-11 purchases 0.15 →
2.20, gold left on the table 39.4 → 22.4, runs won 112 → 200.

**That gap is why the sample point mattered.** Before the instrument was
repaired the same comparison read 8.4%, and tuning the boss against *that* would
have over-corrected by roughly a factor of two.

One measured caution, because it cuts against the obvious reading: taking
*every* placeable offer is **not** optimal. Buying the rotated-fit item lowered
round-11 win 33.6% → 31.9% and runs won 219 → 200, because cells are the binding
late-game constraint and every correction pays the 50% sell recovery. The clause
stays because the instrument must not credit an offer no policy can take — but
"competent" here means capable, not optimal, and these are a floor rather than a
ceiling.

**Report both — or all three.** They diverge sharply: after the 2026-08-05
early-game work the median run reached 4/11 under the full corpus set and 10/11
under `resolver-first`, because most of the corpus bots decline to buy anything.
Citing only one is how a balance claim becomes wrong.

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
