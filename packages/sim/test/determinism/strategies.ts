// determinism/strategies.ts — TEST SCAFFOLDING.
//
// Five strategies for the M1.2.5 determinism suite. Each is a deterministic
// `(ctx) => RunControllerAction | null` that, given the current run state and
// a strategy-side rng, returns the next action to apply to the controller.
//
// The orchestrator (generate.ts) invokes a strategy in a loop until the run
// reaches phase === 'ended', tracks pending items (mirroring the controller's
// internal pending list), and writes the resulting action stream to a JSONL
// fixture.
//
// Strategies are heuristic and aim for path coverage, not realism. Tuning
// notes are inline at each strategy.

import {
  CONTRACTS,
  ITEMS,
  PlacementId,
  RECIPES,
  type BagPlacement,
  type CellCoord,
  type Item,
  type ItemId,
  type Rotation,
  type RunState,
} from '@packbreaker/content';
import { canonicalCells } from '../../src/iteration';
import type { Rng } from '../../src/rng';
import {
  composeRuleset,
  computeRerollCost,
  effectiveItemCost,
  type RecipeMatch,
  type RunController,
  type RunControllerAction,
} from '../../src/run';
import { generateProceduralGhost } from './ghost-generator';

export type StrategyName =
  | 'greedy'
  | 'hoarder'
  | 'recipe-chaser'
  | 'reroll-burner'
  | 'random-legal';

export interface StrategyContext {
  readonly ctrl: RunController;
  readonly rng: Rng;
  /** Items bought but not yet placed. Mirror of the controller's private
   *  pendingItems list — tracked externally by the orchestrator since the
   *  field isn't exposed in RunState. */
  readonly pending: ReadonlyArray<ItemId>;
}

export type Strategy = (ctx: StrategyContext) => RunControllerAction | null;

export const STRATEGIES: Readonly<Record<StrategyName, Strategy>> = {
  greedy: greedyStrategy,
  hoarder: hoarderStrategy,
  'recipe-chaser': recipeChaserStrategy,
  'reroll-burner': rerollBurnerStrategy,
  'random-legal': randomLegalStrategy,
};

// ─── Shared helpers ──────────────────────────────────────────────────

/** Filters a recipe match through the controller's `findCombineRotation` —
 *  strategies must NEVER emit a `combine_recipe` action for a match that the
 *  controller would reject. Single source of truth: the controller's fit
 *  predicate; test code does not reimplement the rotation/anchor check. */
function wouldCombineFit(ctrl: RunController, match: RecipeMatch): boolean {
  return ctrl.findCombineRotation(match) !== null;
}

/** Returns the first recipe match (in detectRecipes canonical order) whose
 *  output actually fits, or null if none do. */
function firstFittingMatch(ctrl: RunController): RecipeMatch | null {
  for (const m of ctrl.detectRecipes()) {
    if (wouldCombineFit(ctrl, m)) return m;
  }
  return null;
}

/** Returns the per-item-cost delta from class + relics (composeRuleset). */
function deriveItemCostDelta(state: RunState): number {
  const contract = CONTRACTS[state.contractId]!;
  return composeRuleset(contract, state.classId, state.relics).derived.itemCostDelta;
}

/** True iff the player can afford the next reroll. Mirrors the controller's
 *  rerollShop precondition exactly — strategies must use this rather than a
 *  rough `state.gold >= 2` guard, since extraRerollsPerRound (Apprentice's Loop)
 *  + rerollCostIncrement make actual cost dependent on prior rerolls. */
function canAffordReroll(state: RunState): boolean {
  const contract = CONTRACTS[state.contractId]!;
  const derived = composeRuleset(contract, state.classId, state.relics).derived;
  const cost = computeRerollCost(
    state.shop.rerollsThisRound,
    state.ruleset.rerollCostStart,
    state.ruleset.rerollCostIncrement,
    derived.extraRerollsPerRound,
  );
  return state.gold >= cost;
}

