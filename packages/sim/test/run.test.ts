// run.test.ts — M1.2.4 unit-level run-state machine cases. Fixture-suite
// tests live in run-fixtures.test.ts; this file covers targeted invariants
// from the spec § 8.

import { describe, expect, it } from 'vitest';
import {
  ClassId,
  ContractId,
  FORGE_TYRANT,
  GhostId,
  IsoTimestamp,
  ItemId,
  ITEMS,
  PlacementId,
  RecipeId,
  RelicId,
  SimSeed,
  type Combatant,
  type GhostBuild,
  type Item,
  type Recipe,
  type RelicSlots,
  type TelemetryEvent,
  type Trigger,
} from '@packbreaker/content';
import { createRun, type CreateRunInput } from '../src/run';
import { simulateCombat } from '../src/combat';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');
const NEUTRAL = ContractId('neutral');
const APPRENTICES_LOOP = RelicId('apprentices-loop');
const POCKET_FORGE = RelicId('pocket-forge');
const MERCHANTS_MARK = RelicId('merchants-mark');
const RAZORS_EDGE = RelicId('razors-edge');
const NO_RELICS: RelicSlots = { starter: null, mid: null, boss: null };

function emptyGhost(startingHp: number, classId = TINKER): Combatant {
  return {
    bag: { dimensions: { width: 6, height: 4 }, placements: [] },
    relics: NO_RELICS,
    classId,
    startingHp,
  };
}

function defineTestItem(slug: string, triggers: ReadonlyArray<Trigger>, opts: Partial<Item> = {}): Item {
  return {
    id: ItemId(slug),
    name: opts.name ?? slug,
    rarity: opts.rarity ?? 'common',
    classAffinity: opts.classAffinity ?? null,
    shape: opts.shape ?? [{ col: 0, row: 0 }],
    tags: opts.tags ?? [],
    cost: opts.cost ?? 3,
    triggers,
    artId: slug,
    ...(opts.passiveStats ? { passiveStats: opts.passiveStats } : {}),
  };
}

function baseInput(overrides: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    seed: SimSeed(1),
    classId: TINKER,
    contractId: NEUTRAL,
    startingRelicId: APPRENTICES_LOOP,
    ...overrides,
  };
}

/** Builds a 1g-cost variant of a real item — multi-item test scenarios in
 *  round 1 (4g income) can't otherwise afford two 3g Commons. The clone
 *  preserves id / shape / triggers / tags so recipes still match. */
function cheapItem(slug: string): Item {
  const real = ITEMS[ItemId(slug)];
  if (!real) throw new Error(`cheapItem: unknown slug ${slug}`);
  return { ...real, cost: 1 };
}

// ─── Lifecycle ──────────────────────────────────────────────────────

describe('run lifecycle', () => {
  it('createRun starts at round 1 in arranging phase with starting gold', () => {
    const ctrl = createRun(baseInput());
    expect(ctrl.getPhase()).toBe('arranging');
    const state = ctrl.getState();
    expect(state.currentRound).toBe(1);
    expect(state.outcome).toBe('in_progress');
    // Starting gold = bonusStartingGold (0 for Apprentice's Loop) + round 1 base income (4).
    expect(state.gold).toBe(4);
    expect(state.hearts).toBe(3);
    expect(state.bag.placements).toHaveLength(0);
    expect(state.shop.slots).toHaveLength(5);
    expect(state.relics.starter).toBe(APPRENTICES_LOOP);
  });

  it('full 11-round happy path → outcome \"won\"', () => {
    const knife = defineTestItem('test-knife', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], { tags: ['weapon'] });
    const items = { [knife.id]: knife };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));

    // Round 1: buy + place the knife.
    ctrl.buyItem(0);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    ctrl.startCombat(emptyGhost(1));
    expect(ctrl.getPhase()).toBe('resolution');
    ctrl.advancePhase();

    // Rounds 2–11: knife persists in bag, combat one-shots ghost.
    for (let r = 2; r <= 11; r++) {
      expect(ctrl.getState().currentRound).toBe(r);
      expect(ctrl.getPhase()).toBe('arranging');
      ctrl.startCombat(emptyGhost(1));
      ctrl.advancePhase();
    }
    expect(ctrl.getPhase()).toBe('ended');
    expect(ctrl.getState().outcome).toBe('won');
  });
});

// ─── Phase guards ──────────────────────────────────────────────────

describe('phase guards', () => {
  it('buyItem during \"resolution\" throws', () => {
    const knife = defineTestItem('test-knife', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], { tags: ['weapon'] });
    const items = { [knife.id]: knife };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    ctrl.startCombat(emptyGhost(1));
    // Now in resolution phase.
    expect(ctrl.getPhase()).toBe('resolution');
    expect(() => ctrl.buyItem(0)).toThrow(/arranging/);
  });

  it('combineRecipe during \"resolution\" throws', () => {
    const knife = defineTestItem('test-knife', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], { tags: ['weapon'] });
    const items = { [knife.id]: knife };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    ctrl.startCombat(emptyGhost(1));
    expect(() => ctrl.combineRecipe(RecipeId('any'))).toThrow(/arranging/);
  });

  it('advancePhase from \"ended\" throws', () => {
    // Run with no damage source vs tanky ghost: combat times out → draw →
    // treated as loss → heart decrement. After 3 losses, hearts → 0 →
    // 'eliminated'. advancePhase from 'ended' must throw.
    const ctrl = createRun(baseInput());
    for (let i = 0; i < 3; i++) {
      ctrl.startCombat(emptyGhost(200));
      ctrl.advancePhase();
    }
    expect(ctrl.getPhase()).toBe('ended');
    expect(ctrl.getState().outcome).toBe('eliminated');
    expect(() => ctrl.advancePhase()).toThrow(/ended/);
  });

  it('advancePhase during \"arranging\" throws', () => {
    const ctrl = createRun(baseInput());
    expect(() => ctrl.advancePhase()).toThrow(/invalid/);
  });
});

// ─── Shop generation rarity gate ───────────────────────────────────

