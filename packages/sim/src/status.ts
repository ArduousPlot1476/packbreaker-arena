// Status engine for the M1.2.2 sim. Three statuses: burn, poison, stun.
//
// Per balance-bible.md § 4 + tech-architecture.md § 4.1:
//   - Burn:   1 dmg / stack / second (every 10 ticks). Stacks add. Decays
//             −1 stack per 20 ticks. Cap STATUS_STACK_CAPS.burn (= 10).
//   - Poison: 1 dmg / stack / second (every 10 ticks). Stacks add. No decay
//             (persists full combat). Cap STATUS_STACK_CAPS.poison (= 10).
//   - Stun:   Boolean — `pendingStun` flag per side. The next on_cooldown
//             trigger that would fire on that side is skipped instead, the
//             flag clears, and the resolver emits a 'stun_consumed' event.
//             Re-applying stun while pendingStun is true is a no-op.
//
// Tick ordering (codified in iteration.ts TICK_PHASES):
//   - tickStatusDamage runs in the `status_ticks` phase, player side first.
//   - cleanupStatus runs in the `cleanup` phase (last phase of the tick).
//   - consumeStunIfPending runs inside the `cooldowns` phase, atomically per
//     cooldown trigger that would otherwise fire.
//
// The combat resolver (M1.2.3) owns one StatusState per combatant and is
// responsible for:
//   - Calling applyStatus when an apply_status effect resolves.
//   - Calling tickStatusDamage in the status_ticks phase and applying the
//     returned damage to the combatant's HP (status.ts only computes per-tick
//     damage; HP mutation lives in the resolver).
//   - Calling consumeStunIfPending before each cooldown trigger fires; if it
//     returns true, skip the trigger's effects and emit the 'stun_consumed'
//     CombatEvent.
//   - Calling cleanupStatus once per tick at the end of the cleanup phase.

import { STATUS_STACK_CAPS, type StatusType, type EntityRef } from '@packbreaker/content';

/** Mutable per-side status state during a single combat. The resolver owns
 *  one of these per combatant; this module exposes the verbs that mutate it. */
export interface StatusState {
  /** Current burn stack count (0 if absent). Cap STATUS_STACK_CAPS.burn. */
  burn: number;
  /** Current poison stack count (0 if absent). Cap STATUS_STACK_CAPS.poison. */
  poison: number;
  /** True iff a stun is queued and not yet consumed. Boolean — never stacks. */
  pendingStun: boolean;
  /** Cleanup-phase decrementer. Counts ticks remaining until burn loses one
   *  stack (resets to 20 each decay). Untouched when burn === 0. */
  burnRemainingTicks: number;
}

/** Constructs a fresh per-side status state with all flags clear. */
export function createStatusState(): StatusState {
  return {
    burn: 0,
    poison: 0,
    pendingStun: false,
    burnRemainingTicks: 20,
  };
}

/** Applies `stacks` of `type` to `state`. Caps silently at STATUS_STACK_CAPS[type].
 *  No event emitted — the caller (effect resolver) emits the status_apply event.
 *  - Burn / poison: stacks add to current count, capped.
 *  - Stun: `stacks` is ignored; pendingStun is set to true. Re-applying while
 *    pendingStun is already true is a no-op (no benefit for queueing).
 *  - Negative or non-integer `stacks`: rejected silently. */
export function applyStatus(state: StatusState, type: StatusType, stacks: number): void {
  if (!Number.isInteger(stacks) || stacks < 0) return;

  if (type === 'stun') {
    // Boolean — `stacks` count ignored. Re-applying is a no-op.
    state.pendingStun = true;
    return;
  }

  const cap = STATUS_STACK_CAPS[type];
  if (type === 'burn') {
    state.burn = Math.min(cap, state.burn + stacks);
  } else if (type === 'poison') {
    state.poison = Math.min(cap, state.poison + stacks);
  }
}

/** Returns the per-tick burn / poison damage for `state` at `currentTick`.
 *  Damage fires only at integer-second boundaries (every 10 ticks, excluding
 *  tick 0). Status.ts does not apply damage to HP — the resolver does that
 *  with the returned numbers and emits the status_tick CombatEvents. */
export function tickStatusDamage(
  state: StatusState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _side: EntityRef,
  currentTick: number,
): { burnDamage: number; poisonDamage: number } {
  const isStatusTickSecond = currentTick > 0 && currentTick % 10 === 0;
  if (!isStatusTickSecond) {
    return { burnDamage: 0, poisonDamage: 0 };
  }
  return {
    burnDamage: state.burn,
    poisonDamage: state.poison,
  };
}

/** Cleanup phase work: burn decays −1 stack per 20 ticks. Poison does not
 *  decay (persists full combat). Stun is cleared by consumeStunIfPending,
 *  not by cleanup. Future timed buffs with remainingTicks counters will
 *  also tick down here. */
export function cleanupStatus(
  state: StatusState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _currentTick: number,
): void {
  if (state.burn > 0) {
    state.burnRemainingTicks -= 1;
    if (state.burnRemainingTicks <= 0) {
      state.burn = Math.max(0, state.burn - 1);
      state.burnRemainingTicks = 20;
    }
  }
  // poison: no decay
  // stun: cleared by consumeStunIfPending
}

/** Atomically reads-and-clears `pendingStun`. Returns true iff a stun was
 *  consumed. Caller skips the would-be cooldown trigger and emits the
 *  'stun_consumed' CombatEvent. */
export function consumeStunIfPending(state: StatusState): boolean {
  if (state.pendingStun) {
    state.pendingStun = false;
    return true;
  }
  return false;
}
