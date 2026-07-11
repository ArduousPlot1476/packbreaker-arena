# Run Fixtures — DO NOT REGENERATE

This directory holds the M1.2.5 + M1.2.6 determinism corpus.

- **`000–199-*.jsonl`** — 200 M1.2.5 strategy-generated action-stream fixtures (5 strategies × { greedy 40, hoarder 100, recipe-chaser 40, reroll-burner 10, random-legal 10 }, base seeds 1000–1199).
- **`200–223-*.jsonl`** — 24 M1.2.6 appended `relic-collector` fixtures exercising mid/boss relic slot population (16 mid + 8 boss, base seeds 2000–2023).
- **`*.json`** — 6 hand-authored M1.2.4 run fixtures, replayed by `packages/sim/test/run-fixtures.test.ts`. Independent corpus from the .jsonl set.

Each `.jsonl` file is one full run from `create_run` through `'ended'`, replayed byte-for-byte by `packages/sim/test/determinism/harness.test.ts` on every `pnpm test`.

## DO NOT REGENERATE

All 224 `.jsonl` files are **locked**. Diffs against this corpus are *not* a regeneration trigger — they are the determinism-contract alarm.

If a `.jsonl` fixture starts failing the harness:

1. **Investigate** the diff — the harness's `formatDivergence` output names the fixture, the round, and the first divergent tick.
2. **Find the sim change** that caused the divergence. Determinism is the contract; any drift here means the sim's byte-stable replay invariant broke.
3. Either revert the sim change or, if the change is intentional, file a decision-log entry justifying a sim-contract bump and regenerate as a deliberate, ratified action.

Regeneration is `pnpm --filter @packbreaker/sim generate-fixtures`. The script:
- Clears all existing `.jsonl` files in this directory.
- Re-runs the M1.2.5 200-fixture generator (5 strategies × 200 base seeds 1000–1199) AND the M1.2.6 24-fixture appendix (`relic-collector`, seeds 2000–2023).
- Verifies the M1.2.5 + M1.2.6 coverage targets and exits non-zero on a gap.

Regenerating without a decision-log ratification is a sim-contract violation.

## Documented coverage exceptions (M1.2.5)

`r-berserkers-greataxe` and `r-master-alchemists-kit` (the two 3-rare → 2×2-epic Capstone recipes) fire **0 times** across the 200 fixtures. Per the M1.2.5 ratification's "1 or 2 of 3 fire ≥1×" branch, these are accepted as content-coverage gaps, not sim-contract gaps. See `decision-log.md` for the full rationale.

## Documented coverage exceptions (M1.2.6)

Three (class × boss-relic) pairs out of four are accepted as documented coverage exceptions per the M1.2.6 ratified residual-gap entry in `decision-log.md`:

```
BOSS_RELIC_PAIR_EXCEPTIONS = [
  'tinker|worldforge-seed',
  'marauder|conquerors-crown',
  'tinker|conquerors-crown',
];
```

The fourth pair (`marauder|worldforge-seed`) fires once organically and stays in the coverage check. Threshold asymmetry is intentional: mid pairs require ≥2× firings each (boss pairs require ≥1× organic OR membership in `BOSS_RELIC_PAIR_EXCEPTIONS`) — boss-grant fires only after a structurally-hard round-11 player_win. The exception list is a "permitted to be zero" set, not a "must be zero" set; a future regen producing firings for listed pairs still satisfies coverage.

Revisit triggers (encoded in the `BOSS_RELIC_PAIR_EXCEPTIONS` comment block in `test/determinism/generate.ts`):

