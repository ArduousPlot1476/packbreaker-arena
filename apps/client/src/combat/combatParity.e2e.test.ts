// End-to-end regression for the combat-parity fix. Proves getPlayerStartingHp()
// + getRecipeBornPlacementIds() thread through the client combat-input builder,
// split by the live-vs-latent reality the two CFs actually have:
//
//   - CF 63 (LIVE): recipe-born items ARE reachable via iconned recipes, so this
//     is driven through the REAL client pipeline end-to-end
//     (buildCombatInput -> runCombat -> simulateCombat) with steel-sword
//     (r-steel-sword output; iron-sword + iron-dagger + steel-sword are all
//     iconned, so the client's SHOP_POOL_ITEMS-locked runCombat resolves them).
//
//   - CF 42 (LATENT): no maxHpBonus item is reachable, AND the client's runCombat
//     is registry-locked to SHOP_POOL_ITEMS (sim-bridge.combat.ts) — it throws
//     `canonicalCells: unknown itemId` on a non-iconned item like iron-shield.
//     That un-simulatability is itself part of why CF 42 is latent. So the HP
//     threading is asserted at the CombatInput boundary (the client's actual
//     contribution); sim consumption of startingHp is covered in packages/sim.
//
// Integer-floor note: we assert the recipe-born id REACHES the sim input, NOT a
// combat-number delta — a +N% bonus on a small integer effect floors unchanged,
// so a numeric assertion could not distinguish "applied" from "dropped". Sim-side
// consumption of recipeBornPlacementIds is covered by combat.ts isRecipeBornSource
// + recipe-combine-bonus.json.

import { describe, expect, it, vi } from 'vitest';
import { createRun, type RunController } from '@packbreaker/sim';
import {
  ClassId,
  ContractId,
  ITEMS,
  ItemId,
  RECIPES,
  RecipeId,
  RelicId,
  SimSeed,
  type Item,
} from '@packbreaker/content';
import { buildCombatInput } from './CombatOverlay';
import { runCombat } from './sim-bridge.combat';
import { simBagToClientBag } from '../run/sim-bridge';

// Mock the Phaser scene so importing CombatOverlay (for buildCombatInput) does
// not pull Phaser into happy-dom, where its canvas init throws. Mirrors the mock
// in CombatOverlay.test.tsx. runCombat is intentionally NOT mocked — the CF 63
// test drives the real sim combat end-to-end.
vi.mock('./CombatScene', () => ({
  createCombatGame: vi.fn(),
  CombatScene: { KEY: 'MockedCombatScene' },
  PORTRAIT_X_RATIO_PLAYER: 0.25,
  PORTRAIT_X_RATIO_GHOST: 0.75,
  PORTRAIT_Y_RATIO: 0.5,
}));

const cheap = (slug: string): Item => ({ ...ITEMS[ItemId(slug)]!, cost: 1 });
const recipe = (id: string) => RECIPES.find((r) => String(r.id) === id)!;

/** Minimal client run-state buildCombatInput consumes (seed / round / classId /
 *  relics / ruleset.bagDimensions). Bag dimensions come from the sim bag. */
function clientStateFrom(run: RunController): Parameters<typeof buildCombatInput>[1] {
  const snap = run.getState();
  return {
    seed: snap.seed,
    round: snap.currentRound,
    classId: snap.classId,
    relics: snap.relics,
    ruleset: { bagDimensions: snap.bag.dimensions },
  } as unknown as Parameters<typeof buildCombatInput>[1];
}

