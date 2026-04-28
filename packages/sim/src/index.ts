// @packbreaker/sim — pure-TS deterministic combat simulator.
//
// M1.2.1 surface: foundation only.
//   - rng:        canonical mulberry32 PRNG behind a Rng interface
//   - iteration:  canonicalPlacements / canonicalCells / stableSort
//                 (deterministic ordering per tech-architecture.md § 4.1 rule 6)
//   - math:       applyPct / applyBp / clamp / sumInts (integer-only, NaN on float)
//   - invariants: shared invariant() assertion (M1.2.2+ will populate)
//
// Status effects, combat resolution, run-state machine, and the determinism
// fixture suite land in M1.2.2 through M1.2.5.

export type { Rng } from './rng';
export { createRng } from './rng';

export {
  canonicalPlacements,
  canonicalCells,
  stableSort,
} from './iteration';

export {
  applyPct,
  applyBp,
  clamp,
  sumInts,
} from './math';

export { invariant } from './invariants';
