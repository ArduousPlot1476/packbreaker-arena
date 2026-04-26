// @packbreaker/content/items — full M1 item set per balance-bible.md §§ 6–10.
//
// 45 items total: 20 Common, 12 Uncommon, 8 Rare, 4 Epic, 1 Legendary.
// Costs follow RARITY_DEFAULT_COST. classAffinity is set only where the bible
// explicitly flags Tinker-favored / Marauder-favored / Marauder-lean / -anchor.
// All others are neutral (null). artId mirrors id pending the post-M1 atlas.
//
// Triggers and effects are literal ports of the bible's "trigger summary" line.
// Where the bible attaches a per-combat cap (Bread × 5, Bandage × 1), it is
// encoded via Trigger.maxTriggersPerCombat (schema § 3 v0.1).
// on_low_health uses thresholdPct: 50 throughout — Iron Cap explicitly states
// 50%, and the bible doesn't set a different threshold for any other low-HP
// trigger (see Phase 5 deviations / decision-log entry).

import {
  ClassId,
  ItemId,
  RARITY_DEFAULT_COST,
  type Item,
  type ItemShape,
  type Rarity,
} from './schemas';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');

const SHAPE_1x1: ItemShape = [{ col: 0, row: 0 }];
const SHAPE_1x2_V: ItemShape = [
  { col: 0, row: 0 },
  { col: 0, row: 1 },
];
const SHAPE_2x1_H: ItemShape = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
];
const SHAPE_2x2: ItemShape = [
  { col: 0, row: 0 },
  { col: 1, row: 0 },
  { col: 0, row: 1 },
  { col: 1, row: 1 },
];

function defineItem<R extends Rarity>(
  slug: string,
  spec: Omit<Item, 'id' | 'cost' | 'artId'> & { rarity: R },
): Item {
  return {
    ...spec,
    id: ItemId(slug),
    cost: RARITY_DEFAULT_COST[spec.rarity],
    artId: slug,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Commons (20) — bible § 6
// ─────────────────────────────────────────────────────────────────────

const IRON_SWORD = defineItem('iron-sword', {
  name: 'Iron Sword',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 50, effects: [{ type: 'damage', amount: 4, target: 'opponent' }] },
  ],
});

const IRON_DAGGER = defineItem('iron-dagger', {
  name: 'Iron Dagger',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 30, effects: [{ type: 'damage', amount: 2, target: 'opponent' }] },
  ],
});

const WOODEN_CLUB = defineItem('wooden-club', {
  name: 'Wooden Club',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['weapon'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 60, effects: [{ type: 'damage', amount: 5, target: 'opponent' }] },
  ],
});

const HAND_AXE = defineItem('hand-axe', {
  name: 'Hand Axe',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 40, effects: [{ type: 'damage', amount: 3, target: 'opponent' }] },
  ],
});

const IRON_MACE = defineItem('iron-mace', {
  name: 'Iron Mace',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_2x1_H,
  tags: ['weapon', 'metal'],
  triggers: [
    {
      type: 'on_cooldown',
      cooldownTicks: 50,
      effects: [
        { type: 'damage', amount: 2, target: 'opponent' },
        { type: 'apply_status', status: 'stun', stacks: 1, target: 'opponent' },
      ],
    },
  ],
});

const THROWING_KNIFE = defineItem('throwing-knife', {
  name: 'Throwing Knife',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_round_start', effects: [{ type: 'damage', amount: 8, target: 'opponent' }] },
  ],
});

const WOODEN_SHIELD = defineItem('wooden-shield', {
  name: 'Wooden Shield',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['armor'],
  triggers: [
    { type: 'on_taken_damage', effects: [{ type: 'heal', amount: 2, target: 'self' }] },
  ],
});

const BUCKLER = defineItem('buckler', {
  name: 'Buckler',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['armor', 'metal'],
  triggers: [],
  passiveStats: { maxHpBonus: 5 },
});

