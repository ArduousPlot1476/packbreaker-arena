// replay.ts — replayCombat() iterator. Locked answer 14 (M1.2.4 ratification):
// thin generator wrapper around simulateCombat. Same code path, byte-identical
// events. May become true streaming if profiling motivates it; the public
// surface stays stable.

import type { CombatEvent, CombatInput } from '@packbreaker/content';
import { simulateCombat, type SimulateCombatOptions } from '../combat';

/** Streams the events from a deterministic combat replay. Currently a thin
 *  wrapper around simulateCombat — the entire combat resolves to a CombatEvent[]
 *  and the events are yielded in order. Identical (input, options) → identical
 *  yielded sequence. */
export function* replayCombat(
  input: CombatInput,
  options?: SimulateCombatOptions,
): Generator<CombatEvent, void, undefined> {
  const result = simulateCombat(input, options);
  yield* result.events;
}