/** Computes effective shop cost for slot i. */
function slotCost(state: RunState, slotIndex: number): number {
  const itemId = state.shop.slots[slotIndex];
  if (!itemId) return Infinity;
  const item = ITEMS[itemId];
  if (!item) return Infinity;
  return effectiveItemCost(item, deriveItemCostDelta(state), state.ruleset.itemCostMultiplierBp);
}

/** Returns the first (rotation, row, col) where `itemId` fits in the bag.
 *  rotationOrder lets callers prioritize 0 vs full rotation cycle. */
function findFirstValidPlacement(
  bag: RunState['bag'],
  itemId: ItemId,
  rotationOrder: ReadonlyArray<Rotation> = [0, 90, 180, 270],
): { anchor: CellCoord; rotation: Rotation } | null {
  const occupied = new Set<string>();
  for (const p of bag.placements) {
    for (const cell of canonicalCells(p, ITEMS)) {
      occupied.add(`${cell.row}:${cell.col}`);
    }
  }
  for (const rotation of rotationOrder) {
    for (let row = 0; row < bag.dimensions.height; row++) {
      for (let col = 0; col < bag.dimensions.width; col++) {
        const candidate: BagPlacement = {
          placementId: PlacementId('cand'),
          itemId,
          anchor: { col, row },
          rotation,
        };
        if (placementFits(candidate, occupied, bag.dimensions)) {
          return { anchor: { col, row }, rotation };
        }
      }
    }
  }
  return null;
}

function placementFits(
  candidate: BagPlacement,
  occupied: ReadonlySet<string>,
  dims: { width: number; height: number },
): boolean {
  const cells = canonicalCells(candidate, ITEMS);
  for (const cell of cells) {
    if (
      cell.col < 0 ||
      cell.col >= dims.width ||
      cell.row < 0 ||
      cell.row >= dims.height ||
      occupied.has(`${cell.row}:${cell.col}`)
    ) {
      return false;
    }
  }
  return true;
}

/** Returns true if `item.shape` describes a non-square footprint (1×N where
 *  N>1, or N×1). Square items rotate to themselves; non-square items show
 *  visible rotation. Used by random-legal to bias toward rotation 270 on
 *  non-squares (closes the iteration.ts:151 carry-forward branch). */
function isNonSquare(item: Item): boolean {
  let maxC = 0;
  let maxR = 0;
  for (const c of item.shape) {
    if (c.col > maxC) maxC = c.col;
    if (c.row > maxR) maxR = c.row;
  }
  return maxC !== maxR;
}

/** True iff rotating `placement` to `newRotation` produces a layout that
 *  fits in the bag with no overlap (excluding the placement itself). Mirrors
 *  the controller's RunController.isValidPlacement check for rotation. */
function isRotationValid(
  bag: RunState['bag'],
  placement: BagPlacement,
  newRotation: Rotation,
): boolean {
  const candidate: BagPlacement = {
    placementId: placement.placementId,
    itemId: placement.itemId,
    anchor: placement.anchor,
    rotation: newRotation,
  };
  const occupied = new Set<string>();
  for (const p of bag.placements) {
    if (p.placementId === placement.placementId) continue;
    for (const cell of canonicalCells(p, ITEMS)) {
      occupied.add(`${cell.row}:${cell.col}`);
    }
  }
  return placementFits(candidate, occupied, bag.dimensions);
}

function nextProceduralGhost(
  state: RunState,
  rng: Rng,
): RunControllerAction {
  const ghost = generateProceduralGhost(state.currentRound, rng);
  return { type: 'start_combat_from_ghost_build', ghost };
}

// ─── greedy ──────────────────────────────────────────────────────────

/** Buy → place → fight loop. No rerolls, no recipe pursuit. Combine
 *  opportunistically when a recipe materializes from natural draws. */
