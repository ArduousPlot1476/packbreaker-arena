// CF-95b — the shop card's adjacency predicate.
//
// One question, asked structurally: does this item participate in a
// CROSS-ITEM mechanic? Two independent ways an item can, and an item
// qualifies on either:
//
//   1. it EMITS a neighbour buff        — some effect is `buff_adjacent`
//   2. it REACTS to a neighbour firing  — some trigger is `on_adjacent_trigger`
//
// Both are needed and neither is redundant. spark-stone and fire-oil react
// (on_adjacent_trigger) but emit apply_status at the OPPONENT, so an
// effect-only predicate misses them. mana-potion, stamina-tonic and
// berserkers-greataxe emit buff_adjacent from a NON-adjacency host trigger
// (on_round_start / on_low_health), so a trigger-only predicate misses those.
// Over the shipped registry this returns exactly 10 of 45 with zero false
// positives — pinned by test, not asserted here.
//
// Takes the CANONICAL content Item, never the client ItemDef: run/content.ts
// adaptItem STRIPS `triggers`, so an ItemDef would silently answer `false` for
// every item. Callers resolve from @packbreaker/content (the same reason
// describeItem.ts:31-32 documents).
//
// Display-only. Nothing here feeds the sim, and the sim's own adjacency
// resolution is untouched — this reads the same authored fields the sim reads
// and draws a flag from them.

import type { Item } from '@packbreaker/content';

export function hasAdjacencyMechanic(item: Item): boolean {
  return item.triggers.some(
    (trigger) =>
      trigger.type === 'on_adjacent_trigger' ||
      trigger.effects.some((effect) => effect.type === 'buff_adjacent'),
  );
}
