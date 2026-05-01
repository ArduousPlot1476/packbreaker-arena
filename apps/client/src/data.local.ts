// data.local.ts — prototype↔content adapter for the M0 Run Screen UX.
//
// DEVIATION from spec phase 5 step 11 (which says delete this file): retained
// as a thin adapter because its remaining exports (RARITY UI styling, INITIAL
// run-state seed, SEED_BAG / SEED_SHOP demo content, BAG_COLS/ROWS, and the
// prototype's own ItemDef / BagItem / Cell / RunState shapes) genuinely don't
// belong in @packbreaker/content. The actual content data — items, recipes,
// rarity-band costs — now flows from the package, satisfying the spec's
// intent ("the prototype now consumes content from the package").
//
// What flows from @packbreaker/content:
//   - ITEMS (45 items adapted to the prototype's ItemDef shape)
//   - RECIPES (12 bible recipes filtered to those whose I/O is reachable
//              from the prototype's seed shop+bag — currently 4 recipes:
//              steel-sword, healing-salve, fire-oil, ember-brand)
//
// What stays local:
//   - RARITY (UI color/gem/glow tokens — visual layer, not content)
//   - INITIAL run state (round 4, 8 gold, etc. — demo seed)
//   - SEED_BAG / SEED_SHOP (demo placements)
//   - BAG_COLS / BAG_ROWS (could come from DEFAULT_RULESET.bagDimensions in M1.3)
//   - cellsOf / dimsOf (helpers operating on the prototype's BagItem shape)
//   - ItemId / Recipe / BagItem / RunState / ShopSlot / Cell / RarityKey types
//
// The full Item / Recipe / Trigger / Effect schemas in @packbreaker/content are
// surfaced to the run controller in M1.2; this adapter retires when App.tsx is
// split and the run controller starts consuming content directly.

import {
  ITEMS as CONTENT_ITEMS,
  RECIPES as CONTENT_RECIPES,
  type Item as ContentItem,
} from '@packbreaker/content';

// ─── Prototype's narrow string-literal ItemId union ─────────────────
// All 12 slugs exist in @packbreaker/content — verified by adaptITEMS() at
// module load (throws if any seed slug went missing in a content edit).
export type ItemId =
  | 'iron-sword'
  | 'iron-dagger'
  | 'wooden-shield'
  | 'healing-herb'
  | 'spark-stone'
  | 'whetstone'
  | 'apple'
  | 'copper-coin'
  | 'steel-sword'
  | 'healing-salve'
  | 'ember-brand'
  | 'fire-oil';

const SEED_ITEM_SLUGS: ReadonlyArray<ItemId> = [
  'iron-sword', 'iron-dagger', 'wooden-shield', 'healing-herb', 'spark-stone',
  'whetstone', 'apple', 'copper-coin',
  'steel-sword', 'healing-salve', 'fire-oil', 'ember-brand',
];

// RarityKey, RARITY, and RarityDef now live in @packbreaker/ui-kit/src/rarity.ts
// (M1.3.2 commit 1, partial dissolution of data.local.ts). Re-exported here
// for back-compat with the existing import sites; sweep to direct
// @packbreaker/ui-kit imports lands in commit 3 (palette token consolidation).
export { RARITY, type RarityKey, type RarityDef } from '@packbreaker/ui-kit';
import type { RarityKey } from '@packbreaker/ui-kit';

// ─── ItemDef (prototype shape) — adapted from content's full Item ────

export interface ItemDef {
  id: ItemId;
  name: string;
  rarity: RarityKey;
  cost: number;
  w: number;
  h: number;
  blurb: string;
  tags: string[];
}

function bboxFromShape(shape: ContentItem['shape']): { w: number; h: number } {
  let maxCol = 0;
  let maxRow = 0;
  for (const cell of shape) {
    if (cell.col > maxCol) maxCol = cell.col;
    if (cell.row > maxRow) maxRow = cell.row;
  }
  return { w: maxCol + 1, h: maxRow + 1 };
}

