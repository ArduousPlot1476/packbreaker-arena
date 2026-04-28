// @packbreaker/sim — pure-TS deterministic combat simulator.
//
// Surface (M1.2.1 + M1.2.2):
//   - rng:         canonical mulberry32 PRNG behind a Rng interface
//   - iteration:   canonicalPlacements / canonicalCells / stableSort,
//                  TICK_PHASES tuple + TickPhase type,
//                  resolveTarget (TargetSelector → EntityRef | ItemRef | null)
//   - math:        applyPct / applyBp / clamp / sumInts (integer-only, NaN on float)
//   - status:      createStatusState / applyStatus / tickStatusDamage /
//                  cleanupStatus / consumeStunIfPending (M1.2.2)
//   - invariants:  shared invariant() assertion
//
// Combat resolution (M1.2.3), run-state machine (M1.2.4), and the 200-fixture
// determinism suite (M1.2.5) are still ahead.

export type { Rng } from './rng';
export { createRng } from './rng';

export {
  canonicalPlacements,
  canonicalCells,
  stableSort,
  resolveTarget,
  TICK_PHASES,
} from './iteration';
export type { TickPhase } from './iteration';

export {
  applyPct,
  applyBp,
  clamp,
  sumInts,
} from './math';

export { invariant } from './invariants';

export type { StatusState } from './status';
export {
  createStatusState,
  applyStatus,
  tickStatusDamage,
  cleanupStatus,
  consumeStunIfPending,
} from './status';