const LEATHER_VEST = defineItem('leather-vest', {
  name: 'Leather Vest',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['armor'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 60, effects: [{ type: 'heal', amount: 2, target: 'self' }] },
  ],
});

const IRON_CAP = defineItem('iron-cap', {
  name: 'Iron Cap',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['armor', 'metal'],
  triggers: [
    {
      type: 'on_low_health',
      thresholdPct: 50,
      maxTriggersPerCombat: 1,
      effects: [{ type: 'heal', amount: 10, target: 'self' }],
    },
  ],
});

const HEALING_HERB = defineItem('healing-herb', {
  name: 'Healing Herb',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['plant', 'consumable'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 80, effects: [{ type: 'heal', amount: 3, target: 'self' }] },
  ],
});

const APPLE = defineItem('apple', {
  name: 'Apple',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['food', 'consumable'],
  triggers: [
    { type: 'on_round_start', effects: [{ type: 'heal', amount: 5, target: 'self' }] },
    { type: 'on_cooldown', cooldownTicks: 60, effects: [{ type: 'heal', amount: 2, target: 'self' }] },
  ],
});

const BREAD = defineItem('bread', {
  name: 'Bread',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['food', 'consumable'],
  triggers: [
    {
      type: 'on_taken_damage',
      maxTriggersPerCombat: 5,
      effects: [{ type: 'heal', amount: 1, target: 'self' }],
    },
  ],
});

const MANA_POTION = defineItem('mana-potion', {
  name: 'Mana Potion',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['consumable'],
  triggers: [
    {
      type: 'on_round_start',
      effects: [{ type: 'buff_adjacent', stat: 'cooldown_pct', amount: -15 }],
    },
  ],
});

const COPPER_COIN = defineItem('copper-coin', {
  name: 'Copper Coin',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['gold'],
  triggers: [],
  passiveStats: { goldPerRound: 1 },
});

const COIN_POUCH = defineItem('coin-pouch', {
  name: 'Coin Pouch',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['gold'],
  triggers: [],
  passiveStats: { goldPerRound: 2 },
});

const LUCKY_PENNY = defineItem('lucky-penny', {
  name: 'Lucky Penny',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['gold'],
  triggers: [
    { type: 'on_round_start', effects: [{ type: 'add_gold', amount: 2 }] },
  ],
});

const WHETSTONE = defineItem('whetstone', {
  name: 'Whetstone',
  rarity: 'common',
  classAffinity: TINKER,
  shape: SHAPE_1x1,
  tags: ['tool', 'metal'],
  triggers: [
    {
      type: 'on_adjacent_trigger',
      matchTags: ['weapon'],
      effects: [{ type: 'buff_adjacent', stat: 'damage', amount: 1 }],
    },
  ],
});

const SPARK_STONE = defineItem('spark-stone', {
  name: 'Spark Stone',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['tool', 'fire'],
  triggers: [
    {
      type: 'on_adjacent_trigger',
      matchTags: ['weapon'],
      effects: [{ type: 'apply_status', status: 'burn', stacks: 1, target: 'opponent' }],
    },
  ],
});

const BANDAGE = defineItem('bandage', {
  name: 'Bandage',
  rarity: 'common',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['consumable'],
  triggers: [
    {
      type: 'on_low_health',
      thresholdPct: 50,
      maxTriggersPerCombat: 1,
      effects: [{ type: 'heal', amount: 8, target: 'self' }],
    },
  ],
});

// ─────────────────────────────────────────────────────────────────────
// Uncommons (12) — bible § 7
// ─────────────────────────────────────────────────────────────────────

const STEEL_SWORD = defineItem('steel-sword', {
  name: 'Steel Sword',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 50, effects: [{ type: 'damage', amount: 6, target: 'opponent' }] },
  ],
});

const WAR_AXE = defineItem('war-axe', {
  name: 'War Axe',
  rarity: 'uncommon',
  classAffinity: MARAUDER,
  shape: SHAPE_1x1,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 40, effects: [{ type: 'damage', amount: 5, target: 'opponent' }] },
  ],
});