describe('shop generation', () => {
  it('round 1 shop has only Common items', () => {
    const ctrl = createRun(baseInput());
    const slots = ctrl.getState().shop.slots;
    for (const id of slots) {
      expect(ITEMS[id]!.rarity).toBe('common');
    }
  });

  it('shop generation is deterministic for a fixed seed + class', () => {
    const a = createRun(baseInput({ seed: SimSeed(42) }));
    const b = createRun(baseInput({ seed: SimSeed(42) }));
    expect(a.getState().shop.slots).toEqual(b.getState().shop.slots);
  });

  it('different classes produce different shops with the same seed (affinity weighting)', () => {
    // Pool with one Tinker-affined common (Whetstone) + one Marauder-affined
    // common (proxy via War Axe — wait, that's uncommon. Use a synthetic).
    const tinkerItem = defineTestItem('test-tinker-tool', [], { tags: ['tool'], classAffinity: TINKER });
    const marauderItem = defineTestItem('test-marauder-weapon', [], { tags: ['weapon'], classAffinity: MARAUDER });
    const items = { [tinkerItem.id]: tinkerItem, [marauderItem.id]: marauderItem };
    const a = createRun(baseInput({ classId: TINKER, itemsRegistry: items, seed: SimSeed(7) }));
    const b = createRun(baseInput({ classId: MARAUDER, startingRelicId: RAZORS_EDGE, itemsRegistry: items, seed: SimSeed(7) }));
    // Statistically the shops should differ — same RNG sequence consumed
    // against different cumulative weights produces different selections.
    expect(a.getState().shop.slots).not.toEqual(b.getState().shop.slots);
  });
});

// ─── Reroll cost & gold check ──────────────────────────────────────

describe('reroll economy', () => {
  it("Apprentice's Loop grants one free reroll per round", () => {
    const ctrl = createRun(baseInput({ startingRelicId: APPRENTICES_LOOP }));
    const goldBefore = ctrl.getState().gold;
    ctrl.rerollShop(); // first reroll: free with Loop.
    expect(ctrl.getState().gold).toBe(goldBefore);
    expect(ctrl.getState().shop.rerollsThisRound).toBe(1);
    ctrl.rerollShop(); // second reroll: 1g (rerollCostStart=1).
    expect(ctrl.getState().gold).toBe(goldBefore - 1);
    expect(ctrl.getState().shop.rerollsThisRound).toBe(2);
  });

  it('without extraRerollsPerRound, first reroll costs 1g', () => {
    // Pocket Forge has no extraRerollsPerRound.
    const ctrl = createRun(baseInput({ startingRelicId: POCKET_FORGE }));
    const goldBefore = ctrl.getState().gold;
    ctrl.rerollShop();
    expect(ctrl.getState().gold).toBe(goldBefore - 1);
  });

  it('reroll without enough gold throws', () => {
    const ctrl = createRun(baseInput({ startingRelicId: POCKET_FORGE }));
    // Burn all gold first by buying. Round 1: 4g, Common = 3g.
    ctrl.buyItem(0); // -3g → 1g.
    ctrl.rerollShop(); // -1g → 0g.
    expect(() => ctrl.rerollShop()).toThrow(/insufficient gold/);
  });
});

// ─── Item costs & sell value ───────────────────────────────────────

describe('item costs', () => {
  it("Common item sells for 1g recovery (50% of 3g cost, floored)", () => {
    const ctrl = createRun(baseInput());
    ctrl.buyItem(0);
    const itemId = ctrl.getState().shop.slots[0]!;
    const goldAfterBuy = ctrl.getState().gold;
    const placementId = ctrl.placeItem(itemId, { col: 0, row: 0 }, 0);
    ctrl.sellItem(placementId);
    expect(ctrl.getState().gold).toBe(goldAfterBuy + 1);
  });

  it("Merchant's Mark (-1g item cost): Common 3g → 2g effective; sell 1g (50% of 2g)", () => {
    const ctrl = createRun(baseInput({ startingRelicId: MERCHANTS_MARK }));
    const goldBefore = ctrl.getState().gold;
    ctrl.buyItem(0);
    expect(ctrl.getState().gold).toBe(goldBefore - 2); // 2g effective cost
    const itemId = ctrl.getState().shop.slots[0]!;
    const placementId = ctrl.placeItem(itemId, { col: 0, row: 0 }, 0);
    const goldAfterBuy = ctrl.getState().gold;
    ctrl.sellItem(placementId);
    // sellRecoveryBp 5000 of effective 2g = 1g.
    expect(ctrl.getState().gold).toBe(goldAfterBuy + 1);
  });
});

// ─── Recipe detection ─────────────────────────────────────────────

describe('recipe detection', () => {
  it('Iron Sword + Iron Dagger adjacent → r-steel-sword match', () => {
    // Use cheap-cost variants so round 1's 4g income covers both purchases.
    const items = {
      [ItemId('iron-sword')]: cheapItem('iron-sword'),
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items, seed: SimSeed(7) }));
    // Buy both items. With a 2-item pool and 5 slots, both will be present.
    const slots = ctrl.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    expect(swordSlot).toBeGreaterThanOrEqual(0);
    expect(daggerSlot).toBeGreaterThanOrEqual(0);
    expect(swordSlot).not.toBe(daggerSlot);
    ctrl.buyItem(swordSlot);
    ctrl.buyItem(daggerSlot);
    ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0); // 1×2V at (0,0)-(0,1)
    ctrl.placeItem(ItemId('iron-dagger'), { col: 1, row: 0 }, 0); // 1×1 at (1,0); adjacent to (0,0)
    const matches = ctrl.detectRecipes();
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipeId).toBe(RecipeId('r-steel-sword'));
  });

  it('Iron Sword + Iron Dagger NOT adjacent → no match', () => {
    const items = {
      [ItemId('iron-sword')]: cheapItem('iron-sword'),
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items, seed: SimSeed(7) }));
    const slots = ctrl.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    ctrl.buyItem(swordSlot);
    ctrl.buyItem(daggerSlot);
    ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0); // (0,0)-(0,1)
    ctrl.placeItem(ItemId('iron-dagger'), { col: 3, row: 3 }, 0); // (3,3); not adjacent
    expect(ctrl.detectRecipes()).toHaveLength(0);
  });
});

