// triggers.ts — per-side mutable trigger state used by the combat resolver
// (M1.2.3b). Mirrors status.ts: pure verbs over a mutable struct, no classes,
// no environment access, no Math.random / Date.now.
//
// accumulateCooldown is a no-op when state.entries is empty. It only
// increments accumulators on entries that already exist. Entries are
// created lazily by shouldFire / recordFire / isFiringCapped — the
// resolver creates a TriggerState entry the first time it asks about
// a (placementId, triggerIndex) pair. A trigger that "becomes eligible"
// mid-combat (e.g., a future summon_temp_item) starts at
// cooldownAccumulator = 0 and accumulates only ticks observed AFTER
// its first access. This is intentional: the alternative (a global
// tick counter consulted on lazy-init) makes a trigger's eligibility
// a function of resolver call order, not resolver state, breaking
// determinism.
//
// Iteration over state.entries uses the same canonical-order rule as
// iteration.ts — Object.keys is sorted explicitly via locale-free string
// compare before the loop body runs. The resolver should never iterate
// state.entries without going through one of this module's verbs.

import type { PlacementId } from '@packbreaker/content';

/** Trigger types tracked by TriggerState. Mirrors the content-schemas.ts § 3
 *  Trigger['type'] union as a flat string union so this module stays
 *  decoupled from the Effect/Trigger schema variants themselves. */
export type TriggerType =
  | 'on_round_start'
  | 'on_cooldown'
  | 'on_hit'
  | 'on_taken_damage'
  | 'on_adjacent_trigger'
  | 'on_low_health';

/** Key for trigger state lookup: (placementId, triggerIndex).
 *  triggerIndex is the index into Item.triggers[] on the source item. */
export interface TriggerKey {
  readonly placementId: PlacementId;
  readonly triggerIndex: number;
}

/** Mutable per-trigger state. Owned by TriggerState; mutated by the verbs below. */
export interface TriggerEntry {
  /** Ticks since last fire (on_cooldown). Reset to 0 on recordFire('on_cooldown'). */
  cooldownAccumulator: number;
  /** Total fires this combat. Used for maxTriggersPerCombat gating. */
  firedCount: number;
  /** True iff on_low_health has fired this combat. One-shot. */
  lowHealthFired: boolean;
}

/** Per-side mutable trigger state. The resolver owns one of these per combatant.
 *  Keys are `${placementId}:${triggerIndex}` strings — see keyOf(). */
export interface TriggerState {
  /** Map keyed by `${placementId}:${triggerIndex}` — string key for deterministic
   *  iteration via Object.keys() with explicit sort. NEVER iterate without sorting. */
  entries: Record<string, TriggerEntry>;
}

/** Constructs a fresh, empty per-side trigger state. */
export function createTriggerState(): TriggerState {
  return { entries: {} };
}

/** Increment `cooldownAccumulator` for every existing entry by `ticks`. Called
 *  once per tick during the cooldowns phase before checking shouldFire.
 *
 *  No-op when state.entries is empty. Does NOT auto-create entries — accumulate
 *  only operates on entries already present. Lazy init lives in shouldFire /
 *  recordFire / isFiringCapped.
 *
 *  `ticks` is expected to be a non-negative integer. Float input is a caller
 *  bug; this module does not check it (consistent with status.ts which trusts
 *  caller-side integer math). */
export function accumulateCooldown(state: TriggerState, ticks: number): void {
  // Sorted iteration is unnecessary for correctness here (every entry receives
  // the same +ticks treatment), but we sort to document the canonical-order
  // rule — same pattern as iteration.ts. If a future change makes increment
  // order load-bearing, this becomes correctness-load-bearing too. Bare
  // .sort() uses ECMA262 default ToString + UTF-16 code-unit compare, which
  // is locale-free and deterministic; entry keys are unique, so the
  // equal-element branch is unreachable.
  const keys = Object.keys(state.entries).sort();
  for (const k of keys) {
    state.entries[k]!.cooldownAccumulator += ticks;
  }
}