function greedyStrategy(ctx: StrategyContext): RunControllerAction | null {
  const phase = ctx.ctrl.getPhase();
  if (phase === 'ended') return null;
  if (phase === 'resolution') return { type: 'advance_phase' };

  const state = ctx.ctrl.getState();

  // 1. If anything is pending from a prior buy, place it.
  if (ctx.pending.length > 0) {
    const itemId = ctx.pending[0]!;
    const slot = findFirstValidPlacement(state.bag, itemId);
    if (slot) {
      return { type: 'place_item', itemId, anchor: slot.anchor, rotation: slot.rotation };
    }
    // No room — sell something to make room. Sell oldest placement.
    if (state.bag.placements.length > 0) {
      return { type: 'sell_item', placementId: state.bag.placements[0]!.placementId };
    }
    // Pending can't fit and bag is empty (impossible) → fight.
    return nextProceduralGhost(state, ctx.rng);
  }

  // 2. Combine if any recipe is ready.
  const fittingMatch = firstFittingMatch(ctx.ctrl);
  if (fittingMatch) {
    return { type: 'combine_recipe', recipeId: fittingMatch.recipeId };
  }

  // 3. Buy the first affordable shop slot whose item plausibly fits the bag.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }

  // 4. Nothing else to do → fight.
  return nextProceduralGhost(state, ctx.rng);
}

// ─── hoarder ─────────────────────────────────────────────────────────

/** Skip purchases until round 4 (uncommons unlock), then buy one Uncommon
 *  per round and place it. Rerolls once per round to surface higher-value
 *  options before buying. */
function hoarderStrategy(ctx: StrategyContext): RunControllerAction | null {
  const phase = ctx.ctrl.getPhase();
  if (phase === 'ended') return null;
  if (phase === 'resolution') return { type: 'advance_phase' };

  const state = ctx.ctrl.getState();

  if (ctx.pending.length > 0) {
    const itemId = ctx.pending[0]!;
    const slot = findFirstValidPlacement(state.bag, itemId);
    if (slot) {
      return { type: 'place_item', itemId, anchor: slot.anchor, rotation: slot.rotation };
    }
    if (state.bag.placements.length > 0) {
      return { type: 'sell_item', placementId: state.bag.placements[0]!.placementId };
    }
    return nextProceduralGhost(state, ctx.rng);
  }

  const fittingMatch = firstFittingMatch(ctx.ctrl);
  if (fittingMatch) {
    return { type: 'combine_recipe', recipeId: fittingMatch.recipeId };
  }

  // Save until round 4 (uncommon gate opens).
  if (state.currentRound < 4) {
    return nextProceduralGhost(state, ctx.rng);
  }

  // One reroll per round before buying.
  if (state.shop.rerollsThisRound === 0 && canAffordReroll(state)) {
    return { type: 'reroll_shop' };
  }

  // Prefer the highest-rarity affordable slot whose item fits.
  const rarityRank: Record<string, number> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  };
  let bestSlot = -1;
  let bestRank = -1;
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    const rank = rarityRank[ITEMS[itemId]!.rarity] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      bestSlot = i;
    }
  }
  if (bestSlot >= 0) return { type: 'buy_item', slotIndex: bestSlot };

  return nextProceduralGhost(state, ctx.rng);
}

// ─── recipe-chaser ───────────────────────────────────────────────────

const CAPSTONE_RECIPE_IDS: ReadonlySet<string> = new Set([
  'r-tower-shield',
  'r-berserkers-greataxe',
  'r-master-alchemists-kit',
]);

/** Locks onto a target recipe (deterministic from run seed → 12 recipes
 *  cycle through 40 recipe-chaser fixtures, ~3.3 fixtures per target) and
 *  aggressively pursues it. For Capstone-tier targets (r-tower-shield,
 *  r-berserkers-greataxe, r-master-alchemists-kit) the strategy switches to
 *  capstone-solver mode: defensive early-game purchases, leaf-first bottom-up
 *  recipe completion, gold reservation, and corner-priority placement so the
 *  2×2 output has free cells adjacent to its inputs' anchor. */