// ─── Recipe combine + recipeBonusPct routing ──────────────────────

describe('recipe combine', () => {
  it('combineRecipe in arranging produces output at top-left of input footprint', () => {
    const items = {
      [ItemId('iron-sword')]: cheapItem('iron-sword'),
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
      [ItemId('steel-sword')]: ITEMS[ItemId('steel-sword')]!,
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items, seed: SimSeed(7) }));
    // Buy enough — with 3-item pool, all should appear with high probability.
    const slots = ctrl.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    expect(swordSlot).toBeGreaterThanOrEqual(0);
    expect(daggerSlot).toBeGreaterThanOrEqual(0);
    ctrl.buyItem(swordSlot);
    ctrl.buyItem(daggerSlot);
    ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0);
    ctrl.placeItem(ItemId('iron-dagger'), { col: 1, row: 0 }, 0);
    ctrl.combineRecipe(RecipeId('r-steel-sword'));
    const bag = ctrl.getState().bag;
    expect(bag.placements).toHaveLength(1);
    expect(bag.placements[0]!.itemId).toBe('steel-sword');
    expect(bag.placements[0]!.anchor).toEqual({ col: 0, row: 0 });
  });

  it('combineRecipe applies +25% recipeBonusPct (Tinker 10 + Pocket Forge 15) to recipe-output damage', () => {
    const items = {
      [ItemId('iron-sword')]: cheapItem('iron-sword'),
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
      [ItemId('steel-sword')]: ITEMS[ItemId('steel-sword')]!,
    };
    const ctrl = createRun(baseInput({
      itemsRegistry: items,
      startingRelicId: POCKET_FORGE,
      seed: SimSeed(7),
    }));
    const slots = ctrl.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    ctrl.buyItem(swordSlot);
    ctrl.buyItem(daggerSlot);
    ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0);
    ctrl.placeItem(ItemId('iron-dagger'), { col: 1, row: 0 }, 0);
    ctrl.combineRecipe(RecipeId('r-steel-sword'));
    // Steel Sword damage 6 base × 125% = 7.5 floored = 7.
    const ghost = emptyGhost(100); // tank to absorb the hit and let Steel Sword fire
    const result = ctrl.startCombat(ghost);
    const firstDmg = result.events.find((e) => e.type === 'damage');
    expect(firstDmg).toBeDefined();
    if (firstDmg?.type === 'damage') expect(firstDmg.amount).toBe(7);
  });
});

// ─── Round economics ──────────────────────────────────────────────

describe('round economics', () => {
  it('round 1 base income = 4g; round 4 = 5g (goldStepRounds=3)', () => {
    const knife = defineTestItem('test-knife', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], { tags: ['weapon'] });
    const items = { [knife.id]: knife };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    expect(ctrl.getState().gold).toBe(4); // round 1 starting income.

    ctrl.buyItem(0); // -3g → 1g.
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    ctrl.startCombat(emptyGhost(1)); // win → +1g winBonus → 2g.
    expect(ctrl.getState().gold).toBe(2);
    ctrl.advancePhase(); // round 2: +4g → 6g.
    expect(ctrl.getState().currentRound).toBe(2);
    expect(ctrl.getState().gold).toBe(6);

    // Round 2 win → +1g → 7g. advance → round 3, +4g → 11g.
    ctrl.startCombat(emptyGhost(1));
    ctrl.advancePhase();
    expect(ctrl.getState().gold).toBe(11);
    // Round 3 win → +1g → 12g. advance → round 4, +5g → 17g.
    ctrl.startCombat(emptyGhost(1));
    ctrl.advancePhase();
    expect(ctrl.getState().currentRound).toBe(4);
    expect(ctrl.getState().gold).toBe(17);
  });

  it('Marauder + Conqueror\'s Crown win bonus: ruleset.winBonusGold + class.bonusGoldOnWin (2) + relic.bonusGoldOnWin', () => {
    // We don't equip Conqueror's Crown (boss-tier) in this test; verify just
    // Marauder's class passive contribution. winBonus = 1 (ruleset) + 2 (class) = 3.
    const knife = defineTestItem('test-knife', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], { tags: ['weapon'] });
    const items = { [knife.id]: knife };
    const ctrl = createRun(baseInput({
      classId: MARAUDER,
      startingRelicId: RAZORS_EDGE,
      itemsRegistry: items,
    }));
    ctrl.buyItem(0);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    const goldBefore = ctrl.getState().gold;
    ctrl.startCombat(emptyGhost(1));
    expect(ctrl.getState().gold).toBe(goldBefore + 3); // +3g win bonus
  });
});

// ─── Hearts & elimination ─────────────────────────────────────────

describe('hearts & elimination', () => {
  it('ghost_win decrements hearts by 1', () => {
    // Player has nothing; ghost wins via tick-cap-draw which counts as loss.
    // Actually let's give ghost a knife so player loses cleanly.
    const ctrl = createRun(baseInput());
    const heartsBefore = ctrl.getState().hearts;
    const burstGhost: Combatant = {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          {
            placementId: PlacementId('g1'),
            itemId: ItemId('throwing-knife'),
            anchor: { col: 0, row: 0 },
            rotation: 0,
          },
        ],
      },
      relics: NO_RELICS,
      classId: TINKER,
      startingHp: 100,
    };
    ctrl.startCombat(burstGhost);
    expect(ctrl.getState().hearts).toBe(heartsBefore - 1);
  });

  it('hearts → 0 produces outcome \"eliminated\"', () => {
    const ctrl = createRun(baseInput());
    for (let i = 0; i < 3; i++) {
      const burstGhost: Combatant = {
        bag: {
          dimensions: { width: 6, height: 4 },
          placements: [
            {
              placementId: PlacementId(`g${i}`),
              itemId: ItemId('throwing-knife'),
              anchor: { col: 0, row: 0 },
              rotation: 0,
            },
          ],
        },
        relics: NO_RELICS,
        classId: TINKER,
        startingHp: 100,
      };
      ctrl.startCombat(burstGhost);
      ctrl.advancePhase();
    }
    expect(ctrl.getState().outcome).toBe('eliminated');
    expect(ctrl.getState().hearts).toBe(0);
  });
});

