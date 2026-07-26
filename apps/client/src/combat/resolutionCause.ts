// CF-93 LEG 1 (B4 + B5) — DERIVED resolution cause and ramp-drain totals.
//
// Pure module, the attribution.ts / anchorResolution.ts precedent: all
// derivation lives here (testable without Phaser or React); CombatOverlay
// consumes the output and passes it to RoundResolution as props.
//
// ⚠ THIS DELIBERATELY DOES NOT READ `endReason`, AND THE TWO WILL DISAGREE.
// `endReason` is a pure function of tick (packages/sim/src/combat.ts — a death
// at or after RAMP_START_TICK is stamped 'ramp_ko' regardless of what actually
// landed the blow), so an item kill that lands exactly ON the ramp's first tick
// reads 'ramp_ko' while no ramp_tick ever fired. That mislabelling is CF-88's
// open scope. This module routes AROUND it client-side by reading the event
// stream, which carries the discriminating datum; it does not fix, amend, or
// reconcile CF-88, and endReason continues shipping to telemetry unmodified.
// A future reader comparing this surface against a telemetry endReason SHOULD
// expect them to diverge on that population — that divergence is the finding,
// not a defect in either one.

import type { CombatEvent, CombatResult, EntityRef } from '@packbreaker/content';

/** What actually decided the combat, derived from the event stream.
 *  'items' — the losing side never took ramp damage; items/statuses did it.
 *  'ramp'  — the CF-83 resolution ramp drained the losing side. */
export type ResolutionCause = 'items' | 'ramp';

/** The side(s) that reached 0 HP, per the sim's own outcome. A draw means
 *  BOTH fell — CF-84's honest mutual-KO semantics, not a loss in disguise. */
function losingSides(outcome: CombatResult['outcome']): ReadonlyArray<EntityRef> {
  if (outcome === 'player_win') return ['ghost'];
  if (outcome === 'ghost_win') return ['player'];
  return ['player', 'ghost'];
}

/** Derived cause for a resolved combat.
 *
 *  ⚠ PRECISION LIMIT, stated rather than implied: this is ramp-tick PRESENCE
 *  against the losing side, NOT last-blow attribution. A side that took one
 *  ramp tick and was then finished by an item reads 'ramp'. That is the
 *  intended reading — once the drain is running it is materially deciding the
 *  exchange on both sides — but it is a weaker claim than "the ramp landed the
 *  killing blow", and nothing here should be cited as the stronger one. */
export function deriveResolutionCause(
  events: ReadonlyArray<CombatEvent>,
  outcome: CombatResult['outcome'],
): ResolutionCause {
  const losers = losingSides(outcome);
  const rampHitALoser = events.some(
    (e) => e.type === 'ramp_tick' && losers.includes(e.target),
  );
  return rampHitALoser ? 'ramp' : 'items';
}

/** Total ramp drain per side, summed from the event stream.
 *
 *  ⚠ computeDamageStats (packages/sim) is NOT modified and NOT called here.
 *  It counts `damage` + `status_tick` only, excluding the source-less ramp BY
 *  DESIGN so display and round_end telemetry share one definition. That
 *  exclusion is why a ramp-resolved draw honestly reports DEALT 0 / TAKEN 0 —
 *  correct, and unchanged by this function. This is a SEPARATE, THIRD quantity
 *  that explains those two zeros instead of altering them. */
export function computeRampDrain(
  events: ReadonlyArray<CombatEvent>,
): { readonly player: number; readonly ghost: number } {
  let player = 0;
  let ghost = 0;
  for (const e of events) {
    if (e.type !== 'ramp_tick') continue;
    if (e.target === 'player') player += e.amount;
    else ghost += e.amount;
  }
  return { player, ghost };
}