function recipeChaserStrategy(ctx: StrategyContext): RunControllerAction | null {
  const phase = ctx.ctrl.getPhase();
  if (phase === 'ended') return null;
  if (phase === 'resolution') return { type: 'advance_phase' };

  const state = ctx.ctrl.getState();
  const targetRecipe = RECIPES[Number(state.seed) % RECIPES.length]!;
  if (CAPSTONE_RECIPE_IDS.has(targetRecipe.id)) {
    return capstoneSolverStep(ctx, targetRecipe);
  }
  const wantedInputs = recipeChainInputs(targetRecipe);
  const targetInputItemIds = new Set(targetRecipe.inputs.map((i) => i.itemId));

  if (ctx.pending.length > 0) {
    const itemId = ctx.pending[0]!;
    const slot =
      findAdjacentPlacement(state.bag, itemId) ??
      findFirstValidPlacement(state.bag, itemId);
    if (slot) {
      return { type: 'place_item', itemId, anchor: slot.anchor, rotation: slot.rotation };
    }
    if (state.bag.placements.length > 0) {
      // Sell something unrelated to the target chain to make room.
      const expendable =
        state.bag.placements.find((p) => !wantedInputs.has(p.itemId)) ??
        state.bag.placements[0]!;
      return { type: 'sell_item', placementId: expendable.placementId };
    }
    return nextProceduralGhost(state, ctx.rng);
  }

  // Combine: prefer the target recipe; otherwise prefer matches in the chain
  // (intermediate progress); otherwise any fitting match.
  const fittingMatches = ctx.ctrl.detectRecipes().filter((m) => wouldCombineFit(ctx.ctrl, m));
  const targetMatch = fittingMatches.find((m) => m.recipeId === targetRecipe.id);
  if (targetMatch) return { type: 'combine_recipe', recipeId: targetMatch.recipeId };
  if (fittingMatches.length > 0) {
    const chainMatch = fittingMatches.find((m) => {
      const recipe = RECIPES.find((r) => r.id === m.recipeId);
      return !!recipe && wantedInputs.has(recipe.output);
    });
    return { type: 'combine_recipe', recipeId: (chainMatch ?? fittingMatches[0]!).recipeId };
  }

  const bagItemIds = new Set(state.bag.placements.map((p) => p.itemId));

  // 1. Direct target input.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (!targetInputItemIds.has(itemId)) continue;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }
  // 2. Chain-prerequisite input we don't yet have on the bag.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (!wantedInputs.has(itemId)) continue;
    if (bagItemIds.has(itemId)) continue;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }

  // Reroll aggressively while the shop is barren of target-chain items.
  if (state.shop.rerollsThisRound < 6 && canAffordReroll(state)) {
    return { type: 'reroll_shop' };
  }

  // Fall back to greedy buy of any fitting common — keeps the run progressing.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }

  return nextProceduralGhost(state, ctx.rng);
}

/** Resolves the full set of "wanted" item ids for a target recipe — its
 *  direct inputs plus the inputs of any recipe whose output equals one of
 *  the target's inputs (recursively). Lets recipe-chaser pursue Mid- and
 *  Capstone-tier targets by completing intermediate recipes (e.g.,
 *  r-greatsword needs steel-sword, which is the output of r-steel-sword
 *  whose inputs are iron-sword + iron-dagger). */