// ─── Telemetry callback ──────────────────────────────────────────

describe('telemetry callback', () => {
  it('createRun emits run_start + round_start (round 1)', () => {
    const events: TelemetryEvent[] = [];
    createRun(baseInput({ onTelemetryEvent: (e) => events.push(e) }));
    expect(events.find((e) => e.name === 'run_start')).toBeDefined();
    expect(events.find((e) => e.name === 'round_start' && e.round === 1)).toBeDefined();
  });

  it('buyItem records shop_purchase with correct itemId / cost / round', () => {
    const events: TelemetryEvent[] = [];
    const ctrl = createRun(baseInput({ onTelemetryEvent: (e) => events.push(e) }));
    const itemId = ctrl.getState().shop.slots[0]!;
    ctrl.buyItem(0);
    const purchase = events.find((e) => e.name === 'shop_purchase');
    expect(purchase).toBeDefined();
    if (purchase?.name === 'shop_purchase') {
      expect(purchase.itemId).toBe(itemId);
      expect(purchase.cost).toBe(3);
      expect(purchase.round).toBe(1);
    }
  });

  it('rerollShop records shop_reroll with correct cost / rerollIndex', () => {
    const events: TelemetryEvent[] = [];
    const ctrl = createRun(baseInput({ startingRelicId: APPRENTICES_LOOP, onTelemetryEvent: (e) => events.push(e) }));
    ctrl.rerollShop(); // first: free with Loop
    ctrl.rerollShop(); // second: 1g
    const rerolls = events.filter((e) => e.name === 'shop_reroll');
    expect(rerolls).toHaveLength(2);
    if (rerolls[0]?.name === 'shop_reroll' && rerolls[1]?.name === 'shop_reroll') {
      expect(rerolls[0].cost).toBe(0);
      expect(rerolls[0].rerollIndex).toBe(0);
      expect(rerolls[1].cost).toBe(1);
      expect(rerolls[1].rerollIndex).toBe(1);
    }
  });

  it('combineRecipe emits recipe_completed', () => {
    const events: TelemetryEvent[] = [];
    const items = {
      [ItemId('iron-sword')]: cheapItem('iron-sword'),
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
      [ItemId('steel-sword')]: ITEMS[ItemId('steel-sword')]!,
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items, seed: SimSeed(7), onTelemetryEvent: (e) => events.push(e) }));
    const slots = ctrl.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    ctrl.buyItem(swordSlot);
    ctrl.buyItem(daggerSlot);
    ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0);
    ctrl.placeItem(ItemId('iron-dagger'), { col: 1, row: 0 }, 0);
    ctrl.combineRecipe(RecipeId('r-steel-sword'));
    const recipeEvent = events.find((e) => e.name === 'recipe_completed');
    expect(recipeEvent).toBeDefined();
  });
});

// ─── RunState JSON round-trip ────────────────────────────────────

describe('run state serialization', () => {
  it('getState() round-trips through JSON.stringify / JSON.parse', () => {
    const ctrl = createRun(baseInput());
    ctrl.buyItem(0);
    const itemId = ctrl.getState().shop.slots[0]!;
    ctrl.placeItem(itemId, { col: 0, row: 0 }, 0);
    const before = ctrl.getState();
    const after = JSON.parse(JSON.stringify(before));
    expect(after).toEqual(before);
  });
});

// ─── replayCombat() iterator ─────────────────────────────────────

describe('replayCombat', () => {
  it('yields the same events as simulateCombat would produce', async () => {
    const { replayCombat } = await import('../src/run');
    const player: Combatant = {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          {
            placementId: PlacementId('p1'),
            itemId: ItemId('iron-sword'),
            anchor: { col: 0, row: 0 },
            rotation: 0,
          },
        ],
      },
      relics: NO_RELICS,
      classId: TINKER,
      startingHp: 30,
    };
    const ghost = emptyGhost(30);
    const input = { seed: SimSeed(1), player, ghost };
    const direct = simulateCombat(input).events;
    const replayed = [...replayCombat(input)];
    expect(replayed).toEqual(direct);
  });
});

// ─── Boss round (FORGE_TYRANT) ───────────────────────────────────

describe('boss round', () => {
  it('FORGE_TYRANT pre-built ghost (50 HP, post-mutator) plays as round 11 opponent', () => {
    // Drive controller to round 11 with a sustainable bag.
    const knife = defineTestItem('test-knife', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 100, target: 'opponent' }] },
    ], { tags: ['weapon'] });
    const items = { [knife.id]: knife };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    // Win 10 rounds.
    for (let r = 1; r <= 10; r++) {
      ctrl.startCombat(emptyGhost(1));
      ctrl.advancePhase();
    }
    expect(ctrl.getState().currentRound).toBe(11);
    // Round 11 — boss with hpOverride=50 from contracts.ts forge-tyrant-boss.
    // Caller pre-builds the ghost: HP 50 + caller-applied damageBonus / lifesteal.
    const boss: Combatant = {
      bag: { dimensions: { width: 6, height: 4 }, placements: [] }, // simplified bag
      relics: NO_RELICS,
      classId: MARAUDER,
      startingHp: 50,
    };
    ctrl.startCombat(boss); // 100 dmg knife > 50 hp → player_win
    ctrl.advancePhase();
    expect(ctrl.getState().outcome).toBe('won');
  });
});

// ─── Daily contract path ────────────────────────────────────────