function adaptItem(item: ContentItem): ItemDef {
  const { w, h } = bboxFromShape(item.shape);
  return {
    id: item.id as unknown as ItemId,
    name: item.name,
    rarity: item.rarity,
    cost: item.cost,
    w,
    h,
    blurb: '',
    tags: [...item.tags],
  };
}

function adaptITEMS(): Record<ItemId, ItemDef> {
  const out: Partial<Record<ItemId, ItemDef>> = {};
  for (const slug of SEED_ITEM_SLUGS) {
    const contentItem = (CONTENT_ITEMS as Readonly<Record<string, ContentItem>>)[slug];
    if (!contentItem) {
      throw new Error(
        `Run-screen seed item "${slug}" missing from @packbreaker/content. ` +
          'Either restore the item or adjust SEED_ITEM_SLUGS in data.local.ts.',
      );
    }
    out[slug] = adaptItem(contentItem);
  }
  return out as Record<ItemId, ItemDef>;
}

export const ITEMS: Record<ItemId, ItemDef> = adaptITEMS();

// ─── Recipes ─────────────────────────────────────────────────────────
// Filter content's full RECIPES to those whose inputs and outputs are all
// reachable within the prototype's seed item set. M1.1 result: 4 recipes
// survive (steel-sword, healing-salve, fire-oil, ember-brand).

export interface Recipe {
  id: string;
  inputs: ItemId[];
  output: ItemId;
}

const SEED_SET = new Set<string>(SEED_ITEM_SLUGS);

export const RECIPES: Recipe[] = CONTENT_RECIPES
  .filter(
    (r) =>
      SEED_SET.has(String(r.output)) &&
      r.inputs.every((i) => SEED_SET.has(String(i.itemId))),
  )
  .map((r) => ({
    id: String(r.id),
    inputs: r.inputs.map((i) => i.itemId as unknown as ItemId),
    output: r.output as unknown as ItemId,
  }));

// ─── Run-state shape, demo seed, and bag geometry ───────────────────

export const BAG_COLS = 6;
export const BAG_ROWS = 4;

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
}

export const INITIAL: RunState = {
  round: 4,
  totalRounds: 11,
  hearts: 3,
  maxHearts: 3,
  gold: 8,
  trophy: 142,
  rerollCount: 0,
  className: 'Tinker',
  contractName: 'Neutral',
  contractText: 'No modifiers',
};

export interface BagItem {
  uid: string;
  itemId: ItemId;
  col: number;
  row: number;
  rot: number;
}

export const SEED_BAG: BagItem[] = [
  { uid: 'b1', itemId: 'iron-sword',   col: 1, row: 0, rot: 0 },
  { uid: 'b2', itemId: 'healing-herb', col: 4, row: 0, rot: 0 },
  { uid: 'b3', itemId: 'spark-stone',  col: 0, row: 3, rot: 0 },
  { uid: 'b4', itemId: 'copper-coin',  col: 5, row: 3, rot: 0 },
];

export interface ShopSlot {
  uid: string;
  itemId: ItemId | null;
}

export const SEED_SHOP: ShopSlot[] = [
  { uid: 's1', itemId: 'iron-sword' },
  { uid: 's2', itemId: 'healing-herb' },
  { uid: 's3', itemId: 'whetstone' },
  { uid: 's4', itemId: 'apple' },
  { uid: 's5', itemId: 'iron-dagger' },
];

export type Cell = [number, number];

export function dimsOf(itemId: ItemId, rot = 0): { w: number; h: number } {
  const def = ITEMS[itemId];
  let w = def.w;
  let h = def.h;
  if (rot % 180 !== 0) [w, h] = [h, w];
  return { w, h };
}

export function cellsOf(bagItem: BagItem): Cell[] {
  const { w, h } = dimsOf(bagItem.itemId, bagItem.rot);
  const out: Cell[] = [];
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      out.push([bagItem.col + dx, bagItem.row + dy]);
    }
  }
  return out;
}