function recipeChainInputs(target: typeof RECIPES[number]): Set<ItemId> {
  const wanted = new Set<ItemId>();
  const seen = new Set<string>();
  const queue: typeof RECIPES[number][] = [target];
  while (queue.length > 0) {
    const recipe = queue.shift()!;
    if (seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    for (const input of recipe.inputs) {
      wanted.add(input.itemId);
      const producer = RECIPES.find((r) => r.output === input.itemId);
      if (producer) queue.push(producer);
    }
  }
  return wanted;
}

/** Capstone-solver mode for recipe-chaser. Activates only when the fixture's
 *  target is one of CAPSTONE_RECIPE_IDS. Adds three behaviors over vanilla
 *  recipe-chaser:
 *    1. Defensive early game (rounds 1–3): if bag is empty, buy any
 *       weapon/armor item even if off-plan to survive into the rare gate.
 *    2. Aggressive rerolls (up to 10/round) while target/chain inputs absent.
 *    3. Anchor-aware placement: target-chain inputs go top-left so the 2×2
 *       output's anchor (minRow=0, minCol=0) has free cells at (0,1)/(1,0)/(1,1).
 *       Non-chain items go bottom-right. */
function capstoneSolverStep(
  ctx: StrategyContext,
  target: typeof RECIPES[number],
): RunControllerAction | null {
  const state = ctx.ctrl.getState();
  const round = state.currentRound;
  const wantedInputs = recipeChainInputs(target);
  const targetInputItemIds = new Set(target.inputs.map((i) => i.itemId));
  const chainRecipeIds = new Set<string>();
  // Identify all recipes whose output feeds the target chain (including target itself).
  for (const recipe of RECIPES) {
    if (recipe.id === target.id || wantedInputs.has(recipe.output)) {
      chainRecipeIds.add(recipe.id);
    }
  }

  // Pending: place chain items top-left, non-chain bottom-right.
  if (ctx.pending.length > 0) {
    const itemId = ctx.pending[0]!;
    const isChain = wantedInputs.has(itemId);
    const slot = isChain
      ? findCornerPlacement(state.bag, itemId, 'top-left')
        ?? findFirstValidPlacement(state.bag, itemId)
      : findCornerPlacement(state.bag, itemId, 'bottom-right')
        ?? findFirstValidPlacement(state.bag, itemId);
    if (slot) {
      return { type: 'place_item', itemId, anchor: slot.anchor, rotation: slot.rotation };
    }
    if (state.bag.placements.length > 0) {
      const expendable =
        state.bag.placements.find((p) => !wantedInputs.has(p.itemId)) ??
        state.bag.placements[0]!;
      return { type: 'sell_item', placementId: expendable.placementId };
    }
    return nextProceduralGhost(state, ctx.rng);
  }

  // Combine: target → chain → nothing else (off-chain combines fragment the bag).
  const fittingMatches = ctx.ctrl.detectRecipes().filter((m) => wouldCombineFit(ctx.ctrl, m));
  const targetMatch = fittingMatches.find((m) => m.recipeId === target.id);
  if (targetMatch) return { type: 'combine_recipe', recipeId: targetMatch.recipeId };
  const chainMatch = fittingMatches.find((m) => chainRecipeIds.has(m.recipeId));
  if (chainMatch) return { type: 'combine_recipe', recipeId: chainMatch.recipeId };

  // Defensive early game: if bag is empty in rounds 1–3, buy ANY common weapon
  // or armor. Survival now is worth more than chain purity — the chain inputs
  // become accessible in later rounds.
  if (round <= 3 && state.bag.placements.length === 0) {
    for (let i = 0; i < state.shop.slots.length; i++) {
      if (state.shop.purchased.includes(i)) continue;
      if (state.gold < slotCost(state, i)) continue;
      const itemId = state.shop.slots[i]!;
      const item = ITEMS[itemId];
      if (!item) continue;
      if (!item.tags.includes('weapon') && !item.tags.includes('armor')) continue;
      if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
      return { type: 'buy_item', slotIndex: i };
    }
  }

  const bagItemIds = new Set(state.bag.placements.map((p) => p.itemId));

  // 1. Direct target inputs.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (!targetInputItemIds.has(itemId)) continue;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }
  // 2. Chain prerequisites we don't yet have.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (!wantedInputs.has(itemId)) continue;
    if (bagItemIds.has(itemId)) continue;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }

  // 3. Aggressive rerolls — capstones depend on RNG surfacing rare items.
  if (state.shop.rerollsThisRound < 10 && canAffordReroll(state)) {
    return { type: 'reroll_shop' };
  }

  // 4. Last-ditch greedy buy — keeps the run alive into later rounds.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }

  return nextProceduralGhost(state, ctx.rng);
}

/** Iterates rows/cols in top-left or bottom-right priority and returns the
 *  first valid placement at rotation 0. Used by capstone-solver to keep the
 *  target inputs anchored at (0,0) (so the 2×2 output's freed footprint
 *  doesn't collide with non-chain items). */
