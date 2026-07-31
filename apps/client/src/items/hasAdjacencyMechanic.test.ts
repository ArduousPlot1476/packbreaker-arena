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

/** The twelve, enumerated by hand from packages/content/src/items.ts.
 *  Was ten; the commons adjacency rebalance added wooden-club and bandage,
 *  taking commons 3/20 → 5/20. This list is asserted BY NAME precisely so a
 *  registry change has to be acknowledged here rather than sliding through a
 *  count that still happens to add up. */
const ADJACENCY_ITEMS = [
  'mana-potion', // on_round_start   → buff_adjacent cooldown_pct
  'whetstone', // on_adjacent_trigger → buff_adjacent damage
  'spark-stone', // on_adjacent_trigger → apply_status (NOT buff_adjacent)
  'wooden-club', // on_cooldown      → buff_adjacent trigger_chance_pct  (rebalance)
  'bandage', // on_low_health        → buff_adjacent damage             (rebalance)
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

  it('leaves the other 33 unmarked (no false positives)', () => {
    const all = Object.values(ITEMS as Readonly<Record<string, Item>>);
    expect(all).toHaveLength(45);
    const unmarked = all.filter((i) => !hasAdjacencyMechanic(i));
    expect(unmarked).toHaveLength(33);
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
  it('commons carry adjacency at 5/20 after the rebalance', () => {
    const byRarity: Record<string, number> = {};
    for (const item of Object.values(ITEMS as Readonly<Record<string, Item>>)) {
      if (!hasAdjacencyMechanic(item)) continue;
      byRarity[item.rarity] = (byRarity[item.rarity] ?? 0) + 1;
    }
    // Was { common: 3, ... } — an epic-tier concept in a commons-heavy opening.
    // The rebalance took commons to 5, which moves shop-shows-at-least-one from
    // 1−(17/20)^5 = 55.6% to 1−(15/20)^5 = 76.3% over a 5-slot shop.
    expect(byRarity).toEqual({ common: 5, uncommon: 2, rare: 2, epic: 3 });
  });

  it('the shop-encounter rate follows from the count, not from vibes', () => {
    const commons = Object.values(ITEMS as Readonly<Record<string, Item>>).filter(
      (i) => i.rarity === 'common',
    );
    const withAdj = commons.filter(hasAdjacencyMechanic).length;
    expect(commons).toHaveLength(20);
    expect(withAdj).toBe(5);
    // Rounds 1–3 are gated to commons, 5 slots drawn with replacement.
    const pAtLeastOne = 1 - Math.pow((commons.length - withAdj) / commons.length, 5);
    expect(pAtLeastOne).toBeCloseTo(0.7627, 4);
  });
});
