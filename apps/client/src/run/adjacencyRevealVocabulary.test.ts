// CF-95b — the "nearby" → "adjacent" change must NOT reach the bag chips.
//
// The concern is real and specific: adjacencyReveal.ts's compactLabel falls
// back to describeEffect (adjacencyReveal.ts:122), and describeEffect is where
// the changed strings live. adjacencyReveal.test.ts asserts chip labels are
// value+unit ONLY, never the rule sentence — so if the fallback were reachable
// for buff_adjacent, this edit would break that contract.
//
// It is NOT reachable, and this file proves it rather than reasoning about it:
// compactLabel's `if (effect.type === 'buff_adjacent')` switches over all three
// BuffableStat members (damage / cooldown_pct / trigger_chance_pct,
// content schemas § 3) and every arm RETURNS, so control never falls through
// to describeEffect for a buff_adjacent effect. The fallback serves class-3
// only (apply_status at the opponent — spark-stone, fire-oil).
//
// Falsifiability: this test goes RED if compactLabel ever starts delegating
// buff_adjacent to describeEffect, which is the exact refactor that would
// leak a rule sentence into a chip.

import { describe, expect, it } from 'vitest';
import { ITEMS } from '@packbreaker/content';
import type { Item, ItemId } from '@packbreaker/content';
import { computeItemRevealRows } from './adjacencyReveal';
import type { BagItem } from './types';

const getItem = (id: ItemId): Item =>
  (ITEMS as Readonly<Record<string, Item>>)[id as unknown as string];

const item = (uid: string, itemId: string, col: number, row: number): BagItem => ({
  uid,
  itemId: itemId as ItemId,
  col,
  row,
  rot: 0,
});

/** Whetstone beside Iron Sword: a live class-1 reaction buff with an affected
 *  target — the richest label-producing case in the registry, and the same
 *  fixture adjacencyReveal.test.ts uses for its own label assertions. */
const bag = (): BagItem[] => [
  item('whet', 'whetstone', 0, 0),
  item('sword', 'iron-sword', 1, 0),
];

/** Every label the reveal emits for BOTH items — the source's own rows and
 *  the target's, so a leak on either side is caught. */
function allLabels(): string[] {
  return bag()
    .flatMap((b) => computeItemRevealRows(bag(), b.uid))
    .map((row) => row.label);
}

describe('adjacencyReveal — chip labels never carry the rule sentence', () => {
  it('produces labels for the live reveal (the test is not vacuous)', () => {
    // Guard against a green-because-empty pass: if this bag stops producing
    // rows, the assertions below would hold trivially and prove nothing.
    expect(allLabels().length).toBeGreaterThan(0);
  });

  it('no label contains the describeItem rule wording, old or new', () => {
    for (const label of allLabels()) {
      expect(label).not.toContain('to adjacent');
      expect(label).not.toContain('adjacent weapons');
      expect(label).not.toContain('nearby');
      // and stays value+unit shaped
      expect(label.length).toBeLessThan(32);
    }
  });

  it('buff_adjacent labels come from compactLabel, not describeEffect', () => {
    // compactLabel's own wording for a damage buff is "+N dmg" — describeEffect
    // would have produced "+N dmg to adjacent weapons". The two now SHARE a
    // prefix, so asserting the short form must be anchored at both ends: a
    // `startsWith` check would pass on the rule sentence too.
    const labels = allLabels();
    expect(labels.some((l) => /^[+-]?\d+ dmg$/.test(l))).toBe(true);
  });
});

describe('describeItem vocabulary — the popover DOES say adjacent', () => {
  it('whetstone renders one relation in one word, twice', async () => {
    const { describeItem } = await import('../items/describeItem');
    const lines = describeItem(getItem('whetstone' as ItemId));
    expect(lines).toEqual([
      'When an adjacent weapon triggers — +1 dmg to adjacent weapons',
    ]);
    // The trigger condition already said "adjacent"; the effect clause now
    // agrees instead of saying "nearby".
    expect(lines[0]).not.toContain('nearby');
  });

  it('the recipe ladder relation is NOT unified into this wording', async () => {
    // "edge-to-edge" describes BFS connectivity over a recipe input cluster,
    // a different relation from pairwise adjacency. Deliberately untouched.
    const { describeItem } = await import('../items/describeItem');
    const all = Object.values(ITEMS as Readonly<Record<string, Item>>)
      .flatMap((i) => describeItem(i))
      .join(' | ');
    expect(all).not.toContain('edge-to-edge');
  });
});