describe('daily contract telemetry', () => {
  it('createRun with daily contract emits daily_contract_started', () => {
    const events: TelemetryEvent[] = [];
    createRun(baseInput({
      contractId: ContractId('daily-placeholder'),
      onTelemetryEvent: (e) => events.push(e),
    }));
    expect(events.find((e) => e.name === 'daily_contract_started')).toBeDefined();
  });

  it('eliminating a daily run emits daily_contract_completed', () => {
    const events: TelemetryEvent[] = [];
    const ctrl = createRun(baseInput({
      contractId: ContractId('daily-placeholder'),
      onTelemetryEvent: (e) => events.push(e),
    }));
    for (let i = 0; i < 3; i++) {
      ctrl.startCombat(emptyGhost(200));
      ctrl.advancePhase();
    }
    expect(events.find((e) => e.name === 'daily_contract_completed')).toBeDefined();
  });
});

// ─── Error paths ────────────────────────────────────────────────

describe('error paths', () => {
  it('sellItem with unknown placementId throws', () => {
    const ctrl = createRun(baseInput());
    expect(() => ctrl.sellItem(PlacementId('nonexistent'))).toThrow(/not in bag/);
  });

  it('moveItem with unknown placementId throws', () => {
    const ctrl = createRun(baseInput());
    expect(() =>
      ctrl.moveItem(PlacementId('nonexistent'), { col: 0, row: 0 }, 0),
    ).toThrow(/not in bag/);
  });

  it('rotateItem with unknown placementId throws', () => {
    const ctrl = createRun(baseInput());
    expect(() => ctrl.rotateItem(PlacementId('nonexistent'), 90)).toThrow(/not in bag/);
  });

  it('placeItem with itemId not in pendingItems throws', () => {
    const ctrl = createRun(baseInput());
    expect(() =>
      ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 0),
    ).toThrow(/not in pending inventory/);
  });

  it('buyItem with out-of-range slotIndex throws', () => {
    const ctrl = createRun(baseInput());
    expect(() => ctrl.buyItem(99)).toThrow(/out of range/);
    expect(() => ctrl.buyItem(-1)).toThrow(/out of range/);
  });

  it('buyItem on already-purchased slot throws', () => {
    const ctrl = createRun(baseInput());
    ctrl.buyItem(0);
    expect(() => ctrl.buyItem(0)).toThrow(/already purchased/);
  });

  it('buyItem without enough gold throws', () => {
    const ctrl = createRun(baseInput());
    // Buy 1 → 1g remaining. Common is 3g; second buy fails.
    ctrl.buyItem(0);
    expect(() => ctrl.buyItem(1)).toThrow(/insufficient gold/);
  });

  it('combineRecipe with no match throws', () => {
    const ctrl = createRun(baseInput());
    expect(() => ctrl.combineRecipe(RecipeId('r-steel-sword'))).toThrow(/no match/);
  });

  it('createRun with unknown contractId throws', () => {
    expect(() =>
      createRun(baseInput({ contractId: ContractId('does-not-exist') })),
    ).toThrow(/Unknown contractId/);
  });

  it('createRun with unknown startingRelicId throws', () => {
    expect(() =>
      createRun(baseInput({ startingRelicId: RelicId('does-not-exist') })),
    ).toThrow(/Unknown startingRelicId/);
  });
});

// ─── moveItem / rotateItem / sellItem ────────────────────────────

describe('bag operations', () => {
  it('moveItem repositions an existing placement', () => {
    const ctrl = createRun(baseInput());
    ctrl.buyItem(0);
    const itemId = ctrl.getState().shop.slots[0]!;
    const pid = ctrl.placeItem(itemId, { col: 0, row: 0 }, 0);
    ctrl.moveItem(pid, { col: 2, row: 1 }, 0);
    const p = ctrl.getState().bag.placements.find((x) => x.placementId === pid);
    expect(p?.anchor).toEqual({ col: 2, row: 1 });
  });

  it('rotateItem updates rotation in place', () => {
    const ctrl = createRun(baseInput());
    // Find a 1×2V item in shop (Iron Sword, Wooden Club, etc.). Round 1 is Common-only.
    const swordSlot = ctrl.getState().shop.slots.findIndex(
      (s) => ITEMS[s]!.shape.length === 2,
    );
    if (swordSlot < 0) {
      // Bag rotation only meaningful for non-1x1 shapes; skip if none in shop.
      return;
    }
    const itemId = ctrl.getState().shop.slots[swordSlot]!;
    ctrl.buyItem(swordSlot);
    const pid = ctrl.placeItem(itemId, { col: 0, row: 0 }, 0);
    ctrl.rotateItem(pid, 90);
    const p = ctrl.getState().bag.placements.find((x) => x.placementId === pid);
    expect(p?.rotation).toBe(90);
  });

  it('placeItem rejects out-of-bounds anchors', () => {
    const ctrl = createRun(baseInput());
    ctrl.buyItem(0);
    const itemId = ctrl.getState().shop.slots[0]!;
    expect(() => ctrl.placeItem(itemId, { col: 99, row: 99 }, 0)).toThrow(/invalid placement/);
  });

  it('placeItem rejects overlap with existing placement', () => {
    // Two 1×1 items that we buy + place. Round 1: Common only.
    const items = {
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    ctrl.buyItem(1);
    ctrl.placeItem(ItemId('iron-dagger'), { col: 0, row: 0 }, 0);
    expect(() =>
      ctrl.placeItem(ItemId('iron-dagger'), { col: 0, row: 0 }, 0),
    ).toThrow(/invalid placement/);
  });

  it('placeItem rejects row-axis out-of-bounds anchors', () => {
    // Existing OOB test covers col-axis (col=99). This trips the row-axis
    // branch by anchoring at row=4 in a 6×4 bag.
    const ctrl = createRun(baseInput());
    ctrl.buyItem(0);
    const itemId = ctrl.getState().shop.slots[0]!;
    expect(() => ctrl.placeItem(itemId, { col: 0, row: 4 }, 0)).toThrow(/invalid placement/);
  });

  it('moveItem to overlap with another placement throws', () => {
    const items = { [ItemId('iron-dagger')]: cheapItem('iron-dagger') };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    ctrl.buyItem(1);
    const pid1 = ctrl.placeItem(ItemId('iron-dagger'), { col: 0, row: 0 }, 0);
    ctrl.placeItem(ItemId('iron-dagger'), { col: 1, row: 0 }, 0);
    expect(() => ctrl.moveItem(pid1, { col: 1, row: 0 }, 0)).toThrow(/invalid placement/);
  });

  it('rotateItem to a rotation that goes off-grid throws', () => {
    const items = { [ItemId('iron-sword')]: cheapItem('iron-sword') };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    // 1×2V at (col=5, row=0): cells (5,0), (5,1) — within 6×4 bag. Rotated 90 →
    // 2×1H at same anchor: cells (5,0), (6,0). col=6 ≥ w=6 → off-grid.
    const swordPid = ctrl.placeItem(ItemId('iron-sword'), { col: 5, row: 0 }, 0);
    expect(() => ctrl.rotateItem(swordPid, 90)).toThrow(/invalid layout/);
  });
});

// ─── passiveStats + status_tick damage stats ──────────────────────

describe('passiveStats.maxHpBonus', () => {
  it('Buckler (+5 maxHpBonus) raises player startingHp from 30 to 35', () => {
    // 30-damage ghost vs player with Buckler: damage event reports remainingHp=5,
    // proving startingHp was 35. Without Buckler the player would die at 0 HP.
    const ghostBomb = defineTestItem(
      'test-30dmg',
      [{ type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] }],
      { tags: ['weapon'], rarity: 'legendary' }, // legendary keeps it out of round 1 shop pool
    );
    const items = {
      [ItemId('buckler')]: ITEMS[ItemId('buckler')]!,
      [ghostBomb.id]: ghostBomb,
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0); // Round 1 Common-only → only Buckler in pool.
    ctrl.placeItem(ItemId('buckler'), { col: 0, row: 0 }, 0);
    const ghost: Combatant = {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          { placementId: PlacementId('g1'), itemId: ghostBomb.id, anchor: { col: 0, row: 0 }, rotation: 0 },
        ],
      },
      relics: NO_RELICS,
      classId: TINKER,
      startingHp: 100,
    };
    const result = ctrl.startCombat(ghost);
    const playerDmg = result.events.find((e) => e.type === 'damage' && e.target === 'player');
    expect(playerDmg).toBeDefined();
    if (playerDmg?.type === 'damage') {
      expect(playerDmg.amount).toBe(30);
      expect(playerDmg.remainingHp).toBe(5);
    }
  });
});

