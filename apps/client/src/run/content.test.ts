// Iconned-content coverage — Epic batch 4 (2026-07-12) wiring guard.
// Locks: the union widen (44 iconned ids, all 24 batch-1 + 9 batch-2 + 7
// batch-3 entries intact); the ICONS map ⇄ ICONNED_ITEM_IDS 1:1 coverage (no
// iconned id silently falls back to copper-coin); and the by-construction
// ICONNED_RECIPES set (10 → 12 — the two Epic capstone OUTPUTS berserkers-
// greataxe / master-alchemists-kit are now iconned, and their inputs were all
// iconned since batch 3, so r-berserkers-greataxe / r-master-alchemists-kit
// switch on; bloodmoon-plate + resonance-crystal are shop-only, no recipe).

import { describe, expect, it } from 'vitest';
import { ICONNED_ITEM_IDS, ICONNED_RECIPES } from './content';
import { ICONS } from '../icons/icons';

const BATCH1_24 = [
  'iron-sword', 'iron-dagger', 'wooden-shield', 'healing-herb', 'spark-stone',
  'whetstone', 'apple', 'copper-coin', 'steel-sword', 'healing-salve', 'fire-oil',
  'ember-brand', 'wooden-club', 'hand-axe', 'iron-mace', 'throwing-knife',
  'buckler', 'leather-vest', 'iron-cap', 'bread', 'mana-potion', 'coin-pouch',
  'lucky-penny', 'bandage',
];

const BATCH2_9 = [
  'war-axe', 'crossbow', 'spear', 'iron-shield', 'chainmail', 'stamina-tonic',
  'poison-vial', 'frost-shard', 'treasure-sack',
];

const BATCH3_7 = [
  'greatsword', 'warhammer', 'vampire-fang', 'tower-shield', 'forge-anvil',
  'rune-pedestal', 'venom-flask',
];

const BATCH4_4 = [
  'berserkers-greataxe', 'bloodmoon-plate', 'master-alchemists-kit',
  'resonance-crystal',
];

describe('ICONNED_ITEM_IDS — Epic batch 4 union widen', () => {
  it('totals 44 unique ids', () => {
    expect(ICONNED_ITEM_IDS).toHaveLength(44);
    expect(new Set(ICONNED_ITEM_IDS).size).toBe(44);
  });

  it('preserves all 24 batch-1 entries exactly (union, not replace)', () => {
    for (const id of BATCH1_24) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('preserves all 9 batch-2 entries exactly (union, not replace)', () => {
    for (const id of BATCH2_9) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('preserves all 7 batch-3 entries exactly (union, not replace)', () => {
    for (const id of BATCH3_7) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('adds the 4 net-new Epic batch-4 ids', () => {
    for (const id of BATCH4_4) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('is exactly the 24 batch-1 + 9 batch-2 + 7 batch-3 + 4 batch-4 ids (no extras)', () => {
    expect(new Set(ICONNED_ITEM_IDS)).toEqual(
      new Set([...BATCH1_24, ...BATCH2_9, ...BATCH3_7, ...BATCH4_4]),
    );
  });
});

describe('ICONS map ⇄ ICONNED_ITEM_IDS coverage', () => {
  it('every iconned id has a dedicated ICONS component (no copper-coin fallback)', () => {
    for (const id of ICONNED_ITEM_IDS) {
      expect(ICONS[id], `ICONS['${id}'] missing`).toBeTypeOf('function');
    }
  });

  it('has a distinct component for each of the 4 batch-4 icons', () => {
    for (const id of BATCH4_4) expect(ICONS[id]).toBeTypeOf('function');
  });
});

describe('ICONNED_RECIPES — by-construction 10 → 12 (Epic capstone outputs iconned)', () => {
  const ids = ICONNED_RECIPES.map((r) => String(r.id)).sort();

  it('is exactly the 12 expected recipes, nothing else', () => {
    expect(ids).toEqual([
      'r-berserkers-greataxe',
      'r-ember-brand',
      'r-fire-oil',
      'r-greatsword',
      'r-healing-salve',
      'r-iron-shield',
      'r-master-alchemists-kit',
      'r-stamina-tonic',
      'r-steel-sword',
      'r-tower-shield',
      'r-treasure-sack',
      'r-venom-flask',
    ]);
  });

  it('switches ON the two Epic capstones (outputs now iconned; inputs iconned since batch 3)', () => {
    expect(ids).toContain('r-berserkers-greataxe');
    expect(ids).toContain('r-master-alchemists-kit');
  });

  it('keeps the batch-3 outputs on (r-greatsword / r-tower-shield / r-venom-flask)', () => {
    expect(ids).toContain('r-greatsword');
    expect(ids).toContain('r-tower-shield');
    expect(ids).toContain('r-venom-flask');
  });
});
