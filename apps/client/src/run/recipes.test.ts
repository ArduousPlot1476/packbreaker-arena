// Regression tests for detectRecipes via the @packbreaker/content adapter
// (originally M1.1.1 bugfix; lived in apps/client/src/data.local.test.ts
// pre-M1.3.4a). Verifies detectRecipes correctly matches each of the
// recipes that survive the iconned-subset filter (steel-sword,
// healing-salve, fire-oil), plus a non-recipe pair and a non-adjacent
// recipe-pair rejection. The scoutRecipes block (M1.3.4a §7) is
// adjacency-independent — any layout with the right multiset matches.

import { describe, expect, it } from 'vitest';
import { detectRecipes, scoutRecipes } from './recipes';
import type { BagItem, ItemId } from './types';

function place(uid: string, itemId: ItemId, col: number, row: number): BagItem {
  return { uid, itemId, col, row, rot: 0 };
}

const SWORD = 'iron-sword' as ItemId;
const DAGGER = 'iron-dagger' as ItemId;
const HERB = 'healing-herb' as ItemId;
const SPARK = 'spark-stone' as ItemId;
const WHET = 'whetstone' as ItemId;

describe('detectRecipes via the @packbreaker/content adapter', () => {
  it('matches Iron Sword + Iron Dagger → Steel Sword (the M1.1.1 regression case)', () => {
    const bag: BagItem[] = [
      place('a', SWORD, 1, 0), // 1×2 V → occupies (1,0) and (1,1)
      place('b', DAGGER, 2, 0), // 1×1 → occupies (2,0); edge-adjacent to (1,0)
    ];
    const matches = detectRecipes(bag);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe('r-steel-sword');
    expect(new Set(matches[0]!.uids)).toEqual(new Set(['a', 'b']));
  });

  it('matches Healing Herb + Healing Herb → Healing Salve', () => {
    const bag: BagItem[] = [place('a', HERB, 0, 0), place('b', HERB, 1, 0)];
    const matches = detectRecipes(bag);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe('r-healing-salve');
  });

  it('matches Spark Stone + Whetstone → Fire Oil', () => {
    const bag: BagItem[] = [place('a', SPARK, 0, 0), place('b', WHET, 1, 0)];
    const matches = detectRecipes(bag);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe('r-fire-oil');
  });

  it('returns no matches for Iron Sword + Healing Herb (non-recipe pair)', () => {
    const bag: BagItem[] = [place('a', SWORD, 0, 0), place('b', HERB, 1, 0)];
    expect(detectRecipes(bag)).toHaveLength(0);
  });

  it('returns no matches when the recipe items are NOT edge-adjacent', () => {
    const bag: BagItem[] = [
      place('a', SWORD, 0, 0), // (0,0) and (0,1)
      place('b', DAGGER, 5, 3), // far corner
    ];
    expect(detectRecipes(bag)).toHaveLength(0);
  });
});

describe('scoutRecipes — inventory-based recipe scouting (M1.3.4a §7)', () => {
  it('matches recipes by multiset alone, ignoring adjacency', () => {
    // Iron Sword + Iron Dagger placed at opposite corners → not
    // adjacent, so detectRecipes wouldn't match. scoutRecipes treats
    // the bag as a multiset and reports r-steel-sword as available.
    const bag: BagItem[] = [
      place('a', SWORD, 0, 0),
      place('b', DAGGER, 5, 3),
    ];
    const scouted = scoutRecipes(bag);
    expect(scouted.map((r) => r.id)).toContain('r-steel-sword');
  });

  it('respects multiset cardinality (Healing Salve needs TWO Healing Herbs)', () => {
    // Single Healing Herb is not enough for r-healing-salve.
    const single: BagItem[] = [place('a', HERB, 0, 0)];
    expect(scoutRecipes(single).map((r) => r.id)).not.toContain('r-healing-salve');

    // Two Healing Herbs (anywhere) → scouted.
    const pair: BagItem[] = [
      place('a', HERB, 0, 0),
      place('b', HERB, 4, 2),
    ];
    expect(scoutRecipes(pair).map((r) => r.id)).toContain('r-healing-salve');
  });

  it('returns an empty array when no recipe inputs are present', () => {
    const bag: BagItem[] = [place('a', 'apple' as ItemId, 0, 0)];
    expect(scoutRecipes(bag)).toEqual([]);
  });
});