// ─── combineRecipe fit validation (M1.2.5) ─────────────────────────

describe('combineRecipe fit validation', () => {
  it('throws when output cannot fit at the inputs anchor; bag is unchanged', () => {
    // Custom recipe: tiny-a + tiny-b -> 2x2 legendary output. Inputs at (0,0)
    // and (1,0); blocker at (0,1) means the 2x2 output cannot place (any
    // rotation of a 2x2 is the same 2x2 footprint). combineRecipe must throw
    // before any state mutation.
    const tinyA = defineTestItem('tiny-a', [], { tags: ['weapon'], cost: 1 });
    const tinyB = defineTestItem('tiny-b', [], { tags: ['weapon'], cost: 1 });
    const blocker = defineTestItem('blocker', [], { tags: ['armor'], cost: 1 });
    const big = defineTestItem('big-2x2', [], {
      rarity: 'legendary',
      tags: ['weapon'],
      shape: [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 0, row: 1 },
        { col: 1, row: 1 },
      ],
    });
    const customRecipe: Recipe = {
      id: RecipeId('r-test-big'),
      name: 'Test Big',
      inputs: [
        { itemId: tinyA.id, relativeCol: 0, relativeRow: 0 },
        { itemId: tinyB.id, relativeCol: 1, relativeRow: 0 },
      ],
      output: big.id,
      rotationLocked: false,
    };
    const items = {
      [tinyA.id]: tinyA,
      [tinyB.id]: tinyB,
      [blocker.id]: blocker,
      [big.id]: big,
    };
    const ctrl = createRun(
      baseInput({ itemsRegistry: items, recipesRegistry: [customRecipe], seed: SimSeed(7) }),
    );
    const slots = ctrl.getState().shop.slots;
    const slotA = slots.findIndex((s) => s === tinyA.id);
    const slotB = slots.findIndex((s) => s === tinyB.id);
    const slotBlock = slots.findIndex((s) => s === blocker.id);
    expect(slotA).toBeGreaterThanOrEqual(0);
    expect(slotB).toBeGreaterThanOrEqual(0);
    expect(slotBlock).toBeGreaterThanOrEqual(0);
    expect(new Set([slotA, slotB, slotBlock]).size).toBe(3);
    ctrl.buyItem(slotA);
    ctrl.placeItem(tinyA.id, { col: 0, row: 0 }, 0);
    ctrl.buyItem(slotB);
    ctrl.placeItem(tinyB.id, { col: 1, row: 0 }, 0);
    ctrl.buyItem(slotBlock);
    ctrl.placeItem(blocker.id, { col: 0, row: 1 }, 0);

    const matches = ctrl.detectRecipes();
    expect(matches).toHaveLength(1);
    expect(matches[0]!.recipeId).toBe(RecipeId('r-test-big'));
    expect(ctrl.findCombineRotation(matches[0]!)).toBeNull();

    const placementsBefore = ctrl.getState().bag.placements.slice();
    expect(() => ctrl.combineRecipe(RecipeId('r-test-big'))).toThrow(/no rotation fits/);
    expect(ctrl.getState().bag.placements).toEqual(placementsBefore);
  });

  it('findCombineRotation returns the first fitting rotation; combineRecipe uses it', () => {
    // Iron Sword (1×2V) rotated 90 → cells (0,0),(1,0). Iron Dagger 1×1 at (2,0).
    // Inputs are edge-adjacent → r-steel-sword matches. Min anchor = (0,0).
    // Steel Sword 1×2V output:
    //   rotation 0   → cells (0,0),(0,1) — collides with blocker at (0,1).
    //   rotation 90  → cells (0,0),(1,0) — both freed input cells. Fits.
    const blocker = defineTestItem('blocker', [], { tags: ['armor'], cost: 1 });
    const items = {
      [ItemId('iron-sword')]: cheapItem('iron-sword'),
      [ItemId('iron-dagger')]: cheapItem('iron-dagger'),
      [ItemId('steel-sword')]: ITEMS[ItemId('steel-sword')]!,
      [blocker.id]: blocker,
    };
    const ctrl = createRun(baseInput({ itemsRegistry: items, seed: SimSeed(7) }));
    const slots = ctrl.getState().shop.slots;
    const swordSlot = slots.findIndex((s) => s === 'iron-sword');
    const daggerSlot = slots.findIndex((s) => s === 'iron-dagger');
    const blockerSlot = slots.findIndex((s) => s === blocker.id);
    expect(swordSlot).toBeGreaterThanOrEqual(0);
    expect(daggerSlot).toBeGreaterThanOrEqual(0);
    expect(blockerSlot).toBeGreaterThanOrEqual(0);
    expect(new Set([swordSlot, daggerSlot, blockerSlot]).size).toBe(3);
    ctrl.buyItem(swordSlot);
    ctrl.placeItem(ItemId('iron-sword'), { col: 0, row: 0 }, 90);
    ctrl.buyItem(daggerSlot);
    ctrl.placeItem(ItemId('iron-dagger'), { col: 2, row: 0 }, 0);
    ctrl.buyItem(blockerSlot);
    ctrl.placeItem(blocker.id, { col: 0, row: 1 }, 0);

    const matches = ctrl.detectRecipes();
    expect(matches).toHaveLength(1);
    const fit = ctrl.findCombineRotation(matches[0]!);
    expect(fit).not.toBeNull();
    expect(fit!.rotation).toBe(90);
    expect(fit!.anchor).toEqual({ col: 0, row: 0 });
    ctrl.combineRecipe(matches[0]!.recipeId);
    const sword = ctrl.getState().bag.placements.find((p) => p.itemId === 'steel-sword');
    expect(sword).toBeDefined();
    expect(sword!.rotation).toBe(90);
    expect(sword!.anchor).toEqual({ col: 0, row: 0 });
  });
});

