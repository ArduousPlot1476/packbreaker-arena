// @packbreaker/content/recipes — full M1 recipe set per balance-bible.md § 11.
//
// 12 recipes total: 6 Simple (2× Common → Uncommon), 4 Mid (Uncommon + Common
// → Rare), 2 Capstone (3× Rare → Epic). All ship rotationLocked: false per
// the bible — directional recipes are an M3 lever (gdd.md § 6).
//
// RecipeInputCell coordinates are canonical, not authoritative — detection
// is rotation-invariant in the sim (schemas.ts § 4 / spec phase 5 step 4).
// Linear layouts (0,0)-(1,0)-(2,0) chosen as the canonical arrangement.

import {
  ItemId,
  RecipeId,
  type Recipe,
  type RecipeInputCell,
} from './schemas';

function inputs(...itemSlugs: string[]): ReadonlyArray<RecipeInputCell> {
  return itemSlugs.map((slug, i) => ({
    relativeCol: i,
    relativeRow: 0,
    itemId: ItemId(slug),
  }));
}

export const RECIPES: ReadonlyArray<Recipe> = [
  // Simple (6) — 2 Commons → 1 Uncommon
  {
    id: RecipeId('r-steel-sword'),
    name: 'Forge Steel',
    inputs: inputs('iron-sword', 'iron-dagger'),
    output: ItemId('steel-sword'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-healing-salve'),
    name: 'Salve Brewing',
    inputs: inputs('healing-herb', 'healing-herb'),
    output: ItemId('healing-salve'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-iron-shield'),
    name: 'Reinforce',
    inputs: inputs('wooden-shield', 'wooden-shield'),
    output: ItemId('iron-shield'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-stamina-tonic'),
    name: 'Sustenance',
    inputs: inputs('apple', 'bread'),
    output: ItemId('stamina-tonic'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-fire-oil'),
    name: 'Ignition',
    inputs: inputs('spark-stone', 'whetstone'),
    output: ItemId('fire-oil'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-treasure-sack'),
    name: 'Hoard',
    inputs: inputs('copper-coin', 'lucky-penny'),
    output: ItemId('treasure-sack'),
    rotationLocked: false,
  },

  // Mid (4) — 1 Uncommon + 1 Common → 1 Rare
  {
    id: RecipeId('r-greatsword'),
    name: 'Heavy Forging',
    inputs: inputs('steel-sword', 'iron-mace'),
    output: ItemId('greatsword'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-tower-shield'),
    name: 'Wall Forging',
    inputs: inputs('iron-shield', 'iron-cap'),
    output: ItemId('tower-shield'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-ember-brand'),
    name: 'Imbue Flame',
    inputs: inputs('fire-oil', 'iron-sword'),
    output: ItemId('ember-brand'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-venom-flask'),
    name: 'Distillation',
    inputs: inputs('poison-vial', 'throwing-knife'),
    output: ItemId('venom-flask'),
    rotationLocked: false,
  },

  // Capstone (2) — 3 Rares → 1 Epic, class-flavored
  {
    id: RecipeId('r-berserkers-greataxe'),
    name: 'Crimson Fury',
    inputs: inputs('greatsword', 'warhammer', 'vampire-fang'),
    output: ItemId('berserkers-greataxe'),
    rotationLocked: false,
  },
  {
    id: RecipeId('r-master-alchemists-kit'),
    name: "Master's Touch",
    inputs: inputs('forge-anvil', 'rune-pedestal', 'venom-flask'),
    output: ItemId('master-alchemists-kit'),
    rotationLocked: false,
  },
];
