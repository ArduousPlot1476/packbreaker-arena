// Adapter from canonical @packbreaker/content's full Item/Recipe records to
// the client-narrowed ItemDef/Recipe shapes. Replaces the inline adapter
// that lived in apps/client/src/data.local.ts pre-M1.3.4a.
//
// ITEMS adapts ALL canonical items (45 in M1) so a sim-generated id from
// shop generation never throws on lookup. SHOP_POOL_ITEMS is filtered to
// the iconned subset (12 prototype-iconned items) so the UI only ever
// renders items that have inline-SVG renderings. Drop the SHOP_POOL_ITEMS
// filter when icon-art expansion lands the full 45-item icon set
// (post-M1.3.4b — visual-direction.md § 14 places it after sim integration
// and Phaser combat are real).

import {
  ITEMS as CONTENT_ITEMS,
  RECIPES as CONTENT_RECIPES,
  type Item as ContentItem,
} from '@packbreaker/content';
import type { ItemDef, ItemId, Recipe } from './types';

/** Prototype-iconned subset. apps/client/src/icons/icons.tsx ICONS map
 *  covers exactly these 12. Any sim-generated id outside this set still
 *  has an ItemDef (for cost/rarity/name lookup) but renders via the
 *  copper-coin fallback in the ICONS map. */
export const ICONNED_ITEM_IDS = [
  'iron-sword',
  'iron-dagger',
  'wooden-shield',
  'healing-herb',
  'spark-stone',
  'whetstone',
  'apple',
  'copper-coin',
  'steel-sword',
  'healing-salve',
  'fire-oil',
  'ember-brand',
] as const;

const ICONNED_SET = new Set<string>(ICONNED_ITEM_IDS);

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
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    cost: item.cost,
    w,
    h,
    blurb: '',
    tags: [...item.tags],
  };
}

/** All 45 canonical items adapted to ItemDef. Lookup by canonical id. */
export const ITEMS: Readonly<Record<string, ItemDef>> = (() => {
  const out: Record<string, ItemDef> = {};
  for (const id of Object.keys(CONTENT_ITEMS)) {
    const item = (CONTENT_ITEMS as Readonly<Record<string, ContentItem>>)[id];
    if (item) out[id] = adaptItem(item);
  }
  return out;
})();

/** Recipes filtered to those whose inputs and outputs are all in the
 *  iconned subset. Same filter logic as the M1.1 data.local.ts adapter —
 *  4 recipes survive in the M1 prototype set (steel-sword, healing-salve,
 *  fire-oil, ember-brand). */
export const RECIPES: ReadonlyArray<Recipe> = CONTENT_RECIPES.filter(
  (r) =>
    ICONNED_SET.has(String(r.output)) &&
    r.inputs.every((i) => ICONNED_SET.has(String(i.itemId))),
).map((r) => ({
  id: String(r.id),
  inputs: r.inputs.map((i) => i.itemId as unknown as ItemId),
  output: r.output as unknown as ItemId,
}));

/** Shop pool: filtered to iconned items so sim's generateShop never
 *  produces an item without an inline-SVG icon. Pass to sim-bridge's
 *  generateShop adapter as the `items` argument. */
export const SHOP_POOL_ITEMS: Readonly<Record<string, ContentItem>> = (() => {
  const out: Record<string, ContentItem> = {};
  for (const id of ICONNED_ITEM_IDS) {
    const item = (CONTENT_ITEMS as Readonly<Record<string, ContentItem | undefined>>)[id];
    if (item) out[id] = item;
  }
  return out;
})();