// ─── startCombatFromGhostBuild + boss_only mutator ──────────────────

describe('startCombatFromGhostBuild + boss_only mutator', () => {
  function makeGhostBuild(slug: string, overrides: Partial<GhostBuild> = {}): GhostBuild {
    return {
      id: GhostId(slug),
      classId: TINKER,
      bag: { dimensions: { width: 6, height: 4 }, placements: [] },
      relics: NO_RELICS,
      recordedRound: 1,
      trophyAtRecord: 0,
      seed: SimSeed(1),
      submittedAt: IsoTimestamp('2025-01-01T00:00:00.000Z'),
      source: 'bot',
      ...overrides,
    };
  }

  it('neutral contract: derives ghost startingHp from passiveStats; no mutator effects', () => {
    // Ghost bag has Buckler (passiveStats.maxHpBonus: 5) → ghost startingHp = 30 + 5 = 35.
    // Player's 35-dmg knife one-shots; remainingHp = 0.
    const knife = defineTestItem(
      'test-knife',
      [{ type: 'on_round_start', effects: [{ type: 'damage', amount: 35, target: 'opponent' }] }],
      { tags: ['weapon'] },
    );
    const items = { [knife.id]: knife, [ItemId('buckler')]: ITEMS[ItemId('buckler')]! };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    const slots = ctrl.getState().shop.slots;
    const knifeSlot = slots.findIndex((s) => s === knife.id);
    expect(knifeSlot).toBeGreaterThanOrEqual(0);
    ctrl.buyItem(knifeSlot);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    const ghost = makeGhostBuild('buckler-ghost', {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          { placementId: PlacementId('g1'), itemId: ItemId('buckler'), anchor: { col: 0, row: 0 }, rotation: 0 },
        ],
      },
    });
    const result = ctrl.startCombatFromGhostBuild(ghost);
    const dmg = result.events.find((e) => e.type === 'damage' && e.target === 'ghost');
    expect(dmg?.type === 'damage' && dmg.amount).toBe(35);
    expect(dmg?.type === 'damage' && dmg.remainingHp).toBe(0);
  });

  it('forge-tyrant-boss contract: hpOverride: 50 REPLACES ghost startingHp', () => {
    // Ghost bag has Buckler (passiveStats: 5) — would normally yield startingHp=35.
    // hpOverride: 50 replaces it. 35-dmg knife leaves ghost at 50 - 35 = 15.
    const knife = defineTestItem(
      'test-knife',
      [{ type: 'on_round_start', effects: [{ type: 'damage', amount: 35, target: 'opponent' }] }],
      { tags: ['weapon'] },
    );
    const items = { [knife.id]: knife, [ItemId('buckler')]: ITEMS[ItemId('buckler')]! };
    const ctrl = createRun(
      baseInput({
        itemsRegistry: items,
        contractId: ContractId('forge-tyrant-boss'),
      }),
    );
    const slots = ctrl.getState().shop.slots;
    const ks = slots.findIndex((s) => s === knife.id);
    ctrl.buyItem(ks);
    ctrl.placeItem(knife.id, { col: 0, row: 0 }, 0);
    const ghost = makeGhostBuild('buckler-ghost', {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          { placementId: PlacementId('g1'), itemId: ItemId('buckler'), anchor: { col: 0, row: 0 }, rotation: 0 },
        ],
      },
    });
    const result = ctrl.startCombatFromGhostBuild(ghost);
    const dmg = result.events.find((e) => e.type === 'damage' && e.target === 'ghost');
    expect(dmg?.type === 'damage' && dmg.amount).toBe(35);
    expect(dmg?.type === 'damage' && dmg.remainingHp).toBe(15); // 50 - 35 = 15
  });

  it('forge-tyrant-boss contract: damageBonus: 2 adds to ghost damage events', () => {
    // Ghost has a 5-dmg knife; player has nothing. Ghost-side damage event amount
    // = 5 + 2 (damageBonus) = 7. (Ghost's classId TINKER has bonusBaseDamage 0,
    // no relics, so the +2 comes purely from the boss_only mutator.)
    const ghostKnife = defineTestItem(
      'test-ghost-knife',
      [{ type: 'on_round_start', effects: [{ type: 'damage', amount: 5, target: 'opponent' }] }],
      { tags: ['weapon'] },
    );
    const items = { [ghostKnife.id]: ghostKnife };
    const ctrl = createRun(
      baseInput({ itemsRegistry: items, contractId: ContractId('forge-tyrant-boss') }),
    );
    const ghost = makeGhostBuild('boss-knifer', {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          { placementId: PlacementId('g1'), itemId: ghostKnife.id, anchor: { col: 0, row: 0 }, rotation: 0 },
        ],
      },
    });
    const result = ctrl.startCombatFromGhostBuild(ghost);
    const playerDmg = result.events.find((e) => e.type === 'damage' && e.target === 'player');
    expect(playerDmg?.type === 'damage' && playerDmg.amount).toBe(7);
  });

  it('forge-tyrant-boss contract: lifestealPctBonus: 15 produces ghost-side heal events on damage', () => {
    // Player and ghost each have a damaging weapon. Both fire on_round_start.
    // Player damages ghost first → ghost is below startingHp → ghost's damage
    // event triggers a lifesteal heal that lands (actualGain > 0). Without the
    // boss mutator there's no ghost-side lifestealPct, so no heal event.
    const playerKnife = defineTestItem(
      'test-player-knife',
      [{ type: 'on_round_start', effects: [{ type: 'damage', amount: 5, target: 'opponent' }] }],
      { tags: ['weapon'], name: 'p-knife' },
    );
    const ghostKnife = defineTestItem(
      'test-ghost-knife-10',
      [{ type: 'on_round_start', effects: [{ type: 'damage', amount: 10, target: 'opponent' }] }],
      { tags: ['weapon'], name: 'g-knife' },
    );
    const items = { [playerKnife.id]: playerKnife, [ghostKnife.id]: ghostKnife };
    const ctrl = createRun(
      baseInput({ itemsRegistry: items, contractId: ContractId('forge-tyrant-boss') }),
    );
    const slots = ctrl.getState().shop.slots;
    const ks = slots.findIndex((s) => s === playerKnife.id);
    expect(ks).toBeGreaterThanOrEqual(0);
    ctrl.buyItem(ks);
    ctrl.placeItem(playerKnife.id, { col: 0, row: 0 }, 0);
    const ghost = makeGhostBuild('boss-vampire', {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          { placementId: PlacementId('g1'), itemId: ghostKnife.id, anchor: { col: 0, row: 0 }, rotation: 0 },
        ],
      },
    });
    const result = ctrl.startCombatFromGhostBuild(ghost);
    const lifestealHeal = result.events.find(
      (e) => e.type === 'heal' && e.target === 'ghost',
    );
    expect(lifestealHeal).toBeDefined();
  });

  it('FORGE_TYRANT integration: ghostHp = 50 via boss_only.hpOverride (neutral comparison: 67)', () => {
    // Two runs against FORGE_TYRANT to isolate the mutator path:
    //   neutral contract  → ghostHp = 30 + chainmail(12) + bloodmoon-plate(25) = 67.
    //   forge-tyrant-boss → ghostHp = 50 (mutator REPLACES the computed 67).
    const ctrlNeutral = createRun(baseInput());
    const neutralResult = ctrlNeutral.startCombatFromGhostBuild(FORGE_TYRANT);
    const neutralStart = neutralResult.events.find((e) => e.type === 'combat_start');
    expect(neutralStart?.type === 'combat_start' && neutralStart.ghostHp).toBe(67);

    const ctrlBoss = createRun(baseInput({ contractId: ContractId('forge-tyrant-boss') }));
    const bossResult = ctrlBoss.startCombatFromGhostBuild(FORGE_TYRANT);
    const bossStart = bossResult.events.find((e) => e.type === 'combat_start');
    expect(bossStart?.type === 'combat_start' && bossStart.ghostHp).toBe(50);
  });
});