- **(a)** M1.5 client integration replaces scripted strategies with player input AND organic boss-win rate exceeds 30%.
- **(b)** Any code change to `combat.ts`, `RunController.startCombat`, `startCombatFromGhostBuild`, or the `boss_only` mutator path. (When this fires, regenerate the M1.2.6 appended fixtures and verify the exception list hasn't grown.)

## Schema version

Fixture header `schemaVersion: 4` matches `content-schemas.ts` v0.4 (Combatant.recipeBornPlacementIds, M1.2.4). The M1.2.5/M1.2.6 fixtures are v4-compatible by content — `relic_granted` (schema v0.5, M1.2.6) is a telemetry event, not a stored field, so v0.5 features don't surface in the .jsonl content. A fixture whose `schemaVersion` no longer matches the content schema is a regen trigger after a deliberate schema bump.

## Additive telemetry-field re-baseline (precedent: M1.5c PR 1 / CF 41)

The 6 `.json` scenario fixtures (M1.2.4 corpus, replayed by `run-fixtures.test.ts`) snapshot `expectedTelemetryEvents` deep-equal. When the `TelemetryEvent` schema gains an additive field on an existing variant (CF 41 added `startingRelicId` to `run_start`), each fixture's snapshot of that event must be updated to match the new payload — a **surgical, single-field re-baseline**, NOT a regeneration.

The fixture lock (above) protects the deterministic run trajectory (`input → output` bijection). Adding a telemetry field is an output-schema expansion, not a trajectory drift; every action, state transition, event type, and other field stays byte-identical. The re-baseline workflow:

1. Identify each fixture's `run_start` (or whichever variant gained the field) inside `expectedTelemetryEvents`.
2. Append the new field with the value matching `fixture.input.<field>` (or whatever sim threads).
3. Diff each fixture: change must be the single added line (plus a trailing comma on the prior line).
4. Re-run `pnpm test` and verify only the deep-equal expanded — no other assertions changed.

This is distinct from a regeneration: regeneration re-runs the strategy generators against the current sim and discards the locked corpus; re-baseline keeps every byte of the corpus except the additive-schema delta. Decision-log entry for the precedent: 2026-05-22 § M1.5c PR 1.

The `.jsonl` corpus has no telemetry payloads (terminal-state diff only), so additive telemetry fields never affect it.

## Trajectory terminal re-baseline — surgical, not regeneration (CF 58, 2026-07-10)

CF 58 (`trigger_chance_pct` echo proc) is a ratified sim-contract change: an active chance buff now gives a trigger's effects a summed-pct chance (capped 100) to resolve a second time, rolled from a dedicated per-combat `chanceRng` stream. Replaying the locked action streams through the CF 58 sim changes the terminal state of exactly **8** fixtures (an echo actually fires in-bag): `003/004/014/015/021/039-greedy`, `207/208-relic-collector`. All 8 are members of the grep-verified set of fixtures referencing Rune Pedestal / Master Alchemist's Kit; no fixture without those items diverges (RNG isolation — the echo draws only from `chanceRng`, never the main cursor).

These 8 were updated by a **surgical terminal-only re-baseline**, NOT by `generate-fixtures`. For each file, the existing action stream was replayed through the current sim and ONLY the terminal line (`{outcome, roundsReached, finalHearts, perRoundCombatEvents}`) was rewritten; the header and every action line stayed byte-identical (per-file diff = exactly 1 line). This extends the surgical re-baseline precedent above (additive telemetry-field) to a trajectory/terminal delta, keeping every other byte of the locked corpus frozen.

**Why not full `generate-fixtures`?** A full re-bake was ratified against. This locked corpus is a frozen snapshot that has drifted ~41 files from what the current generator emits — a pre-existing, CF-58-independent divergence (a pre-CF58 `combat.ts` control reproduces the same ~41-file drift; the generator is deterministic and Node-version-invariant — Node 18 and Node 22 emit identical output). The replay-determinism contract (above) still holds: 224/224 harness-green. That regeneration-reproducibility drift is tracked separately as **CF 61** (backlog, non-blocking; its own future ratified full regeneration). Running `generate-fixtures` here would have swept those ~41 unrelated files into this change. See `decision-log.md` — CF 58 closing entry for the ratified deviation and CF 61 for the drift.