const CROSSBOW = defineItem('crossbow', {
  name: 'Crossbow',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_2x1_H,
  tags: ['weapon'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 70, effects: [{ type: 'damage', amount: 8, target: 'opponent' }] },
  ],
});

const SPEAR = defineItem('spear', {
  name: 'Spear',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_round_start', effects: [{ type: 'damage', amount: 4, target: 'opponent' }] },
    { type: 'on_cooldown', cooldownTicks: 60, effects: [{ type: 'damage', amount: 4, target: 'opponent' }] },
  ],
});

const IRON_SHIELD = defineItem('iron-shield', {
  name: 'Iron Shield',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['armor', 'metal'],
  triggers: [
    { type: 'on_taken_damage', effects: [{ type: 'heal', amount: 1, target: 'self' }] },
  ],
  passiveStats: { maxHpBonus: 8 },
});

const CHAINMAIL = defineItem('chainmail', {
  name: 'Chainmail',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x2_V,
  tags: ['armor', 'metal'],
  triggers: [],
  passiveStats: { maxHpBonus: 12 },
});

const HEALING_SALVE = defineItem('healing-salve', {
  name: 'Healing Salve',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['plant', 'consumable'],
  triggers: [
    { type: 'on_taken_damage', effects: [{ type: 'heal', amount: 3, target: 'self' }] },
    {
      type: 'on_low_health',
      thresholdPct: 50,
      maxTriggersPerCombat: 1,
      effects: [{ type: 'heal', amount: 8, target: 'self' }],
    },
  ],
});

const STAMINA_TONIC = defineItem('stamina-tonic', {
  name: 'Stamina Tonic',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['consumable'],
  triggers: [
    {
      type: 'on_round_start',
      effects: [{ type: 'buff_adjacent', stat: 'cooldown_pct', amount: -25 }],
    },
  ],
});

const FIRE_OIL = defineItem('fire-oil', {
  name: 'Fire Oil',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['consumable', 'fire'],
  triggers: [
    {
      type: 'on_adjacent_trigger',
      matchTags: ['weapon'],
      effects: [{ type: 'apply_status', status: 'burn', stacks: 2, target: 'opponent' }],
    },
  ],
});

const POISON_VIAL = defineItem('poison-vial', {
  name: 'Poison Vial',
  rarity: 'uncommon',
  classAffinity: TINKER,
  shape: SHAPE_1x1,
  tags: ['consumable', 'poison', 'gem'],
  triggers: [
    {
      type: 'on_cooldown',
      cooldownTicks: 50,
      effects: [{ type: 'apply_status', status: 'poison', stacks: 1, target: 'opponent' }],
    },
  ],
});

const FROST_SHARD = defineItem('frost-shard', {
  name: 'Frost Shard',
  rarity: 'uncommon',
  classAffinity: TINKER,
  shape: SHAPE_1x1,
  tags: ['gem', 'ice'],
  triggers: [
    {
      type: 'on_cooldown',
      cooldownTicks: 60,
      effects: [{ type: 'apply_status', status: 'stun', stacks: 1, target: 'opponent' }],
    },
  ],
});

const TREASURE_SACK = defineItem('treasure-sack', {
  name: 'Treasure Sack',
  rarity: 'uncommon',
  classAffinity: null,
  shape: SHAPE_2x1_H,
  tags: ['gold'],
  triggers: [],
  passiveStats: { goldPerRound: 4 },
});

// ─────────────────────────────────────────────────────────────────────
// Rares (8) — bible § 8
// ─────────────────────────────────────────────────────────────────────

const GREATSWORD = defineItem('greatsword', {
  name: 'Greatsword',
  rarity: 'rare',
  classAffinity: null,
  shape: SHAPE_2x2,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 60, effects: [{ type: 'damage', amount: 12, target: 'opponent' }] },
  ],
});