describe('status_tick damage stats', () => {
  it('player-applied burn produces status_tick events that count toward damageDealt', () => {
    // Player applies burn to ghost → ghost takes status_tick damage on cleanup
    // ticks. computeDamageStats sums status_tick.damage where target='ghost'.
    const burner = defineTestItem(
      'test-burner',
      [{ type: 'on_round_start', effects: [{ type: 'apply_status', status: 'burn', stacks: 5, target: 'opponent' }] }],
      { tags: ['weapon'] },
    );
    const items = { [burner.id]: burner };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    ctrl.buyItem(0);
    ctrl.placeItem(burner.id, { col: 0, row: 0 }, 0);
    ctrl.startCombat(emptyGhost(100));
    const entry = ctrl.getState().history[0]!;
    expect(entry.damageDealt).toBeGreaterThan(0);
  });

  it('ghost-applied burn produces status_tick events that count toward damageTaken', () => {
    // Ghost applies burn to player → player takes status_tick damage on cleanup
    // ticks. computeDamageStats sums status_tick.damage where target='player'.
    const burner = defineTestItem(
      'test-burner',
      [{ type: 'on_round_start', effects: [{ type: 'apply_status', status: 'burn', stacks: 5, target: 'opponent' }] }],
      { tags: ['weapon'] },
    );
    const items = { [burner.id]: burner };
    const ctrl = createRun(baseInput({ itemsRegistry: items }));
    const ghost: Combatant = {
      bag: {
        dimensions: { width: 6, height: 4 },
        placements: [
          { placementId: PlacementId('g1'), itemId: burner.id, anchor: { col: 0, row: 0 }, rotation: 0 },
        ],
      },
      relics: NO_RELICS,
      classId: TINKER,
      startingHp: 100,
    };
    ctrl.startCombat(ghost);
    const entry = ctrl.getState().history[0]!;
    expect(entry.damageTaken).toBeGreaterThan(0);
  });
});
