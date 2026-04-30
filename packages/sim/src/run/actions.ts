// actions.ts — discriminated-union action stream for the M1.2.5 determinism
// suite. Each variant maps 1:1 to a state-mutating method on `RunController`,
// plus a `'create_run'` variant that carries the createRun config (the
// constructor isn't a method, so applyAction throws on it — the harness
// builds the controller from the create_run header before dispatching the
// rest of the stream).
//
// Round-trip JSON safety: every field is a primitive, branded primitive, or
// nested object of primitives. No Date / Map / Set / undefined fields. The
// determinism harness re-parses fixtures as JSON and replays the stream
// against a fresh RunController seeded with the create_run config.

import type {
  CellCoord,
  ClassId,
  Combatant,
  ContractId,
  GhostBuild,
  IsoTimestamp,
  ItemId,
  PlacementId,
  RecipeId,
  RelicId,
  Rotation,
  SimSeed,
} from '@packbreaker/content';
import type { RunController } from './state';

export type RunControllerAction =
  | {
      readonly type: 'create_run';
      readonly seed: SimSeed;
      readonly classId: ClassId;
      readonly contractId: ContractId;
      readonly startingRelicId: RelicId;
      readonly startedAt?: IsoTimestamp;
    }
  | { readonly type: 'buy_item'; readonly slotIndex: number }
  | { readonly type: 'sell_item'; readonly placementId: PlacementId }
  | {
      readonly type: 'place_item';
      readonly itemId: ItemId;
      readonly anchor: CellCoord;
      readonly rotation: Rotation;
    }
  | {
      readonly type: 'move_item';
      readonly placementId: PlacementId;
      readonly anchor: CellCoord;
      readonly rotation: Rotation;
    }
  | {
      readonly type: 'rotate_item';
      readonly placementId: PlacementId;
      readonly rotation: Rotation;
    }
  | { readonly type: 'reroll_shop' }
  | { readonly type: 'combine_recipe'; readonly recipeId: RecipeId }
  | {
      readonly type: 'grant_relic';
      readonly slot: 'mid' | 'boss';
      readonly relicId: RelicId;
    }
  | { readonly type: 'start_combat'; readonly ghost: Combatant }
  | { readonly type: 'start_combat_from_ghost_build'; readonly ghost: GhostBuild }
  | { readonly type: 'advance_phase' };

/** Pure dispatcher — maps each variant to its corresponding RunController
 *  method. No validation; the controller throws on illegal actions and the
 *  harness propagates. The 'create_run' variant is NOT applicable here (the
 *  controller is already constructed); callers that route a stream through
 *  applyAction must consume the create_run header up-front. */
export function applyAction(
  controller: RunController,
  action: RunControllerAction,
): void {
  switch (action.type) {
    case 'create_run':
      throw new Error(
        "applyAction: 'create_run' must be handled by the caller; build the RunController via createRun() before dispatching the rest of the action stream",
      );
    case 'buy_item':
      controller.buyItem(action.slotIndex);
      return;
    case 'sell_item':
      controller.sellItem(action.placementId);
      return;
    case 'place_item':
      controller.placeItem(action.itemId, action.anchor, action.rotation);
      return;
    case 'move_item':
      controller.moveItem(action.placementId, action.anchor, action.rotation);
      return;
    case 'rotate_item':
      controller.rotateItem(action.placementId, action.rotation);
      return;
    case 'reroll_shop':
      controller.rerollShop();
      return;
    case 'combine_recipe':
      controller.combineRecipe(action.recipeId);
      return;
    case 'grant_relic':
      controller.grantRelic(action.slot, action.relicId);
      return;
    case 'start_combat':
      controller.startCombat(action.ghost);
      return;
    case 'start_combat_from_ghost_build':
      controller.startCombatFromGhostBuild(action.ghost);
      return;
    case 'advance_phase':
      controller.advancePhase();
      return;
  }
}
