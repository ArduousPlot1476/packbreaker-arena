// UI-side state machine for the run screen. Pure reducer + helpers; no
// React. M1.3.1 owns shop state alongside bag/run state — sim integration
// (M1.3.4) will introduce a separate ShopController.ts that takes over
// shop generation. Until then, REROLL_POOL + SEED_SHOP carry the
// prototype's deterministic-by-counter shop behavior.
//
// As of commit 6 (@dnd-kit migration) DragState carries only the
// item/uid/cost identity fields — drag-cursor positioning lives entirely
// inside @dnd-kit's DragOverlay, so the prototype's x/y/offX/offY are
// gone, and the drag_move action with them.

import {
  BAG_COLS,
  BAG_ROWS,
  cellsOf,
  INITIAL,
  ITEMS,
  SEED_BAG,
  SEED_SHOP,
  type BagItem,
  type Cell,
  type ItemId,
  type RunState,
  type ShopSlot,
} from '../data.local';
import type { DragState } from '../bag/types';
import { placementValid } from '../bag/layout';
import type { RecipeMatch } from './recipes';

export const REROLL_POOL: ItemId[] = [
  'iron-sword',
  'iron-dagger',
  'wooden-shield',
  'healing-herb',
  'spark-stone',
  'whetstone',
  'apple',
  'copper-coin',
  'healing-salve',
  'fire-oil',
];

export interface ClientRunState {
  bag: BagItem[];
  shop: ShopSlot[];
  state: RunState;
  drag: DragState | null;
  hover: { col: number; row: number } | null;
  combatActive: boolean;
}

export const INITIAL_CLIENT_STATE: ClientRunState = {
  bag: SEED_BAG,
  shop: SEED_SHOP,
  state: INITIAL,
  drag: null,
  hover: null,
  combatActive: false,
};

export type RunAction =
  | { type: 'pickup_bag'; uid: string; itemId: ItemId; rot: number }
  | { type: 'pickup_shop'; uid: string }
  | { type: 'drag_rotate' }
  | { type: 'drag_cancel' }
  | { type: 'set_hover'; hover: { col: number; row: number } | null }
  | { type: 'drop_bag'; col: number; row: number; newUid: string }
  | { type: 'sell_drop' }
  | { type: 'reroll'; uidPrefix: string }
  | { type: 'combine'; match: RecipeMatch; newUid: string }
  | { type: 'continue_to_combat' }
  | { type: 'combat_done' };

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
      if (state.state.gold < def.cost) return state;
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
      const cost = state.state.rerollCount + 1;
      if (state.state.gold < cost) return state;
      const newSlots: ShopSlot[] = SEED_SHOP.map((_s, i) => {
        const id = REROLL_POOL[(state.state.rerollCount * 2 + i + 3) % REROLL_POOL.length];
        return { uid: action.uidPrefix + i, itemId: id };
      });
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

    case 'combat_done':
      return {
        ...state,
        combatActive: false,
        state: {
          ...state.state,
          gold: state.state.gold + 1,
          trophy: state.state.trophy + 18,
          round: state.state.round + 1,
          rerollCount: 0,
        },
      };

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
