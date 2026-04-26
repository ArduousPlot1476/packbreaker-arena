// Data — items, recipes, rarity. Only what balance-bible.md authorizes for the seed list.

export type RarityKey = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RarityDef {
  color: string;
  label: string;
  gem: string;
  glow: string;
}

export const RARITY: Record<RarityKey, RarityDef> = {
  common: { color: '#94A3B8', label: 'COMMON', gem: '◆', glow: 'glow-common' },
  uncommon: { color: '#22C55E', label: 'UNCOMMON', gem: '■', glow: 'glow-uncommon' },
  rare: { color: '#3B82F6', label: 'RARE', gem: '▲', glow: 'glow-rare' },
  epic: { color: '#A855F7', label: 'EPIC', gem: '★', glow: 'glow-epic' },
  legendary: { color: '#F59E0B', label: 'LEGENDARY', gem: '✦', glow: 'glow-legendary' },
};

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

export const ITEMS: Record<ItemId, ItemDef> = {
  'iron-sword':    { id:'iron-sword',    name:'Iron Sword',    rarity:'common',   cost:3, w:1, h:2, blurb:'Anchor weapon. on_cooldown(50): damage 4.', tags:['weapon','metal'] },
  'iron-dagger':   { id:'iron-dagger',   name:'Iron Dagger',   rarity:'common',   cost:3, w:1, h:1, blurb:'Fast. on_cooldown(30): damage 2.', tags:['weapon','metal'] },
  'wooden-shield': { id:'wooden-shield', name:'Wooden Shield', rarity:'common',   cost:3, w:1, h:1, blurb:'on_taken_damage: heal 2.', tags:['armor'] },
  'healing-herb':  { id:'healing-herb',  name:'Healing Herb',  rarity:'common',   cost:3, w:1, h:1, blurb:'on_cooldown(80): heal 3.', tags:['plant','consumable'] },
  'spark-stone':   { id:'spark-stone',   name:'Spark Stone',   rarity:'common',   cost:3, w:1, h:1, blurb:'Adjacent weapons apply burn 1.', tags:['tool','fire'] },
  'whetstone':     { id:'whetstone',     name:'Whetstone',     rarity:'common',   cost:3, w:1, h:1, blurb:'+1 damage to adjacent weapons.', tags:['tool','metal'] },
  'apple':         { id:'apple',         name:'Apple',         rarity:'common',   cost:3, w:1, h:1, blurb:'on_round_start: heal 5.', tags:['food','consumable'] },
  'copper-coin':   { id:'copper-coin',   name:'Copper Coin',   rarity:'common',   cost:3, w:1, h:1, blurb:'+1 gold per round.', tags:['gold'] },
  'steel-sword':   { id:'steel-sword',   name:'Steel Sword',   rarity:'uncommon', cost:5, w:1, h:2, blurb:'on_cooldown(50): damage 6.', tags:['weapon','metal'] },
  'healing-salve': { id:'healing-salve', name:'Healing Salve', rarity:'uncommon', cost:5, w:1, h:1, blurb:'Reactive heal + low-HP pop.', tags:['plant','consumable'] },
  'ember-brand':   { id:'ember-brand',   name:'Ember Brand',   rarity:'rare',     cost:7, w:2, h:1, blurb:'on_cooldown(50): damage 6 + burn 2.', tags:['weapon','metal','fire'] },
  'fire-oil':      { id:'fire-oil',      name:'Fire Oil',      rarity:'uncommon', cost:5, w:1, h:1, blurb:'Adjacent weapons apply burn 2.', tags:['consumable','fire'] },
};

export interface Recipe {
  id: string;
  inputs: ItemId[];
  output: ItemId;
}

export const RECIPES: Recipe[] = [
  { id:'r-steel-sword',    inputs:['iron-sword','iron-sword'],     output:'steel-sword' },
  { id:'r-healing-salve',  inputs:['healing-herb','healing-herb'], output:'healing-salve' },
  { id:'r-fire-oil',       inputs:['spark-stone','whetstone'],     output:'fire-oil' },
];

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
  { uid:'b1', itemId:'iron-sword',  col:1, row:0, rot:0 },
  { uid:'b2', itemId:'healing-herb', col:4, row:0, rot:0 },
  { uid:'b3', itemId:'spark-stone', col:0, row:3, rot:0 },
  { uid:'b4', itemId:'copper-coin', col:5, row:3, rot:0 },
];

export interface ShopSlot {
  uid: string;
  itemId: ItemId | null;
}

export const SEED_SHOP: ShopSlot[] = [
  { uid:'s1', itemId:'iron-sword' },
  { uid:'s2', itemId:'healing-herb' },
  { uid:'s3', itemId:'whetstone' },
  { uid:'s4', itemId:'apple' },
  { uid:'s5', itemId:'iron-dagger' },
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
