// Cross-reference + invariant tests for the M1 content package.
// Catches schema drift, typoed item slugs in recipes, missing rarity costs, etc.

import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  CONTRACTS,
  FORGE_TYRANT,
  ITEMS,
  ITEMS_BY_CLASS_AFFINITY,
  ITEMS_BY_RARITY,
  RARITY_DEFAULT_COST,
  RECIPES,
  RELICS,
  type Effect,
  type ItemTag,
  type Trigger,
} from '../src/index';

const VALID_TAGS = new Set<ItemTag>([
  'weapon', 'armor', 'consumable', 'gem', 'tool', 'plant',
  'metal', 'fire', 'ice', 'poison', 'gold', 'food',
]);

describe('items', () => {
  it('every entry id matches its key', () => {
    for (const [key, item] of Object.entries(ITEMS)) {
      expect(item.id).toBe(key);
    }
  });

  it('all 45 M1 items present (20+12+8+4+1)', () => {
    expect(Object.keys(ITEMS)).toHaveLength(45);
    expect(ITEMS_BY_RARITY.common).toHaveLength(20);
    expect(ITEMS_BY_RARITY.uncommon).toHaveLength(12);
    expect(ITEMS_BY_RARITY.rare).toHaveLength(8);
    expect(ITEMS_BY_RARITY.epic).toHaveLength(4);
    expect(ITEMS_BY_RARITY.legendary).toHaveLength(1);
  });

  it('every cost matches its rarity-band default', () => {
    for (const item of Object.values(ITEMS)) {
      expect(item.cost).toBe(RARITY_DEFAULT_COST[item.rarity]);
    }
  });

  it('every shape is non-empty and contains no duplicate cells', () => {
    for (const item of Object.values(ITEMS)) {
      expect(item.shape.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const cell of item.shape) {
        const k = `${cell.col},${cell.row}`;
        expect(seen.has(k), `${item.id} has duplicate cell ${k}`).toBe(false);
        seen.add(k);
      }
    }
  });

  it('every tag is a valid ItemTag', () => {
    for (const item of Object.values(ITEMS)) {
      for (const tag of item.tags) {
        expect(VALID_TAGS.has(tag), `${item.id} has invalid tag ${tag}`).toBe(true);
      }
    }
  });

  it('classAffinity is one of {tinker, marauder, null}', () => {
    for (const item of Object.values(ITEMS)) {
      const v = item.classAffinity;
      expect(v === null || v === 'tinker' || v === 'marauder').toBe(true);
    }
  });
});

describe('recipes', () => {
  it('all 12 M1 recipes present', () => {
    expect(RECIPES).toHaveLength(12);
  });

  it('every recipe id is unique', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every recipe input references an existing item', () => {
    for (const recipe of RECIPES) {
      for (const input of recipe.inputs) {
        expect(ITEMS[input.itemId], `${recipe.id} input ${input.itemId} missing`).toBeDefined();
      }
    }
  });

  it('every recipe output references an existing item', () => {
    for (const recipe of RECIPES) {
      expect(ITEMS[recipe.output], `${recipe.output} (output of ${recipe.id}) missing`).toBeDefined();
    }
  });

  it('all M1 recipes ship rotationLocked: false', () => {
    for (const recipe of RECIPES) {
      expect(recipe.rotationLocked).toBe(false);
    }
  });
});

describe('relics', () => {
  it('all 12 M1 relics present (6 Tinker + 6 Marauder)', () => {
    expect(Object.keys(RELICS)).toHaveLength(12);
    const tinker = Object.values(RELICS).filter((r) => r.classAffinity === 'tinker');
    const marauder = Object.values(RELICS).filter((r) => r.classAffinity === 'marauder');
    expect(tinker).toHaveLength(6);
    expect(marauder).toHaveLength(6);
  });

  it('classAffinity is one of {tinker, marauder, null}', () => {
    for (const relic of Object.values(RELICS)) {
      const v = relic.classAffinity;
      expect(v === null || v === 'tinker' || v === 'marauder').toBe(true);
    }
  });

  it('slot is one of {starter, mid, boss}', () => {
    for (const relic of Object.values(RELICS)) {
      expect(['starter', 'mid', 'boss']).toContain(relic.slot);
    }
  });

  it('every relic id matches its key', () => {
    for (const [key, relic] of Object.entries(RELICS)) {
      expect(relic.id).toBe(key);
    }
  });
});

describe('classes', () => {
  it('Tinker and Marauder both present', () => {
    expect(Object.keys(CLASSES)).toHaveLength(2);
    expect(CLASSES['tinker']).toBeDefined();
    expect(CLASSES['marauder']).toBeDefined();
  });

  it('every starter relic in pool exists in RELICS', () => {
    for (const cls of Object.values(CLASSES)) {
      for (const relicId of cls.starterRelicPool) {
        expect(RELICS[relicId], `class ${cls.id} starter ${relicId} missing`).toBeDefined();
      }
    }
  });

  it('every affinity tag is a valid ItemTag', () => {
    for (const cls of Object.values(CLASSES)) {
      for (const tag of cls.affinityTags) {
        expect(VALID_TAGS.has(tag), `class ${cls.id} has invalid affinity tag ${tag}`).toBe(true);
      }
    }
  });
});

