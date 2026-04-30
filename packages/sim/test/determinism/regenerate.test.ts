// determinism/regenerate.test.ts — manual fixture regeneration entry.
//
// Gated by `npm_lifecycle_event === 'generate-fixtures'` (set by pnpm when the
// `generate-fixtures` script is invoked). Default `pnpm test` does NOT
// regenerate — the 200 fixtures are LOCKED (DO NOT REGENERATE per the README
// in fixtures/runs/). Invoked via:
//   pnpm --filter @packbreaker/sim generate-fixtures

import { describe, expect, it } from 'vitest';
import { writeAllFixtures, formatCoverage } from './generate';

const ENABLED = process.env.npm_lifecycle_event === 'generate-fixtures';

describe.runIf(ENABLED)('M1.2.5 fixture regeneration', () => {
  it('writes 200 .jsonl fixtures meeting all coverage targets', () => {
    const { written, coverage } = writeAllFixtures();
    // eslint-disable-next-line no-console
    console.log(formatCoverage(coverage));
    expect(written).toBe(200);
    expect(coverage.bossRound.ok, 'boss round (>=10x)').toBe(true);
    expect(coverage.tickCap.ok, 'tick-cap draw (>=1x organic)').toBe(true);
    expect(coverage.recipes.ok, 'all 12 recipes (>=1x each)').toBe(true);
    expect(coverage.pairs.ok, 'all (class, starter relic) pairs (>=5x each)').toBe(true);
    expect(coverage.rotation270.ok, 'rotation 270 on non-square (>=1x)').toBe(true);
  });
});
