// Adapter from canonical @packbreaker/content's full Item/Recipe records to
// the client-narrowed ItemDef/Recipe shapes. Replaces the inline adapter
// that lived in apps/client/src/data.local.ts pre-M1.3.4a.
//
// ITEMS adapts ALL canonical items (45 in M1) so a sim-generated id from
// shop generation never throws on lookup. SHOP_POOL_ITEMS is filtered to
// the iconned subset (45 icons post-batch-5 — COMPLETE) so the UI only ever
// renders items that have inline-SVG renderings. Drop the SHOP_POOL_ITEMS
// filter when icon-art expansion lands the full 45-item icon set
// (post-M1.3.4b — visual-direction.md § 14 places it after sim integration
// and Phaser combat are real).

import {
  ITEMS as CONTENT_ITEMS,
  RECIPES as CONTENT_RECIPES,
  type Item as ContentItem,
  type Recipe as ContentRecipe,
} from '@packbreaker/content';
import type { ItemDef, ItemId, Recipe } from './types';

/** Prototype-iconned subset. apps/client/src/icons/icons.tsx ICONS map
 *  covers exactly these 45 (COMPLETE — all M1 items iconned). Any sim-generated id outside this set still
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
  // Common batch 1 (2026-07-11) — union +12 → 24. SHOP_POOL_ITEMS widens with
  // the set; ICONNED_RECIPES stays at the 4 whose outputs remain iconned
  // (steel-sword, healing-salve, fire-oil, ember-brand). The 5 recipes that
  // gain a newly-iconned INPUT (stamina-tonic, treasure-sack, greatsword,
  // venom-flask, tower-shield) all keep a non-iconned OUTPUT, so they stay
  // filtered out — no recipe silently switches on.
  'wooden-club',
  'hand-axe',
  'iron-mace',
  'throwing-knife',
  'buckler',
  'leather-vest',
  'iron-cap',
  'bread',
  'mana-potion',
  'coin-pouch',
  'lucky-penny',
  'bandage',
  // Uncommon batch 2 (2026-07-11) — union +9 → 33. ICONNED_RECIPES grows 4 → 7
  // BY CONSTRUCTION: iconning the outputs iron-shield, stamina-tonic, treasure-
  // sack (whose inputs — wooden-shield×2, apple+bread, copper-coin+lucky-penny —
  // are all already iconned) unlocks r-iron-shield, r-stamina-tonic, r-treasure-
  // sack. r-tower-shield + r-venom-flask do NOT switch on: their inputs are now
  // all iconned (iron-shield, poison-vial joined) but their outputs (tower-shield,
  // venom-flask) stay non-iconned, so the output-side filter keeps them out.
  'war-axe',
  'crossbow',
  'spear',
  'iron-shield',
  'chainmail',
  'stamina-tonic',
  'poison-vial',
  'frost-shard',
  'treasure-sack',
  // Rare batch 3 (2026-07-11) — union +7 → 40. ICONNED_RECIPES grows 7 → 10 BY
  // CONSTRUCTION: iconning the outputs greatsword, tower-shield, venom-flask —
  // whose inputs (steel-sword+iron-mace, iron-shield+iron-cap, poison-vial+
  // throwing-knife) are all already iconned — unlocks r-greatsword,
  // r-tower-shield, r-venom-flask. The two capstones r-berserkers-greataxe
  // (greatsword+warhammer+vampire-fang) and r-master-alchemists-kit (forge-anvil
  // +rune-pedestal+venom-flask) do NOT switch on: their inputs are now all
  // iconned but their Epic outputs (berserkers-greataxe, master-alchemists-kit)
  // stay non-iconned, so the output-side filter keeps them out.
  'greatsword',
  'warhammer',
  'vampire-fang',
  'tower-shield',
  'forge-anvil',
  'rune-pedestal',
  'venom-flask',
  // Epic batch 4 (2026-07-12) — union +4 → 44. ICONNED_RECIPES grows 10 → 12 BY
  // CONSTRUCTION: iconning the two Epic capstone OUTPUTS berserkers-greataxe and
  // master-alchemists-kit — whose inputs (greatsword+warhammer+vampire-fang and
  // forge-anvil+rune-pedestal+venom-flask) are all already iconned since batch 3
  // — unlocks r-berserkers-greataxe and r-master-alchemists-kit. bloodmoon-plate
  // and resonance-crystal are shop-only (appear in no recipe as output or input),
  // so they add coverage but no recipe. This is the last batch before Legendary
  // (world-forged-heart) takes coverage to 45/45 and the filters can drop.
  'berserkers-greataxe',
  'bloodmoon-plate',
  'master-alchemists-kit',
  'resonance-crystal',
  // Legendary batch 5 (2026-07-12, FINAL) — union +1 → 45 COMPLETE. ICONNED_RECIPES
  // stays 12/12 (world-forged-heart is in no recipe — neither output nor input).
  // world-forged-heart is boss-reward-only (balance-bible § 10): it joins this set
  // (icon coverage + combat/cost registry via SHOP_POOL_ITEMS) but is held OUT of
  // the shop-offer + ghost pools by SHOP_EXCLUDED_ITEM_IDS below (CF 66).
  'world-forged-heart',
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
 *  12 recipes survive post-batch-4 (steel-sword, healing-salve, fire-oil,
 *  ember-brand + iron-shield, stamina-tonic, treasure-sack + greatsword,
 *  tower-shield, venom-flask + the 2 Epic capstones berserkers-greataxe,
 *  master-alchemists-kit). */
