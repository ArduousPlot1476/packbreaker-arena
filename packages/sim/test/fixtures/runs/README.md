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
