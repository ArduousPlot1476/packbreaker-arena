// "Can this item actually end a fight?"
//
// ─── Why this exists ──────────────────────────────────────────────────────
//
// Measured with the balance harness: **14 of 20 Commons deal no damage at all**,
// and two of the six that do cannot kill a 30 HP opponent inside the pre-ramp
// window — `iron-mace` tops out at 20 total damage and `throwing-knife` at 8.
// So only 4 of 20 Commons can win round 1.
//
// The consequence measured across 1880 combats: rounds 1–2 draw 50–60% of the
// time, and **91% of all draws are combats where NEITHER side dealt a single
// point of item damage**. 30 HP vs 30 HP, nothing able to move either number,
// until the sudden-death ramp kills both on the same tick. A draw costs a heart,
// so two of those and a loss is a dead run — which is exactly why the median run
// reached round 3 of 11.
//
// Raising gold does NOT fix this. Drawing k items from a pool that is 70% inert
// leaves P(no damage) = 0.7^k; reaching the <1% draw guardrail by volume alone
// needs k ≈ 13 items in round 1. Measured: at 2.5× gold the bot still held 1.55
// items in round 1 and inertness only fell 60.6% → 49.2%. The pool is the
// bottleneck, not the economy.
//
// So the shop and the early ghost guarantee a resolver instead. This module is
// the single predicate both of those use.

import { RAMP_START_TICK } from '@packbreaker/sim';
import type { Item } from '@packbreaker/content';

/** Total damage an item can be *guaranteed* to deal before sudden death starts.
 *
 *  Deliberately CONSERVATIVE. Only unconditional triggers count:
 *
 *  - `on_cooldown` fires on a clock, so its output is bounded and knowable.
 *  - `on_round_start` fires exactly once (or `maxTriggersPerCombat` times).
 *
 *  `on_hit`, `on_taken_damage`, `on_low_health` and `on_adjacent_trigger` are
 *  counted as ZERO. They are all conditional on something else happening first —
 *  and in the degenerate case this predicate exists to prevent, nothing else IS
 *  happening. An `on_taken_damage` retaliator in a bag facing an inert opponent
 *  deals nothing, forever. Counting it would defeat the purpose.
 *
 *  Buffs are also ignored: `whetstone` grants +1 damage to an adjacent weapon,
 *  which is worth nothing when there is no weapon to adjoin. */
export function guaranteedDamageBeforeRamp(item: Item): number {
  let total = 0;
  for (const trigger of item.triggers) {
    let fires: number;
    if (trigger.type === 'on_cooldown') {
      // First fire lands at tick === cooldownTicks (the accumulator lazy-inits
      // at 0 and increments once per tick), so a 50-tick weapon gets
      // floor(500/50) = 10 procs before the ramp, not 11.
      const cd = trigger.cooldownTicks;
      if (cd <= 0) continue;
      fires = Math.floor(RAMP_START_TICK / cd);
    } else if (trigger.type === 'on_round_start') {
      fires = 1;
    } else {
      continue; // conditional — see above
    }
    const capped = trigger.maxTriggersPerCombat;
    if (typeof capped === 'number') fires = Math.min(fires, capped);

    for (const effect of trigger.effects) {
      if (effect.type === 'damage' && effect.target === 'opponent') {
        total += effect.amount * fires;
      }
    }
  }
  return total;
}

/** Base combatant HP an early-round opponent has. Imported rather than
 *  re-derived would be better, but BASE_COMBATANT_HP is the *player* baseline
 *  and the early ghost adds a round-scaled bonus on top; this is the floor a
 *  resolver must be able to chew through, which is the honest bar. */
const EARLY_OPPONENT_HP = 30;

/** True iff this item can end an early-round fight on its own.
 *
 *  This is the predicate that separates a weapon from a *decoy*. `iron-mace` and
 *  `throwing-knife` both carry the `weapon` tag and both render with a damage
 *  clause on the shop card, and neither can win round 1 — 20 and 8 total damage
 *  against 30 HP. Tag-based or effect-presence-based tests call them weapons;
 *  this one does not. */
export function isResolver(item: Item): boolean {
  return guaranteedDamageBeforeRamp(item) >= EARLY_OPPONENT_HP;
}

/** True iff the item deals any unconditional damage at all. Weaker than
 *  `isResolver` — `iron-mace` passes this and fails that. Kept separate because
 *  the two questions have different right answers depending on the caller. */
export function dealsDamage(item: Item): boolean {
  return guaranteedDamageBeforeRamp(item) > 0;
}

/** Ids of every resolver in a pool, sorted for deterministic iteration. Sorting
 *  matters: the callers pick from this list with a seeded rng, and an unsorted
 *  Object.keys order would make the pick depend on insertion order. */
export function resolverIds(pool: Readonly<Record<string, Item>>): ReadonlyArray<string> {
  return Object.keys(pool)
    .filter((id) => isResolver(pool[id]!))
    .sort();
}