/** Iconned subset of the CANONICAL content recipes (content Recipe[]) — thread
 *  into sim's recipesRegistry (CF 37 / M1.5e PR 1) so sim's combine detection
 *  matches the client's iconned set, resolving the sim-default-vs-client-filter
 *  divergence (sim's unfiltered default would otherwise match non-iconned
 *  recipes like r-iron-shield). RECIPES below is the client-narrowed view of
 *  this same subset, for the UI's detectRecipes / scoutRecipes. */
export const ICONNED_RECIPES: ReadonlyArray<ContentRecipe> = CONTENT_RECIPES.filter(
  (r) =>
    ICONNED_SET.has(String(r.output)) &&
    r.inputs.every((i) => ICONNED_SET.has(String(i.itemId))),
);

export const RECIPES: ReadonlyArray<Recipe> = ICONNED_RECIPES.map((r) => ({
  id: String(r.id),
  inputs: r.inputs.map((i) => i.itemId as unknown as ItemId),
  output: r.output as unknown as ItemId,
}));

/** Complete iconned registry (45/45): every id here has an inline-SVG icon, so
 *  combat/cost lookups + sim generateShop never resolve an unrenderable item.
 *  NOTE: the shop OFFER and ghost pools use SHOP_OFFER_ITEMS (below), NOT this —
 *  this registry also carries boss-reward-only items (world-forged-heart) that
 *  must resolve for combat/cost but must not be offered/ghosted (CF 66). */
export const SHOP_POOL_ITEMS: Readonly<Record<string, ContentItem>> = (() => {
  const out: Record<string, ContentItem> = {};
  for (const id of ICONNED_ITEM_IDS) {
    const item = (CONTENT_ITEMS as Readonly<Record<string, ContentItem | undefined>>)[id];
    if (item) out[id] = item;
  }
  return out;
})();

/** Boss-reward-only items: iconned + registered in SHOP_POOL_ITEMS (so combat +
 *  cost/resolution lookups resolve them) but held OUT of the shop offer and ghost
 *  builds. CF 66: world-forged-heart is a Legendary whose only intended acquisition
 *  is the round-11 boss reward (balance-bible § 10), but the sim's buildPool rarity
 *  gate reaches 'legendary' at round 11 — so once it's iconned (in SHOP_POOL_ITEMS)
 *  it would otherwise become purchasable there. The exclusion is applied at the
 *  CLIENT pool-generation sites (the sim-bridge generateShop input + combat/ghost.ts
 *  derivation), NOT in the sim's buildPool: buildPool is shared with the determinism
 *  harness, which runs the full registry and reaches round 11 in the frozen fixtures,
 *  so excluding there would churn the DO-NOT-REGENERATE corpus. SHOP_POOL_ITEMS stays
 *  complete. CF 66's broader question (whether RARITY_GATE_BY_ROUND[11]='legendary'
 *  should exist at all) remains open/backlog. */
export const SHOP_EXCLUDED_ITEM_IDS: ReadonlySet<string> = new Set<string>([
  'world-forged-heart',
]);

/** Shop-offer + ghost pool: SHOP_POOL_ITEMS minus SHOP_EXCLUDED_ITEM_IDS. Pass THIS
 *  to the sim's generateShop (via sim-bridge) and use it for ghost-build eligibility
 *  so boss-reward-only items never surface as purchasable or as opponent items. It
 *  is identical to the pre-batch-5 44-item pool (world-forged-heart is the only
 *  exclusion), so shop + ghost RNG are unchanged — no client fixture churn. */
export const SHOP_OFFER_ITEMS: Readonly<Record<string, ContentItem>> = (() => {
  const out: Record<string, ContentItem> = {};
  for (const id of Object.keys(SHOP_POOL_ITEMS)) {
    if (SHOP_EXCLUDED_ITEM_IDS.has(id)) continue;
    out[id] = SHOP_POOL_ITEMS[id]!;
  }
  return out;
})();
