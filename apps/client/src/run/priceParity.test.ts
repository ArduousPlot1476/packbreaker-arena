// B1 price-parity regression (CF 34 / M1.5e PR 1). The shop price the UI shows
// (simShopToClientShop's `cost`, computed via sim's effectiveItemCost) MUST
// equal the gold sim.buyItem actually deducts. This is the one bug class the
// general gate can silently miss: it only surfaces when a ruleset modifier
// makes effectiveItemCost diverge from the raw item cost. Merchant's Mark
// (packages/content/src/relics.ts) sets itemCostDelta:-1, so every shop item is
// 1g cheaper than its raw cost — exactly the divergent path the pre-flip client
// (which displayed raw def.cost while sim charged the effective cost) got wrong.

import { describe, expect, it } from 'vitest';
import { createRun, type RunController } from '@packbreaker/sim';
import type { ClassId, ContractId, RelicId, SimSeed } from '@packbreaker/content';
import { ICONNED_RECIPES, ITEMS, SHOP_POOL_ITEMS } from './content';
import { simShopToClientShop } from './sim-bridge';

const MERCHANTS_MARK = 'merchants-mark' as RelicId; // starter, modifiers.itemCostDelta = -1

function makeRun(seed: number): RunController {
  return createRun({
    seed: seed as SimSeed,
    classId: 'tinker' as ClassId,
    contractId: 'neutral' as ContractId,
    startingRelicId: MERCHANTS_MARK,
    itemsRegistry: SHOP_POOL_ITEMS,
    recipesRegistry: ICONNED_RECIPES,
  });
}

describe("B1 price parity — displayed shop price == price charged (Merchant's Mark itemCostDelta:-1)", () => {
  it('the effective cost the UI shows is exactly what sim.buyItem deducts, and 1g below raw', () => {
    // Try a few seeds so we land on a slot whose effective cost is affordable.
    for (const seed of [1, 7, 42, 1000, 2024]) {
      const run = makeRun(seed);
      const before = run.getState();
      const clientShop = simShopToClientShop(before);
      const idx = clientShop.findIndex((s) => s.itemId !== null && s.cost <= before.gold);
      if (idx < 0) continue;

      const slot = clientShop[idx]!;
      const rawCost = ITEMS[slot.itemId!]!.cost;

      run.buyItem(idx);
      const charged = before.gold - run.getState().gold;

      // Displayed price (slot.cost) === charged price (gold delta on buyItem).
      expect(charged).toBe(slot.cost);
      // And the relic actually bit — effective is 1g below raw (default
      // multiplier), proving this exercises the divergent path, not a
      // coincidental raw == effective slot.
      expect(slot.cost).toBe(Math.max(0, rawCost - 1));
      return;
    }
    throw new Error('no affordable shop slot found across seeds — adjust the seed list');
  });
});
