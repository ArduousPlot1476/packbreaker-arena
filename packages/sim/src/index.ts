// @packbreaker/sim — pure-TS deterministic combat simulator.
//
// Surface (M1.2.1 + M1.2.2 + M1.2.3a + M1.2.3b + M1.2.4):
//   - rng:         canonical mulberry32 PRNG behind a Rng interface
//   - iteration:   canonicalPlacements / canonicalCells / stableSort,
//                  TICK_PHASES tuple + TickPhase type,
//                  resolveTarget (TargetSelector → EntityRef | ItemRef | null)
//   - math:        applyPct / applyBp / clamp / sumInts (integer-only, NaN on float)
//   - status:      createStatusState / applyStatus / tickStatusDamage /
//                  cleanupStatus / consumeStunIfPending (M1.2.2)
//   - triggers:    createTriggerState / accumulateCooldown / shouldFire /
//                  recordFire / isFiringCapped (M1.2.3a)
//   - combat:      simulateCombat(input, options?) → CombatResult (M1.2.3b)
//   - run:         createRun(input) → RunController; replayCombat;
//                  composeRuleset; generateShop; detectRecipes (M1.2.4)
//   - invariants:  shared invariant() assertion
//
// The 200-fixture determinism suite (M1.2.5) is still ahead.

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

export type {
  TriggerKey,
  TriggerEntry,
  TriggerState,
  TriggerType,
} from './triggers';
export {
  createTriggerState,
  accumulateCooldown,
  shouldFire,
  recordFire,
  isFiringCapped,
} from './triggers';

export type { SimulateCombatOptions } from './combat';
export { simulateCombat } from './combat';

export type {
  CreateRunInput,
  RunController,
  RunPhase,
  RecipeMatch,
  ComposedRuleset,
  DerivedModifiers,
  RunControllerAction,
} from './run';
export {
  createRun,
  replayCombat,
  detectRecipes,
  composeRuleset,
  baseIncomeForRound,
  generateShop,
  computeRerollCost,
  effectiveItemCost,
  sellValueOf,
  applyAction,
} from './run';
