# Run Fixtures — DO NOT REGENERATE

This directory holds the M1.2.5 determinism corpus.

- **`*.jsonl`** — 200 strategy-generated action-stream fixtures. Each file is one full run from `create_run` through `'ended'`, replayed byte-for-byte by `packages/sim/test/determinism/harness.test.ts` on every `pnpm test`.
- **`*.json`** — 6 hand-authored M1.2.4 run fixtures, replayed by `packages/sim/test/run-fixtures.test.ts`. Independent corpus from the .jsonl set.

## DO NOT REGENERATE

The `.jsonl` files are **locked**. Diffs against this corpus are *not* a regeneration trigger — they are the determinism-contract alarm.

If a `.jsonl` fixture starts failing the harness:

1. **Investigate** the diff — the harness's `formatDivergence` output names the fixture, the round, and the first divergent tick.
2. **Find the sim change** that caused the divergence. Determinism is the contract; any drift here means the sim's byte-stable replay invariant broke.
3. Either revert the sim change or, if the change is intentional, file a decision-log entry justifying a sim-contract bump and regenerate as a deliberate, ratified action.

Regeneration is `pnpm --filter @packbreaker/sim generate-fixtures`. The script:
- Clears all existing `.jsonl` files in this directory.
- Re-runs the 5 strategies × 200 base seeds (1000–1199) generator.
- Verifies the M1.2.5 coverage targets and exits non-zero on a gap.

Regenerating without a decision-log ratification is a sim-contract violation.

## Documented coverage exceptions (M1.2.5)

`r-berserkers-greataxe` and `r-master-alchemists-kit` (the two 3-rare → 2×2-epic Capstone recipes) fire **0 times** across the 200 fixtures. Per the M1.2.5 ratification's "1 or 2 of 3 fire ≥1×" branch, these are accepted as content-coverage gaps, not sim-contract gaps. See `decision-log.md` for the full rationale.

## Schema version

Fixture header `schemaVersion: 4` matches `content-schemas.ts` v0.4 (post-M1.2.4 Combatant.recipeBornPlacementIds bump). A fixture whose schemaVersion no longer matches the content schema is a regen trigger after a deliberate schema bump.
