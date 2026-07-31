// CF-95b — the adjacency predicate, pinned against the shipped registry.
//
// The mark is only as good as this predicate: a false positive marks an item
// whose neighbours do nothing, a false negative leaves a cross-item item
// looking inert. So this asserts the EXACT named set, not a count — a count
// passes even when the membership is wrong in two compensating ways.

import { describe, expect, it } from 'vitest';
import { ITEMS } from '@packbreaker/content';
import type { Item, ItemId } from '@packbreaker/content';
import { hasAdjacencyMechanic } from './hasAdjacencyMechanic';

const getItem = (id: ItemId): Item =>
  (ITEMS as Readonly<Record<string, Item>>)[id as unknown as string];

/** The ten, enumerated by hand from packages/content/src/items.ts. */
const ADJACENCY_ITEMS = [
  'mana-potion', // on_round_start   → buff_adjacent cooldown_pct
  'whetstone', // on_adjacent_trigger → buff_adjacent damage
  'spark-stone', // on_adjacent_trigger → apply_status (NOT buff_adjacent)
  'stamina-tonic', // on_round_start   → buff_adjacent cooldown_pct
  'fire-oil', // on_adjacent_trigger → apply_status (NOT buff_adjacent)
  'forge-anvil', // on_adjacent_trigger → buff_adjacent damage
  'rune-pedestal', // on_adjacent_trigger → buff_adjacent trigger_chance_pct
  'berserkers-greataxe', // on_low_health → buff_adjacent damage
  'master-alchemists-kit', // on_adjacent_trigger → buff_adjacent trigger_chance_pct
  'resonance-crystal', // on_adjacent_trigger → 2× buff_adjacent
] as const;

describe('hasAdjacencyMechanic — registry membership', () => {
  it('selects EXACTLY the ten known adjacency items, by name', () => {
    const selected = Object.values(ITEMS as Readonly<Record<string, Item>>)
      .filter(hasAdjacencyMechanic)
      .map((i) => String(i.id))
      .sort();
    expect(selected).toEqual([...ADJACENCY_ITEMS].map(String).sort());
  });

  it('leaves the other 35 unmarked (no false positives)', () => {
    const all = Object.values(ITEMS as Readonly<Record<string, Item>>);
    expect(all).toHaveLength(45);
    const unmarked = all.filter((i) => !hasAdjacencyMechanic(i));
    expect(unmarked).toHaveLength(35);
    for (const item of unmarked) {
      expect(ADJACENCY_ITEMS).not.toContain(String(item.id));
    }
  });
});

describe('hasAdjacencyMechanic — both limbs are load-bearing', () => {
  // If either limb of the predicate is dropped, one of these two groups
  // silently stops being marked. Named separately so a regression says WHICH.
  it('EFFECT limb: catches a buff_adjacent hosted by a NON-adjacency trigger', () => {
    // on_round_start / on_low_health hosts — a trigger-only predicate misses these.
    for (const id of ['mana-potion', 'stamina-tonic', 'berserkers-greataxe']) {
      const item = getItem(id as ItemId);
      expect(item.triggers.some((t) => t.type === 'on_adjacent_trigger')).toBe(false);
      expect(hasAdjacencyMechanic(item)).toBe(true);
    }
  });

  it('TRIGGER limb: catches on_adjacent_trigger whose effect is NOT buff_adjacent', () => {
    // spark-stone / fire-oil react to a neighbour but apply status to the
    // OPPONENT — an effect-only predicate misses these.
    for (const id of ['spark-stone', 'fire-oil']) {
      const item = getItem(id as ItemId);
      const emits = item.triggers.some((t) =>
        t.effects.some((e) => e.type === 'buff_adjacent'),
      );
      expect(emits).toBe(false);
      expect(hasAdjacencyMechanic(item)).toBe(true);
    }
  });
});

describe('hasAdjacencyMechanic — rarity spread (the reason the mark exists)', () => {
  it('adjacency is an epic-tier concept in a commons-heavy opening', () => {
    const byRarity: Record<string, number> = {};
    for (const item of Object.values(ITEMS as Readonly<Record<string, Item>>)) {
      if (!hasAdjacencyMechanic(item)) continue;
      byRarity[item.rarity] = (byRarity[item.rarity] ?? 0) + 1;
    }
    // 3 of 20 commons vs 3 of 4 epics — the discoverability gap this marks.
    expect(byRarity).toEqual({ common: 3, uncommon: 2, rare: 2, epic: 3 });
  });
});
