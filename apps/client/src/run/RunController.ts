// UI-side state machine for the run screen. Pure reducer + helpers; no
// React.
//
// M1.3.4a — sim wire-up + data.local dissolution. ShopController.ts now
// owns shop generation (sim-driven via @packbreaker/sim's generateShop).
// REROLL_POOL is gone; the reroll action handler delegates to
// ShopController. SEED_BAG and SEED_SHOP dissolved entirely — runs start
// at round 1 with an empty bag and a sim-generated initial shop. INITIAL
// became createInitialState() so each run-screen mount mints a fresh
// SimSeed (M1.5 persistence saves/restores seeds for replays).
//
// Reroll cost formula uses sim's computeRerollCost
// (rerollCostStart + rerollsThisRound * rerollCostIncrement, with the
// extraRerollsPerRound allowance from relics — Apprentice's Loop, M1.5
// — currently always 0). The prototype's `rerollCount + 1` produced the
// same numbers because DEFAULT_RULESET sets both costStart and
// costIncrement to 1; using sim's helper now keeps the formula
// authoritative when contracts mutate the levers.

import { computeRerollCost } from '@packbreaker/sim';
import { DEFAULT_RULESET, type ClassId, type CombatResult } from '@packbreaker/content';

// M1.3.4a: hardcoded class for the prototype run. Class-select screen
// (gdd.md § 14 screen #2) is M1.5+; until then the run starts as Tinker.
const M1_PROTOTYPE_CLASS = 'tinker' as ClassId;
import { generateInitialShop, generateShop } from '../shop/ShopController';
import { BAG_COLS, BAG_ROWS, cellsOf, placementValid } from '../bag/layout';
import { ITEMS } from './content';
import { emptyRelicSlots, makeRunSeed } from './sim-bridge';
import type { BagItem, Cell, ItemId, RecipeMatch, RunState, ShopSlot } from './types';
import type { DragState } from '../bag/types';

export interface ClientRunState {
  bag: BagItem[];
  shop: ShopSlot[];
  state: RunState;
  drag: DragState | null;
  hover: { col: number; row: number } | null;
  combatActive: boolean;
}

/** Mints a fresh ClientRunState for a new run. Seed is wall-clock-derived
 *  via sim-bridge.makeRunSeed; the round-1 shop is sim-generated.
 *
 *  M1.3.4a notes:
 *    - The companion `INITIAL_CLIENT_STATE` const below evaluates this at
 *      module-import time, so the run starts at the same seed for the
 *      lifetime of the page load. New-run / persistence is M1.5+.
 *    - Each call mints a NEW seed (wall-clock + Math.random). For tests
 *      that need determinism, construct fixtures explicitly rather than
 *      relying on the const. */
export function createInitialState(): ClientRunState {
  const seed = makeRunSeed();
  const ruleset = DEFAULT_RULESET;
  const shop = generateInitialShop(seed, M1_PROTOTYPE_CLASS, ruleset);
  return {
    bag: [],
    shop,
    state: {
      round: 1,
      totalRounds: ruleset.maxRounds,
      hearts: ruleset.startingHearts,
      maxHearts: ruleset.startingHearts,
      gold: ruleset.baseGoldPerRound,
      trophy: 0,
      rerollCount: 0,
      className: 'Tinker',
      contractName: 'Neutral',
      contractText: 'No modifiers',
      ruleset,
      seed,
      history: [],
    },
    drag: null,
    hover: null,
    combatActive: false,
  };
}

/** Module-level singleton initial state. useRun uses this directly so
 *  state at first render matches what tests observe. */
export const INITIAL_CLIENT_STATE: ClientRunState = createInitialState();

// Relic-driven extraRerollsPerRound bonus is M1.5 (Apprentice's Loop). For
// M1.3.4a no relic state is modeled, so the allowance is always zero.
const EXTRA_REROLLS_PER_ROUND = 0;

export type RunAction =
  | { type: 'pickup_bag'; uid: string; itemId: ItemId; rot: number }
  | { type: 'pickup_shop'; uid: string }
  | { type: 'drag_rotate' }
  | { type: 'drag_cancel' }
  | { type: 'set_hover'; hover: { col: number; row: number } | null }
  | { type: 'drop_bag'; col: number; row: number; newUid: string }
  | { type: 'sell_drop' }
  | { type: 'reroll' }
  | { type: 'combine'; match: RecipeMatch; newUid: string }
  | { type: 'continue_to_combat' }
  | { type: 'combat_done'; result: CombatResult };

// Pure helper: computes placement of the combine output. Returns the new
// bag with the output placed, or null if no placement fits.
function placeCombineOutput(
  bag: BagItem[],
  match: RecipeMatch,
  newUid: string,
): BagItem[] | null {
  const inputs = match.uids
    .map((uid) => bag.find((b) => b.uid === uid))
    .filter((x): x is BagItem => Boolean(x));
  const cells = inputs.flatMap((b) => cellsOf(b));
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const outDef = ITEMS[match.recipe.output];
  if (!outDef) return null;
  const newBagBase = bag.filter((b) => !match.uids.includes(b.uid));
  let placed: { col: number; row: number; rot: number } | null = null;
  const tryCells: Cell[] = [[minX, minY], ...cells];
  for (const [tx, ty] of tryCells) {
    for (const rot of [0, 90, 180, 270]) {
      if (placementValid(newBagBase, outDef.id, tx, ty, rot, null)) {
        placed = { col: tx, row: ty, rot };
        break;
      }
    }
    if (placed) break;
  }
  if (!placed) {
    outer: for (let y = 0; y < BAG_ROWS; y++) {
      for (let x = 0; x < BAG_COLS; x++) {
        for (const rot of [0, 90, 180, 270]) {
          if (placementValid(newBagBase, outDef.id, x, y, rot, null)) {
            placed = { col: x, row: y, rot };
            break outer;
          }
        }
      }
    }
  }
  if (!placed) return null;
  return [...newBagBase, { uid: newUid, itemId: outDef.id, ...placed }];
}

