// Client-side run shapes. Replaces the prototype shapes that lived in
// apps/client/src/data.local.ts (dissolved at M1.3.4a).
//
// These are deliberately client-narrowed views of the canonical content +
// sim shapes — UI doesn't need triggers/effects/passive-stat fields. The
// adapter at apps/client/src/run/sim-bridge.ts converts between client
// BagItem ↔ canonical BagState at the sim integration boundary.
//
// ItemId broadens from the M0 prototype's narrow 12-slug union to the
// canonical content brand (`Brand<string, 'ItemId'>`). The shop pool is
// constrained to the iconned subset (run/content.ts SHOP_POOL_ITEMS) so
// only items with inline-SVG renderings reach the UI; that filter is the
// transitional constraint, not the type.

import type { Rarity, RunHistoryEntry, Ruleset, SimSeed } from '@packbreaker/content';

export type { ItemId } from '@packbreaker/content';
import type { ItemId } from '@packbreaker/content';

export type Cell = [number, number];

/** Client-narrowed bag-item shape: uid + canonical itemId + grid placement.
 *  Differs from canonical BagPlacement (which uses CellCoord {col, row} as
 *  `anchor` and `Rotation` as 0/90/180/270 union). Adapter in sim-bridge
 *  converts BagItem[] → BagState for sim consumption. */
export interface BagItem {
  uid: string;
  itemId: ItemId;
  col: number;
  row: number;
  rot: number;
}

/** Single shop slot. `itemId: null` is the "sold" state — sim's ShopState
 *  tracks `purchased: number[]` (slot indices); the client materializes
 *  bought slots as `itemId: null` for ergonomic React rendering. */
export interface ShopSlot {
  uid: string;
  itemId: ItemId | null;
}

/** Client-narrowed item record. Adapted from canonical Item which carries
 *  triggers/effects/passive stats — UI doesn't need those. */
export interface ItemDef {
  id: ItemId;
  name: string;
  rarity: Rarity;
  cost: number;
  /** bbox width derived from canonical shape's max(col)+1. */
  w: number;
  /** bbox height derived from canonical shape's max(row)+1. */
  h: number;
  blurb: string;
  tags: string[];
}

/** Client-narrowed recipe shape. Adapted from canonical Recipe which carries
 *  rotationLocked. M1.3.4a doesn't surface rotationLocked to the UI. */
export interface Recipe {
  id: string;
  inputs: ItemId[];
  output: ItemId;
}

/** Result of a recipe-detection pass: the matching recipe + the bag-item
 *  uids that satisfy its inputs (multiset match + 4-neighbor adjacency). */
export interface RecipeMatch {
  recipe: Recipe;
  uids: string[];
}

/** Run-state UI shape. Most fields are display-driven; M1.3.4a adds three
 *  sim-driven fields:
 *    - ruleset: drives bagDimensions + economy levers (default
 *               DEFAULT_RULESET; contracts mutate post-M1).
 *    - seed:    base SimSeed for deterministic shop + ghost generation.
 *    - history: per-round results populated after each combat resolves. */
export interface RunState {
  round: number;
  totalRounds: number;
  hearts: number;
  maxHearts: number;
  gold: number;
  trophy: number;
  rerollCount: number;
  className: string;
  contractName: string;
  contractText: string;
  ruleset: Ruleset;
  seed: SimSeed;
  history: RunHistoryEntry[];
}
