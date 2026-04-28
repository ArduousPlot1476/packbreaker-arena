// Regression tests for the @packbreaker/content → prototype data adapter (M1.1.1).
//
// Verifies that detectRecipes, when fed a bag of adapted ItemDefs, correctly
// matches each of the three M1 recipes that survive the seed-set filter,
// and rejects a non-recipe pair. M1.1's content test suite covered the
// package data only — it did not exercise the adapter, which is how the
// recipe regression slipped through.

import { describe, expect, it } from 'vitest';
import type { BagItem, ItemId } from './data.local';
import { detectRecipes } from './run/recipes';

function place(uid: string, itemId: ItemId, col: number, row: number): BagItem {
  return { uid, itemId, col, row, rot: 0 };
}

describe('detectRecipes via the @packbreaker/content adapter', () => {
  it('matches Iron Sword + Iron Dagger → Steel Sword (the regression case)', () => {
    const bag: BagItem[] = [
      place('a', 'iron-sword', 1, 0),  // 1×2 V → occupies (1,0) and (1,1)
      place('b', 'iron-dagger', 2, 0), // 1×1 → occupies (2,0); edge-adjacent to (1,0)
    ];
    const matches = detectRecipes(bag);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe('r-steel-sword');
    expect(new Set(matches[0]!.uids)).toEqual(new Set(['a', 'b']));
  });

  it('matches Healing Herb + Healing Herb → Healing Salve', () => {
    const bag: BagItem[] = [
      place('a', 'healing-herb', 0, 0),
      place('b', 'healing-herb', 1, 0),
    ];
    const matches = detectRecipes(bag);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe('r-healing-salve');
  });

  it('matches Spark Stone + Whetstone → Fire Oil', () => {
    const bag: BagItem[] = [
      place('a', 'spark-stone', 0, 0),
      place('b', 'whetstone', 1, 0),
    ];
    const matches = detectRecipes(bag);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipe.id).toBe('r-fire-oil');
  });

  it('returns no matches for Iron Sword + Healing Herb (non-recipe pair)', () => {
    const bag: BagItem[] = [
      place('a', 'iron-sword', 0, 0),
      place('b', 'healing-herb', 1, 0),
    ];
    expect(detectRecipes(bag)).toHaveLength(0);
  });

  it('returns no matches when the recipe items are NOT edge-adjacent', () => {
    const bag: BagItem[] = [
      place('a', 'iron-sword', 0, 0),   // (0,0) and (0,1)
      place('b', 'iron-dagger', 5, 3),  // far corner
    ];
    expect(detectRecipes(bag)).toHaveLength(0);
  });
});
