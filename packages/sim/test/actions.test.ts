// actions.test.ts — unit tests for the M1.2.5 action-stream dispatcher.
// Verifies applyAction routes every RunControllerAction variant to the
// correct controller method.

import { describe, expect, it } from 'vitest';
import {
  ClassId,
  ContractId,
  GhostId,
  IsoTimestamp,
  ItemId,
  PlacementId,
  RecipeId,
  RelicId,
  SimSeed,
  type Combatant,
  type GhostBuild,
} from '@packbreaker/content';
import {
  applyAction,
  createRun,
  type RunControllerAction,
} from '../src/run';

const TINKER = ClassId('tinker');
const NEUTRAL = ContractId('neutral');
const APPRENTICES_LOOP = RelicId('apprentices-loop');
const NO_RELICS = { starter: null, mid: null, boss: null };

function makeGhost(): Combatant {
  return {
    bag: { dimensions: { width: 6, height: 4 }, placements: [] },
    relics: NO_RELICS,
    classId: TINKER,
    startingHp: 30,
  };
}

function makeGhostBuild(): GhostBuild {
  return {
    id: GhostId('test-ghost'),
    classId: TINKER,
    bag: { dimensions: { width: 6, height: 4 }, placements: [] },
    relics: NO_RELICS,
    recordedRound: 1,
    trophyAtRecord: 0,
    seed: SimSeed(1),
    submittedAt: IsoTimestamp('2025-01-01T00:00:00.000Z'),
    source: 'bot',
  };
}

function freshController() {
  return createRun({
    seed: SimSeed(1),
    classId: TINKER,
    contractId: NEUTRAL,
    startingRelicId: APPRENTICES_LOOP,
  });
}

describe('applyAction', () => {
  it("'create_run' throws — handled by the harness, not the dispatcher", () => {
    const ctrl = freshController();
    const action: RunControllerAction = {
      type: 'create_run',
      seed: SimSeed(1),
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    };
    expect(() => applyAction(ctrl, action)).toThrow(/create_run/);
  });

  it("'buy_item' invokes RunController.buyItem(slotIndex)", () => {
    const ctrl = freshController();
    const goldBefore = ctrl.getState().gold;
    applyAction(ctrl, { type: 'buy_item', slotIndex: 0 });
    expect(ctrl.getState().gold).toBe(goldBefore - 3); // common = 3g
  });

  it("'reroll_shop' invokes RunController.rerollShop()", () => {
    const ctrl = freshController();
    const before = ctrl.getState().shop.rerollsThisRound;
    applyAction(ctrl, { type: 'reroll_shop' });
    expect(ctrl.getState().shop.rerollsThisRound).toBe(before + 1);
  });

  it("'place_item' invokes RunController.placeItem(itemId, anchor, rotation)", () => {
    const ctrl = freshController();
    applyAction(ctrl, { type: 'buy_item', slotIndex: 0 });
    const itemId = ctrl.getState().shop.slots[0]!;
    applyAction(ctrl, {
      type: 'place_item',
      itemId,
      anchor: { col: 0, row: 0 },
      rotation: 0,
    });
    expect(ctrl.getState().bag.placements).toHaveLength(1);
  });

  it("'sell_item' / 'move_item' / 'rotate_item' route correctly", () => {
    const ctrl = freshController();
    applyAction(ctrl, { type: 'buy_item', slotIndex: 0 });
    const itemId = ctrl.getState().shop.slots[0]!;
    applyAction(ctrl, {
      type: 'place_item',
      itemId,
      anchor: { col: 0, row: 0 },
      rotation: 0,
    });
    const pid = ctrl.getState().bag.placements[0]!.placementId;
    applyAction(ctrl, {
      type: 'move_item',
      placementId: pid,
      anchor: { col: 2, row: 1 },
      rotation: 0,
    });
    expect(ctrl.getState().bag.placements[0]!.anchor).toEqual({ col: 2, row: 1 });
    applyAction(ctrl, { type: 'rotate_item', placementId: pid, rotation: 90 });
    expect(ctrl.getState().bag.placements[0]!.rotation).toBe(90);
    applyAction(ctrl, { type: 'sell_item', placementId: pid });
    expect(ctrl.getState().bag.placements).toHaveLength(0);
  });

  it("'combine_recipe' propagates 'no match' from controller (pure dispatch, no validation)", () => {
    const ctrl = freshController();
    expect(() =>
      applyAction(ctrl, { type: 'combine_recipe', recipeId: RecipeId('r-steel-sword') }),
    ).toThrow(/no match/);
  });

  it("'start_combat' invokes startCombat(ghost: Combatant)", () => {
    const ctrl = freshController();
    applyAction(ctrl, { type: 'start_combat', ghost: makeGhost() });
    expect(ctrl.getPhase()).toBe('resolution');
  });

  it("'start_combat_from_ghost_build' invokes startCombatFromGhostBuild(ghost: GhostBuild)", () => {
    const ctrl = freshController();
    applyAction(ctrl, {
      type: 'start_combat_from_ghost_build',
      ghost: makeGhostBuild(),
    });
    expect(ctrl.getPhase()).toBe('resolution');
  });

  it("'advance_phase' invokes advancePhase()", () => {
    const ctrl = freshController();
    applyAction(ctrl, { type: 'start_combat', ghost: makeGhost() });
    applyAction(ctrl, { type: 'advance_phase' });
    expect(ctrl.getState().currentRound).toBe(2);
  });

  it('action JSON round-trips: JSON.parse(JSON.stringify(action)) replays identically', () => {
    const action: RunControllerAction = {
      type: 'place_item',
      itemId: ItemId('iron-sword'),
      anchor: { col: 1, row: 2 },
      rotation: 90,
    };
    const roundtripped = JSON.parse(JSON.stringify(action)) as RunControllerAction;
    expect(roundtripped).toEqual(action);
  });

  it('placementId / itemId branded types round-trip through JSON intact', () => {
    const pid = PlacementId('p-0');
    const action: RunControllerAction = {
      type: 'sell_item',
      placementId: pid,
    };
    const roundtripped = JSON.parse(JSON.stringify(action)) as RunControllerAction;
    if (roundtripped.type === 'sell_item') {
      expect(String(roundtripped.placementId)).toBe('p-0');
    }
  });
});