function findCornerPlacement(
  bag: RunState['bag'],
  itemId: ItemId,
  corner: 'top-left' | 'bottom-right',
): { anchor: CellCoord; rotation: Rotation } | null {
  const occupied = new Set<string>();
  for (const p of bag.placements) {
    for (const cell of canonicalCells(p, ITEMS)) {
      occupied.add(`${cell.row}:${cell.col}`);
    }
  }
  const rows = corner === 'top-left'
    ? Array.from({ length: bag.dimensions.height }, (_, i) => i)
    : Array.from({ length: bag.dimensions.height }, (_, i) => bag.dimensions.height - 1 - i);
  const cols = corner === 'top-left'
    ? Array.from({ length: bag.dimensions.width }, (_, i) => i)
    : Array.from({ length: bag.dimensions.width }, (_, i) => bag.dimensions.width - 1 - i);
  for (const row of rows) {
    for (const col of cols) {
      const candidate: BagPlacement = {
        placementId: PlacementId('cand'),
        itemId,
        anchor: { col, row },
        rotation: 0,
      };
      if (placementFits(candidate, occupied, bag.dimensions)) {
        return { anchor: { col, row }, rotation: 0 };
      }
    }
  }
  return null;
}

/** Finds a placement adjacent to any existing placement. Used by recipe-chaser
 *  to bias toward connected layouts. */
function findAdjacentPlacement(
  bag: RunState['bag'],
  itemId: ItemId,
): { anchor: CellCoord; rotation: Rotation } | null {
  if (bag.placements.length === 0) {
    return findFirstValidPlacement(bag, itemId);
  }
  const occupied = new Set<string>();
  const adjacent = new Set<string>();
  for (const p of bag.placements) {
    for (const cell of canonicalCells(p, ITEMS)) {
      occupied.add(`${cell.row}:${cell.col}`);
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        adjacent.add(`${cell.row + dr}:${cell.col + dc}`);
      }
    }
  }
  for (let row = 0; row < bag.dimensions.height; row++) {
    for (let col = 0; col < bag.dimensions.width; col++) {
      const candidate: BagPlacement = {
        placementId: PlacementId('cand'),
        itemId,
        anchor: { col, row },
        rotation: 0,
      };
      if (!placementFits(candidate, occupied, bag.dimensions)) continue;
      const cells = canonicalCells(candidate, ITEMS);
      const isAdjacent = cells.some((c) => adjacent.has(`${c.row}:${c.col}`));
      if (isAdjacent) return { anchor: { col, row }, rotation: 0 };
    }
  }
  return null;
}

// ─── reroll-burner ───────────────────────────────────────────────────

/** Burns rerolls until specifically a Common-rarity weapon-tagged item shows
 *  up (or 5 rerolls exhausted), then buys + places + fights. Exercises the
 *  shop_reroll path and the rerollCostStart + Apprentice's-Loop free-reroll
 *  branches with high frequency. */
function rerollBurnerStrategy(ctx: StrategyContext): RunControllerAction | null {
  const phase = ctx.ctrl.getPhase();
  if (phase === 'ended') return null;
  if (phase === 'resolution') return { type: 'advance_phase' };

  const state = ctx.ctrl.getState();

  if (ctx.pending.length > 0) {
    const itemId = ctx.pending[0]!;
    const slot = findFirstValidPlacement(state.bag, itemId);
    if (slot) {
      return { type: 'place_item', itemId, anchor: slot.anchor, rotation: slot.rotation };
    }
    if (state.bag.placements.length > 0) {
      return { type: 'sell_item', placementId: state.bag.placements[0]!.placementId };
    }
    return nextProceduralGhost(state, ctx.rng);
  }

  const fittingMatch = firstFittingMatch(ctx.ctrl);
  if (fittingMatch) {
    return { type: 'combine_recipe', recipeId: fittingMatch.recipeId };
  }

  const hasWeapon = state.shop.slots.some((id, i) => {
    if (state.shop.purchased.includes(i)) return false;
    return ITEMS[id]?.tags.includes('weapon') ?? false;
  });

  if (!hasWeapon && state.shop.rerollsThisRound < 5 && canAffordReroll(state)) {
    return { type: 'reroll_shop' };
  }

  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    const itemId = state.shop.slots[i]!;
    if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
    return { type: 'buy_item', slotIndex: i };
  }

  return nextProceduralGhost(state, ctx.rng);
}