/** Returns true iff the trigger at `key` should fire NOW.
 *
 *   - on_cooldown: requires cooldownAccumulator >= cooldownTicks.
 *     cooldownTicks = undefined is treated as ineligible (caller bug for
 *     passing on_cooldown without a cooldownTicks; we don't throw).
 *   - on_low_health: requires !lowHealthFired.
 *   - All types: requires firedCount < (maxTriggersPerCombat ?? Infinity).
 *
 *  Lazy-init: if `key` isn't in state.entries, a default entry is created
 *  (cooldownAccumulator=0, firedCount=0, lowHealthFired=false) before the
 *  eligibility check. Otherwise pure read — never mutates firedCount or
 *  any other field. */
export function shouldFire(
  state: TriggerState,
  key: TriggerKey,
  triggerType: TriggerType,
  cooldownTicks: number | undefined,
  maxTriggersPerCombat: number | undefined,
): boolean {
  const entry = lazyEntry(state, key);
  if (maxTriggersPerCombat !== undefined && entry.firedCount >= maxTriggersPerCombat) {
    return false;
  }
  if (triggerType === 'on_cooldown') {
    if (cooldownTicks === undefined) return false;
    return entry.cooldownAccumulator >= cooldownTicks;
  }
  if (triggerType === 'on_low_health') {
    return !entry.lowHealthFired;
  }
  // on_round_start, on_hit, on_taken_damage, on_adjacent_trigger: eligibility
  // is decided by the resolver from outside (e.g., damage-event observation
  // for on_hit). TriggerState only gates these by firedCount.
  return true;
}

/** Marks the trigger at `key` as fired.
 *   - on_cooldown: resets cooldownAccumulator to 0.
 *   - on_low_health: sets lowHealthFired = true.
 *   - All types: increments firedCount.
 *
 *  Lazy-init: same as shouldFire — creates a default entry if missing before
 *  applying the mutation. */
export function recordFire(
  state: TriggerState,
  key: TriggerKey,
  triggerType: TriggerType,
): void {
  const entry = lazyEntry(state, key);
  entry.firedCount += 1;
  if (triggerType === 'on_cooldown') {
    entry.cooldownAccumulator = 0;
  } else if (triggerType === 'on_low_health') {
    entry.lowHealthFired = true;
  }
  // on_round_start / on_hit / on_taken_damage / on_adjacent_trigger: no extra
  // per-type state. firedCount increment is sufficient.
}

/** Returns true iff firedCount has reached maxTriggersPerCombat (i.e., the
 *  trigger is permanently capped for the rest of this combat). Convenience
 *  for the resolver to short-circuit before calling shouldFire.
 *
 *  Returns false when maxTriggersPerCombat is undefined (uncapped trigger).
 *
 *  Lazy-init when capped is defined: same pattern as shouldFire / recordFire. */
export function isFiringCapped(
  state: TriggerState,
  key: TriggerKey,
  maxTriggersPerCombat: number | undefined,
): boolean {
  if (maxTriggersPerCombat === undefined) return false;
  const entry = lazyEntry(state, key);
  return entry.firedCount >= maxTriggersPerCombat;
}

// ── helpers ──────────────────────────────────────────────────────────

/** Internal: encode a TriggerKey to its string form for the entries map. */
function keyOf(k: TriggerKey): string {
  return `${k.placementId}:${k.triggerIndex}`;
}

/** Internal: returns the entry at `key`, lazily creating it on first access. */
function lazyEntry(state: TriggerState, key: TriggerKey): TriggerEntry {
  const sk = keyOf(key);
  let e = state.entries[sk];
  if (!e) {
    e = { cooldownAccumulator: 0, firedCount: 0, lowHealthFired: false };
    state.entries[sk] = e;
  }
  return e;
}