export function clientRunReducer(state: ClientRunState, action: RunAction): ClientRunState {
  switch (action.type) {
    case 'pickup_bag':
      if (state.combatActive) return state;
      return {
        ...state,
        drag: {
          itemId: action.itemId,
          rot: action.rot,
          fromBagUid: action.uid,
        },
      };

    case 'pickup_shop': {
      if (state.combatActive) return state;
      const slot = state.shop.find((s) => s.uid === action.uid);
      if (!slot || !slot.itemId) return state;
      const def = ITEMS[slot.itemId];
      if (!def || state.state.gold < def.cost) return state;
      return {
        ...state,
        drag: {
          itemId: slot.itemId,
          rot: 0,
          fromShopUid: action.uid,
          cost: def.cost,
        },
      };
    }

    case 'drag_rotate':
      if (!state.drag) return state;
      return { ...state, drag: { ...state.drag, rot: (state.drag.rot + 90) % 360 } };

    case 'drag_cancel':
      if (!state.drag && !state.hover) return state;
      return { ...state, drag: null, hover: null };

    case 'set_hover':
      return { ...state, hover: action.hover };

    case 'drop_bag': {
      if (!state.drag) return state;
      const drag = state.drag;
      const ok = placementValid(
        state.bag,
        drag.itemId,
        action.col,
        action.row,
        drag.rot,
        drag.fromBagUid ?? null,
      );
      if (!ok) {
        return { ...state, drag: null, hover: null };
      }
      if (drag.fromBagUid) {
        const fromUid = drag.fromBagUid;
        return {
          ...state,
          bag: state.bag.map((x) =>
            x.uid === fromUid ? { ...x, col: action.col, row: action.row, rot: drag.rot } : x,
          ),
          drag: null,
          hover: null,
        };
      }
      if (drag.fromShopUid) {
        const fromShop = drag.fromShopUid;
        const cost = drag.cost ?? 0;
        return {
          ...state,
          bag: [
            ...state.bag,
            {
              uid: action.newUid,
              itemId: drag.itemId,
              col: action.col,
              row: action.row,
              rot: drag.rot,
            },
          ],
          shop: state.shop.map((slot) =>
            slot.uid === fromShop ? { ...slot, itemId: null } : slot,
          ),
          state: { ...state.state, gold: state.state.gold - cost },
          drag: null,
          hover: null,
        };
      }
      return { ...state, drag: null, hover: null };
    }

    case 'sell_drop': {
      if (!state.drag || !state.drag.fromBagUid) {
        return { ...state, drag: null, hover: null };
      }
      const fromUid = state.drag.fromBagUid;
      const item = state.bag.find((b) => b.uid === fromUid);
      if (!item) {
        return { ...state, drag: null, hover: null };
      }
      const def = ITEMS[item.itemId];
      if (!def) return { ...state, drag: null, hover: null };
      const refund = Math.floor(def.cost * 0.5);
      return {
        ...state,
        bag: state.bag.filter((x) => x.uid !== fromUid),
        state: { ...state.state, gold: state.state.gold + refund },
        drag: null,
        hover: null,
      };
    }

    case 'reroll': {
      const ruleset = state.state.ruleset;
      const cost = computeRerollCost(
        state.state.rerollCount,
        ruleset.rerollCostStart,
        ruleset.rerollCostIncrement,
        EXTRA_REROLLS_PER_ROUND,
      );
      if (state.state.gold < cost) return state;
      const newSlots = generateShop(
        state.state.seed,
        state.state.round,
        M1_PROTOTYPE_CLASS,
        ruleset,
        state.state.rerollCount + 1,
      );
      return {
        ...state,
        shop: newSlots,
        state: {
          ...state.state,
          gold: state.state.gold - cost,
          rerollCount: state.state.rerollCount + 1,
        },
      };
    }

    case 'combine': {
      const newBag = placeCombineOutput(state.bag, action.match, action.newUid);
      if (!newBag) return state;
      return { ...state, bag: newBag };
    }

    case 'continue_to_combat':
      if (state.combatActive) return state;
      return { ...state, combatActive: true };

    case 'combat_done': {
      // Round advancement + reward. M1.3.4a commit 2 plumbs the
      // CombatResult into the action; commit 3 consumes outcome +
      // damage to populate hearts loss + RunHistoryEntry. For now the
      // reducer advances optimistically (always-win); voiding the
      // payload reads keeps the parameter present without behavior.
      void action.result;
      const nextRound = state.state.round + 1;
      const ruleset = state.state.ruleset;
      // Generate next round's shop deterministically from the run seed.
      const nextShop = generateShop(state.state.seed, nextRound, M1_PROTOTYPE_CLASS, ruleset, 0);
      // Empty relic slots (M1.3.4a — relic state machinery is M1.5).
      void emptyRelicSlots;
      return {
        ...state,
        combatActive: false,
        shop: nextShop,
        state: {
          ...state.state,
          gold: state.state.gold + ruleset.winBonusGold,
          trophy: state.state.trophy + 18,
          round: nextRound,
          rerollCount: 0,
        },
      };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