const WARHAMMER = defineItem('warhammer', {
  name: 'Warhammer',
  rarity: 'rare',
  classAffinity: MARAUDER,
  shape: SHAPE_2x1_H,
  tags: ['weapon', 'metal'],
  triggers: [
    {
      type: 'on_cooldown',
      cooldownTicks: 70,
      effects: [
        { type: 'damage', amount: 8, target: 'opponent' },
        { type: 'apply_status', status: 'stun', stacks: 1, target: 'opponent' },
      ],
    },
  ],
});

const EMBER_BRAND = defineItem('ember-brand', {
  name: 'Ember Brand',
  rarity: 'rare',
  classAffinity: null,
  shape: SHAPE_2x1_H,
  tags: ['weapon', 'metal', 'fire'],
  triggers: [
    {
      type: 'on_cooldown',
      cooldownTicks: 50,
      effects: [
        { type: 'damage', amount: 6, target: 'opponent' },
        { type: 'apply_status', status: 'burn', stacks: 2, target: 'opponent' },
      ],
    },
  ],
});

const TOWER_SHIELD = defineItem('tower-shield', {
  name: 'Tower Shield',
  rarity: 'rare',
  classAffinity: null,
  shape: SHAPE_2x2,
  tags: ['armor', 'metal'],
  triggers: [
    { type: 'on_taken_damage', effects: [{ type: 'heal', amount: 2, target: 'self' }] },
  ],
  passiveStats: { maxHpBonus: 18 },
});

const FORGE_ANVIL = defineItem('forge-anvil', {
  name: 'Forge Anvil',
  rarity: 'rare',
  classAffinity: TINKER,
  shape: SHAPE_2x2,
  tags: ['tool', 'metal'],
  triggers: [
    {
      type: 'on_adjacent_trigger',
      matchTags: ['weapon'],
      effects: [{ type: 'buff_adjacent', stat: 'damage', amount: 2 }],
    },
  ],
});

const RUNE_PEDESTAL = defineItem('rune-pedestal', {
  name: 'Rune Pedestal',
  rarity: 'rare',
  classAffinity: TINKER,
  shape: SHAPE_1x1,
  tags: ['tool', 'gem'],
  triggers: [
    {
      type: 'on_adjacent_trigger',
      matchTags: ['gem', 'consumable'],
      effects: [{ type: 'buff_adjacent', stat: 'trigger_chance_pct', amount: 20 }],
    },
  ],
});

const VENOM_FLASK = defineItem('venom-flask', {
  name: 'Venom Flask',
  rarity: 'rare',
  classAffinity: TINKER,
  shape: SHAPE_1x1,
  tags: ['consumable', 'poison'],
  triggers: [
    {
      type: 'on_cooldown',
      cooldownTicks: 40,
      effects: [{ type: 'apply_status', status: 'poison', stacks: 2, target: 'opponent' }],
    },
  ],
});

const VAMPIRE_FANG = defineItem('vampire-fang', {
  name: 'Vampire Fang',
  rarity: 'rare',
  classAffinity: MARAUDER,
  shape: SHAPE_1x1,
  tags: ['weapon'],
  triggers: [
    { type: 'on_hit', effects: [{ type: 'heal', amount: 2, target: 'self' }] },
  ],
});

// ─────────────────────────────────────────────────────────────────────
// Epics (4) — bible § 9
// ─────────────────────────────────────────────────────────────────────

const BERSERKERS_GREATAXE = defineItem('berserkers-greataxe', {
  name: "Berserker's Greataxe",
  rarity: 'epic',
  classAffinity: MARAUDER,
  shape: SHAPE_2x2,
  tags: ['weapon', 'metal'],
  triggers: [
    { type: 'on_cooldown', cooldownTicks: 50, effects: [{ type: 'damage', amount: 14, target: 'opponent' }] },
    {
      type: 'on_low_health',
      thresholdPct: 50,
      maxTriggersPerCombat: 1,
      effects: [{ type: 'buff_adjacent', stat: 'damage', amount: 3 }],
    },
  ],
});