describe('combat-parity e2e — sim getters thread through the client combat-input builder', () => {
  it('CF 63 (live): recipe-born steel-sword threads recipeBornPlacementIds through the REAL runCombat pipeline', () => {
    // r-steel-sword: iron-sword + iron-dagger -> steel-sword. All three iconned,
    // so the client's runCombat (SHOP_POOL_ITEMS) resolves the combat bag.
    const items = {
      [ItemId('iron-sword')]: cheap('iron-sword'),
      [ItemId('iron-dagger')]: cheap('iron-dagger'),
      [ItemId('steel-sword')]: ITEMS[ItemId('steel-sword')]!,
    };
    const run = createRun({
      seed: SimSeed(7),
      classId: ClassId('tinker'),
      contractId: ContractId('neutral'),
      startingRelicId: RelicId('apprentices-loop'),
      itemsRegistry: items,
      recipesRegistry: [recipe('r-steel-sword')],
    });

    const slots = run.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    expect(swordSlot).toBeGreaterThanOrEqual(0);
    expect(daggerSlot).toBeGreaterThanOrEqual(0);
    run.buyItem(swordSlot);
    run.buyItem(daggerSlot);
    const pidSword = run.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0); // 1×2V (0,0)-(0,1)
    const pidDagger = run.placeItem(ItemId('iron-dagger'), { col: 1, row: 0 }, 0); // 1×1 (1,0), adjacent
    run.combineRecipe(RecipeId('r-steel-sword'), [pidSword, pidDagger]);

    const bag = run.getState().bag;
    const steel = bag.placements.find((p) => p.itemId === 'steel-sword');
    expect(steel).toBeDefined();
    expect(run.getRecipeBornPlacementIds()).toContain(steel!.placementId);

    const { input } = buildCombatInput(simBagToClientBag(bag), clientStateFrom(run), {
      startingHp: run.getPlayerStartingHp(),
      recipeBornPlacementIds: run.getRecipeBornPlacementIds(),
    });
    // The client change: the recipe-born id reaches the sim CombatInput.
    expect(input.player.recipeBornPlacementIds).toContain(steel!.placementId);

    // Real client combat runs coherently on the threaded input.
    const result = runCombat(input);
    expect(result.outcome).toBeDefined();
  });

  it('CF 42 (latent): maxHpBonus iron-shield threads startingHp 38 into CombatInput', () => {
    // r-iron-shield: wooden-shield ×2 -> iron-shield (maxHpBonus 8, recipe-born).
    // iron-shield is non-iconned, so the client's runCombat cannot simulate it —
    // the HP threading is asserted at the CombatInput boundary.
    const items = {
      [ItemId('wooden-shield')]: cheap('wooden-shield'),
      [ItemId('iron-shield')]: ITEMS[ItemId('iron-shield')]!,
    };
    const run = createRun({
      seed: SimSeed(7),
      classId: ClassId('tinker'),
      contractId: ContractId('neutral'),
      startingRelicId: RelicId('apprentices-loop'),
      itemsRegistry: items,
      recipesRegistry: [recipe('r-iron-shield')],
    });

    // Round-1 shop is Common-only; wooden-shield is the sole Common in the
    // registry, so every slot holds it. Buy two, place edge-adjacent.
    const slots = run.getState().shop.slots;
    const wsSlots = slots.map((s, i) => (s === 'wooden-shield' ? i : -1)).filter((i) => i >= 0);
    expect(wsSlots.length).toBeGreaterThanOrEqual(2);
    run.buyItem(wsSlots[0]!);
    run.buyItem(wsSlots[1]!);
    const pid1 = run.placeItem(ItemId('wooden-shield'), { col: 0, row: 0 }, 0);
    const pid2 = run.placeItem(ItemId('wooden-shield'), { col: 1, row: 0 }, 0);
    run.combineRecipe(RecipeId('r-iron-shield'), [pid1, pid2]);

    const bag = run.getState().bag;
    const iron = bag.placements.find((p) => p.itemId === 'iron-shield');
    expect(iron).toBeDefined();

    // Sim getters the client now threads: 30 + iron-shield maxHpBonus 8 = 38.
    expect(run.getPlayerStartingHp()).toBe(38);
    expect(run.getRecipeBornPlacementIds()).toContain(iron!.placementId);

    const { input } = buildCombatInput(simBagToClientBag(bag), clientStateFrom(run), {
      startingHp: run.getPlayerStartingHp(),
      recipeBornPlacementIds: run.getRecipeBornPlacementIds(),
    });
    // The client change: sim-authoritative HP (not the old hardcoded 30) and the
    // recipe-born id both reach the sim CombatInput.
    expect(input.player.startingHp).toBe(38);
    expect(input.player.recipeBornPlacementIds).toContain(iron!.placementId);
  });
});