// ─── random-legal ────────────────────────────────────────────────────

/** Enumerates all currently-legal actions and picks one uniformly via rng.
 *  Aims for path coverage in unusual code paths (rotation 270, repeated moves,
 *  selling-then-rebuying, etc.). Bounded by a per-fixture action limit. */
function randomLegalStrategy(ctx: StrategyContext): RunControllerAction | null {
  const phase = ctx.ctrl.getPhase();
  if (phase === 'ended') return null;
  if (phase === 'resolution') return { type: 'advance_phase' };

  const state = ctx.ctrl.getState();
  const candidates: RunControllerAction[] = [];

  // 1. Pending-item placements (one candidate per (pending, anchor, rotation)).
  for (const itemId of ctx.pending) {
    const item = ITEMS[itemId];
    if (!item) continue;
    const occupied = new Set<string>();
    for (const p of state.bag.placements) {
      for (const cell of canonicalCells(p, ITEMS)) {
        occupied.add(`${cell.row}:${cell.col}`);
      }
    }
    for (const rotation of [0, 90, 180, 270] as const) {
      for (let row = 0; row < state.bag.dimensions.height; row++) {
        for (let col = 0; col < state.bag.dimensions.width; col++) {
          const candidate: BagPlacement = {
            placementId: PlacementId('cand'),
            itemId,
            anchor: { col, row },
            rotation,
          };
          if (placementFits(candidate, occupied, state.bag.dimensions)) {
            candidates.push({
              type: 'place_item',
              itemId,
              anchor: { col, row },
              rotation,
            });
          }
        }
      }
    }
  }

  // 2. If pending and at least one placement candidate exists, force a
  // placement (keeps pending bounded so the strategy makes progress).
  if (ctx.pending.length > 0 && candidates.length > 0) {
    return candidates[ctx.rng.nextInt(0, candidates.length - 1)]!;
  }

  // 3. Otherwise, enumerate non-placement actions.
  // 3a. Buy slots.
  for (let i = 0; i < state.shop.slots.length; i++) {
    if (state.shop.purchased.includes(i)) continue;
    if (state.gold < slotCost(state, i)) continue;
    candidates.push({ type: 'buy_item', slotIndex: i });
  }
  // 3b. Reroll.
  if (canAffordReroll(state) && state.shop.rerollsThisRound < 5) {
    candidates.push({ type: 'reroll_shop' });
  }
  // 3c. Sell each placed item.
  for (const p of state.bag.placements) {
    candidates.push({ type: 'sell_item', placementId: p.placementId });
  }
  // 3d. Rotate each placed item — bias toward 270 on non-square items to
  // close iteration.ts:151's rotation-270 branch. Filter through validity:
  // strategies must NEVER emit a rotate_item the controller would reject
  // (off-grid or overlap) — same single-source-of-truth discipline as
  // wouldCombineFit applied to combine_recipe.
  for (const p of state.bag.placements) {
    const item = ITEMS[p.itemId];
    if (!item) continue;
    if (isNonSquare(item) && isRotationValid(state.bag, p, 270)) {
      candidates.push({ type: 'rotate_item', placementId: p.placementId, rotation: 270 });
    }
    const randRot = ([0, 90, 180, 270] as const)[ctx.rng.nextInt(0, 3)]!;
    if (randRot !== p.rotation && isRotationValid(state.bag, p, randRot)) {
      candidates.push({ type: 'rotate_item', placementId: p.placementId, rotation: randRot });
    }
  }
  // 3e. Combine recipes (only those whose output is known to fit).
  for (const m of ctx.ctrl.detectRecipes()) {
    if (wouldCombineFit(ctx.ctrl, m)) {
      candidates.push({ type: 'combine_recipe', recipeId: m.recipeId });
    }
  }
  // 3f. Always-available: start_combat_from_ghost_build.
  candidates.push(nextProceduralGhost(state, ctx.rng));

  return candidates[ctx.rng.nextInt(0, candidates.length - 1)]!;
}