const BLOODMOON_PLATE = defineItem('bloodmoon-plate', {
  name: 'Bloodmoon Plate',
  rarity: 'epic',
  classAffinity: MARAUDER,
  shape: SHAPE_2x2,
  tags: ['armor', 'metal'],
  triggers: [
    { type: 'on_taken_damage', effects: [{ type: 'damage', amount: 3, target: 'opponent' }] },
  ],
  passiveStats: { maxHpBonus: 25 },
});

const MASTER_ALCHEMISTS_KIT = defineItem('master-alchemists-kit', {
  name: "Master Alchemist's Kit",
  rarity: 'epic',
  classAffinity: TINKER,
  shape: SHAPE_2x2,
  tags: ['tool', 'gem', 'consumable'],
  triggers: [
    {
      type: 'on_round_start',
      effects: [{ type: 'apply_status', status: 'poison', stacks: 3, target: 'opponent' }],
    },
    {
      type: 'on_adjacent_trigger',
      matchTags: ['consumable', 'gem'],
      effects: [{ type: 'buff_adjacent', stat: 'trigger_chance_pct', amount: 30 }],
    },
  ],
});

const RESONANCE_CRYSTAL = defineItem('resonance-crystal', {
  name: 'Resonance Crystal',
  rarity: 'epic',
  classAffinity: TINKER,
  shape: SHAPE_1x1,
  tags: ['gem'],
  triggers: [
    {
      type: 'on_adjacent_trigger',
      effects: [
        { type: 'buff_adjacent', stat: 'damage', amount: 1 },
        { type: 'buff_adjacent', stat: 'cooldown_pct', amount: -10 },
      ],
    },
  ],
});

// ─────────────────────────────────────────────────────────────────────
// Legendary (1) — bible § 10
// ─────────────────────────────────────────────────────────────────────

const WORLD_FORGED_HEART = defineItem('world-forged-heart', {
  name: 'World-Forged Heart',
  rarity: 'legendary',
  classAffinity: null,
  shape: SHAPE_1x1,
  tags: ['gem'],
  triggers: [
    {
      type: 'on_low_health',
      thresholdPct: 50,
      maxTriggersPerCombat: 1,
      effects: [{ type: 'damage', amount: 15, target: 'opponent' }],
    },
  ],
  passiveStats: { maxHpBonus: 15 },
});

// ─────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────

const ALL_ITEMS: ReadonlyArray<Item> = [
  // Commons (20)
  IRON_SWORD, IRON_DAGGER, WOODEN_CLUB, HAND_AXE, IRON_MACE, THROWING_KNIFE,
  WOODEN_SHIELD, BUCKLER, LEATHER_VEST, IRON_CAP,
  HEALING_HERB, APPLE, BREAD, MANA_POTION,
  COPPER_COIN, COIN_POUCH, LUCKY_PENNY,
  WHETSTONE, SPARK_STONE, BANDAGE,
  // Uncommons (12)
  STEEL_SWORD, WAR_AXE, CROSSBOW, SPEAR, IRON_SHIELD, CHAINMAIL,
  HEALING_SALVE, STAMINA_TONIC, FIRE_OIL,
  POISON_VIAL, FROST_SHARD, TREASURE_SACK,
  // Rares (8)
  GREATSWORD, WARHAMMER, EMBER_BRAND, TOWER_SHIELD,
  FORGE_ANVIL, RUNE_PEDESTAL, VENOM_FLASK, VAMPIRE_FANG,
  // Epics (4)
  BERSERKERS_GREATAXE, BLOODMOON_PLATE, MASTER_ALCHEMISTS_KIT, RESONANCE_CRYSTAL,
  // Legendary (1)
  WORLD_FORGED_HEART,
];

export const ITEMS: Readonly<Record<ItemId, Item>> = Object.freeze(
  Object.fromEntries(ALL_ITEMS.map((item) => [item.id, item])) as Record<ItemId, Item>,
);