describe('contracts', () => {
  it('three M1.1 contracts present (neutral, forge-tyrant-boss, daily-placeholder)', () => {
    expect(Object.keys(CONTRACTS)).toHaveLength(3);
    expect(CONTRACTS['neutral']).toBeDefined();
    expect(CONTRACTS['forge-tyrant-boss']).toBeDefined();
    expect(CONTRACTS['daily-placeholder']).toBeDefined();
  });

  it('forge-tyrant-boss carries the boss_only mutator', () => {
    const m = CONTRACTS['forge-tyrant-boss']!.ruleset.mutators;
    expect(m).toHaveLength(1);
    const mutator = m[0]!;
    expect(mutator.type).toBe('boss_only');
    if (mutator.type === 'boss_only') {
      expect(mutator.hpOverride).toBe(50);
      expect(mutator.damageBonus).toBe(2);
      expect(mutator.lifestealPctBonus).toBe(15);
    }
  });

  it('daily-placeholder is flagged isDaily: true', () => {
    expect(CONTRACTS['daily-placeholder']!.isDaily).toBe(true);
  });
});

describe('Forge Tyrant boss', () => {
  it('every placement references an existing item', () => {
    for (const p of FORGE_TYRANT.bag.placements) {
      expect(ITEMS[p.itemId], `boss placement ${p.placementId} item ${p.itemId} missing`).toBeDefined();
    }
  });

  it('placements fit within a 6×4 bag without overlap', () => {
    const occupied = new Set<string>();
    for (const p of FORGE_TYRANT.bag.placements) {
      const def = ITEMS[p.itemId]!;
      for (const cell of def.shape) {
        const x = p.anchor.col + cell.col;
        const y = p.anchor.row + cell.row;
        const k = `${x},${y}`;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x, `boss item ${p.itemId} extends past bag width`).toBeLessThan(6);
        expect(y, `boss item ${p.itemId} extends past bag height`).toBeLessThan(4);
        expect(occupied.has(k), `boss item ${p.itemId} overlaps cell ${k}`).toBe(false);
        occupied.add(k);
      }
    }
  });

  it("equips the Marauder boss relic (Conqueror's Crown) per balance-bible § 13", () => {
    expect(FORGE_TYRANT.relics.starter).toBeNull();
    expect(FORGE_TYRANT.relics.mid).toBeNull();
    expect(FORGE_TYRANT.relics.boss).toBe('conquerors-crown');
    const boss = RELICS['conquerors-crown']!;
    expect(boss.classAffinity).toBe(FORGE_TYRANT.classId);
    expect(boss.slot).toBe('boss');
  });
});

describe('schema v0.2 — bonusGoldOnWin (M1.1.1)', () => {
  it("Conqueror's Crown carries bonusGoldOnWin: 3", () => {
    const crown = RELICS['conquerors-crown'];
    expect(crown).toBeDefined();
    expect(crown!.modifiers.bonusGoldOnWin).toBe(3);
    expect(crown!.modifiers.bonusBaseDamage).toBe(4);
  });
});

describe('schema v0.2 — buff_adjacent matchTags (M1.1.1)', () => {
  // Items whose host on_adjacent_trigger filters by tag — the buff_adjacent
  // effect must carry the same filter explicitly per the M1.1.1 patch.
  const HOST_FILTERED: ReadonlyArray<{ id: string; tags: ReadonlyArray<string> }> = [
    { id: 'whetstone',             tags: ['weapon'] },
    { id: 'forge-anvil',           tags: ['weapon'] },
    { id: 'rune-pedestal',         tags: ['gem', 'consumable'] },
    { id: 'master-alchemists-kit', tags: ['consumable', 'gem'] },
  ];

  for (const { id, tags } of HOST_FILTERED) {
    it(`${id}: buff_adjacent effect inherits matchTags from on_adjacent_trigger`, () => {
      const item = ITEMS[id];
      expect(item, `${id} missing from ITEMS`).toBeDefined();
      const trigger = item!.triggers.find((t: Trigger) => t.type === 'on_adjacent_trigger');
      expect(trigger, `${id} has no on_adjacent_trigger`).toBeDefined();
      if (trigger?.type !== 'on_adjacent_trigger') return;
      expect(trigger.matchTags).toEqual(tags);
      const buff = trigger.effects.find((e: Effect) => e.type === 'buff_adjacent');
      expect(buff, `${id} on_adjacent_trigger has no buff_adjacent effect`).toBeDefined();
      if (buff?.type !== 'buff_adjacent') return;
      expect(buff.matchTags).toEqual(tags);
    });
  }
});

describe('aggregates', () => {
  it('ITEMS_BY_CLASS_AFFINITY buckets total 45 items', () => {
    let count = 0;
    for (const list of ITEMS_BY_CLASS_AFFINITY.values()) {
      count += list.length;
    }
    expect(count).toBe(45);
  });
});
